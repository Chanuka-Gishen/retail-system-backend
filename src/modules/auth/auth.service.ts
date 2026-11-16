import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { PlatformLoginDto, MerchantLoginDto } from './dto/login.dto';
import {
  PlatformJwtPayload,
  MerchantJwtPayload,
  AuthenticatedUserContext,
  PlatformUserRole,
  MerchantStatus,
  MerchantUserRole,
  SubscriptionStatus,
} from '@/common/types';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;

  constructor(
    private db: DatabaseService,
    private redis: RedisService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {
    this.accessSecret = this.config.get<string>(
      'JWT_ACCESS_SECRET',
      'super-secret-jwt-access-key-development-minimum-32-chars',
    );
    this.refreshSecret = this.config.get<string>(
      'JWT_REFRESH_SECRET',
      'super-secret-jwt-refresh-key-development-minimum-32-chars',
    );
    this.accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '900s');
    this.refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // ==========================================
  // PLATFORM LOGIN
  // ==========================================
  async loginPlatform(dto: PlatformLoginDto, userAgent?: string, ip?: string) {
    const user = await this.db.platformUser.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Your platform account has been deactivated.');
    }

    const sessionId = crypto.randomUUID();

    const accessPayload: PlatformJwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as unknown as PlatformUserRole,
      isPlatformUser: true,
      type: 'access',
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresIn,
      jwtid: crypto.randomUUID(),
    });

    const refreshPayload = {
      sub: user.id,
      sessionId,
      isPlatformUser: true,
      type: 'refresh',
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresIn,
    });

    // Save session in Redis
    await this.redis.saveSession(
      user.id,
      sessionId,
      {
        refreshTokenHash: this.hashToken(refreshToken),
        userAgent,
        ip,
      },
      7 * 24 * 3600,
    );

    // Update last login
    await this.db.platformUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isPlatformUser: true,
      },
    };
  }

  // ==========================================
  // MERCHANT LOGIN
  // ==========================================
  async loginMerchant(dto: MerchantLoginDto, userAgent?: string, ip?: string) {
    const email = dto.email.toLowerCase().trim();

    const users = await this.db.merchantUser.findMany({
      where: {
        email,
        ...(dto.merchantCode ? { merchant: { code: dto.merchantCode } } : {}),
      },
      include: {
        merchant: true,
        customRole: true,
        branchAccess: true,
        warehouseAccess: true,
      },
    });

    if (users.length === 0) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (users.length > 1 && !dto.merchantCode) {
      throw new BadRequestException({
        responseCode: 'ERR_MULTIPLE_MERCHANTS',
        message: 'Multiple merchant accounts found for this email. Please specify merchantCode.',
      });
    }

    const user = users[0]!;

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Your merchant user account has been disabled.');
    }

    if (user.merchant.status !== MerchantStatus.ACTIVE) {
      throw new ForbiddenException(
        `Merchant account is currently ${user.merchant.status.toLowerCase().replace('_', ' ')}. Please contact support.`,
      );
    }

    // Verify merchant subscription validity & expiration
    const latestSub = await this.db.merchantSubscription.findFirst({
      where: { merchantId: user.merchantId },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestSub) {
      throw new ForbiddenException(
        'No active subscription found for this merchant organization. Please contact platform administration to activate your plan.',
      );
    }

    const now = new Date();

    if (latestSub.status === SubscriptionStatus.CANCELLED) {
      throw new ForbiddenException(
        'Your merchant subscription has been cancelled. Please contact platform administration to reactivate your subscription.',
      );
    }

    if (latestSub.endDate < now) {
      if (latestSub.status === SubscriptionStatus.ACTIVE) {
        await this.db.merchantSubscription
          .update({
            where: { id: latestSub.id },
            data: { status: SubscriptionStatus.EXPIRED as any },
          })
          .catch(() => null);
      }
      throw new ForbiddenException(
        'Your subscription has ended and your account access has expired. Please send your bank transfer renewal receipt to your administrator or request a grace period extension.',
      );
    }

    if (latestSub.status === SubscriptionStatus.EXPIRED) {
      throw new ForbiddenException(
        'Your subscription has expired. Please send your bank transfer renewal receipt to your administrator to renew.',
      );
    }

    if (
      latestSub.status === SubscriptionStatus.TRIALING &&
      latestSub.trialEndsAt &&
      latestSub.trialEndsAt < now
    ) {
      throw new ForbiddenException(
        'Your free trial has ended. Please send your bank transfer payment receipt to your administrator to start a subscription.',
      );
    }

    const sessionId = crypto.randomUUID();

    // Resolve assigned branch & warehouse IDs
    const branchIds = user.branchAccess.map((b) => b.branchId);
    const warehouseIds = user.warehouseAccess.map((w) => w.warehouseId);

    // Resolve fine-grained permissions
    let permissions: string[] = [];
    if (user.role === 'MERCHANT_OWNER') {
      permissions = ['*'];
    } else if (user.customRole && Array.isArray(user.customRole.permissions)) {
      permissions = user.customRole.permissions as string[];
    } else {
      permissions = this.getDefaultRolePermissions(user.role as unknown as MerchantUserRole);
    }

    const accessPayload: MerchantJwtPayload = {
      sub: user.id,
      merchantId: user.merchantId,
      email: user.email,
      role: user.role as unknown as MerchantUserRole,
      branchIds,
      warehouseIds,
      permissions,
      isPlatformUser: false,
      type: 'access',
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresIn,
      jwtid: crypto.randomUUID(),
    });

    const refreshPayload = {
      sub: user.id,
      merchantId: user.merchantId,
      sessionId,
      isPlatformUser: false,
      type: 'refresh',
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresIn,
    });

    // Save session in Redis
    await this.redis.saveSession(
      user.id,
      sessionId,
      {
        refreshTokenHash: this.hashToken(refreshToken),
        userAgent,
        ip,
      },
      7 * 24 * 3600,
    );

    // Update last login
    await this.db.merchantUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        merchantId: user.merchantId,
        merchantCode: user.merchant.code,
        merchantName: user.merchant.businessName,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        branchIds,
        warehouseIds,
        permissions,
        isPlatformUser: false,
      },
    };
  }

  // ==========================================
  // TOKEN ROTATION & REFRESH WITH REUSE DETECTION
  // ==========================================
  async refreshTokens(rawRefreshToken: string, userAgent?: string, ip?: string) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    let decoded: any;
    try {
      decoded = this.jwtService.verify(rawRefreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    if (decoded.type !== 'refresh' || !decoded.sessionId) {
      throw new UnauthorizedException('Malformed token type.');
    }

    const userId = decoded.sub;
    const oldSessionId = decoded.sessionId;
    const isPlatform = decoded.isPlatformUser;

    const existingSession = await this.redis.getSession(userId, oldSessionId);

    // Token reuse detection!
    // If session is missing or the hash does not match, a token reuse attack may be occurring
    const incomingHash = this.hashToken(rawRefreshToken);
    if (!existingSession || existingSession.refreshTokenHash !== incomingHash) {
      this.logger.warn(`Security alert: Refresh token reuse detected for user ${userId}. Revoking all sessions.`);
      await this.redis.revokeAllUserSessions(userId);
      throw new UnauthorizedException(
        'Security violation: Refresh token reuse detected. All active sessions have been terminated.',
      );
    }

    // Invalidate the old session
    await this.redis.deleteSession(userId, oldSessionId);

    // Generate new rotating session
    const newSessionId = crypto.randomUUID();

    if (isPlatform) {
      const user = await this.db.platformUser.findUnique({ where: { id: userId } });
      if (!user || !user.isActive) {
        throw new ForbiddenException('Account deactivated.');
      }

      const accessPayload: PlatformJwtPayload = {
        sub: user.id,
        email: user.email,
        role: user.role as unknown as PlatformUserRole,
        isPlatformUser: true,
        type: 'access',
      };

      const newAccessToken = this.jwtService.sign(accessPayload, {
        secret: this.accessSecret,
        expiresIn: this.accessExpiresIn,
        jwtid: crypto.randomUUID(),
      });

      const newRefreshToken = this.jwtService.sign(
        {
          sub: user.id,
          sessionId: newSessionId,
          isPlatformUser: true,
          type: 'refresh',
        },
        { secret: this.refreshSecret, expiresIn: this.refreshExpiresIn },
      );

      await this.redis.saveSession(
        user.id,
        newSessionId,
        {
          refreshTokenHash: this.hashToken(newRefreshToken),
          userAgent,
          ip,
        },
        7 * 24 * 3600,
      );

      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } else {
      const user = await this.db.merchantUser.findUnique({
        where: { id: userId },
        include: {
          merchant: true,
          customRole: true,
          branchAccess: true,
          warehouseAccess: true,
        },
      });

      if (!user || !user.isActive || user.merchant.status !== MerchantStatus.ACTIVE) {
        throw new ForbiddenException('Merchant user or tenant is no longer active.');
      }

      const branchIds = user.branchAccess.map((b) => b.branchId);
      const warehouseIds = user.warehouseAccess.map((w) => w.warehouseId);
      const permissions =
        user.role === 'MERCHANT_OWNER'
          ? ['*']
          : user.customRole && Array.isArray(user.customRole.permissions)
            ? (user.customRole.permissions as string[])
            : this.getDefaultRolePermissions(user.role as unknown as MerchantUserRole);

      const accessPayload: MerchantJwtPayload = {
        sub: user.id,
        merchantId: user.merchantId,
        email: user.email,
        role: user.role as unknown as MerchantUserRole,
        branchIds,
        warehouseIds,
        permissions,
        isPlatformUser: false,
        type: 'access',
      };

      const newAccessToken = this.jwtService.sign(accessPayload, {
        secret: this.accessSecret,
        expiresIn: this.accessExpiresIn,
        jwtid: crypto.randomUUID(),
      });

      const newRefreshToken = this.jwtService.sign(
        {
          sub: user.id,
          merchantId: user.merchantId,
          sessionId: newSessionId,
          isPlatformUser: false,
          type: 'refresh',
        },
        { secret: this.refreshSecret, expiresIn: this.refreshExpiresIn },
      );

      await this.redis.saveSession(
        user.id,
        newSessionId,
        {
          refreshTokenHash: this.hashToken(newRefreshToken),
          userAgent,
          ip,
        },
        7 * 24 * 3600,
      );

      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    }
  }

  // ==========================================
  // LOGOUT
  // ==========================================
  async logout(rawRefreshToken?: string) {
    if (!rawRefreshToken) return;
    try {
      const decoded: any = this.jwtService.verify(rawRefreshToken, {
        secret: this.refreshSecret,
      });
      if (decoded?.sub && decoded?.sessionId) {
        await this.redis.deleteSession(decoded.sub, decoded.sessionId);
      }
    } catch {
      // Ignore token verification errors during logout
    }
  }

  // ==========================================
  // INTROSPECTION (/api/v1/auth/me)
  // ==========================================
  async getMe(userContext: AuthenticatedUserContext) {
    if (userContext.isPlatformUser) {
      const user = await this.db.platformUser.findUnique({
        where: { id: userContext.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });
      return { ...user, isPlatformUser: true };
    }

    const user = await this.db.merchantUser.findUnique({
      where: { id: userContext.userId },
      include: {
        merchant: {
          select: {
            id: true,
            code: true,
            businessName: true,
            tradeName: true,
            currency: true,
            timezone: true,
            status: true,
          },
        },
        branchAccess: {
          include: {
            branch: {
              select: { id: true, code: true, name: true, isMain: true },
            },
          },
        },
        warehouseAccess: {
          include: {
            warehouse: {
              select: { id: true, code: true, name: true, isMain: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists.');
    }

    return {
      id: user.id,
      merchantId: user.merchantId,
      merchant: user.merchant,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      isOwner: user.isOwner,
      branches: user.branchAccess.map((b) => b.branch),
      warehouses: user.warehouseAccess.map((w) => w.warehouse),
      permissions: userContext.permissions,
      isPlatformUser: false,
    };
  }

  // Helper: Default permissions per role
  private getDefaultRolePermissions(role: MerchantUserRole): string[] {
    switch (role) {
      case MerchantUserRole.MERCHANT_ADMIN:
        return [
          'merchant.settings.view',
          'merchant.settings.edit',
          'merchant.users.manage',
          'merchant.branches.manage',
          'merchant.warehouses.manage',
          'catalog.product.manage',
          'inventory.manage',
          'purchasing.manage',
          'pos.manage',
          'accounting.view',
          'reports.view',
        ];
      case MerchantUserRole.BRANCH_MANAGER:
        return [
          'pos.session.open',
          'pos.session.close',
          'pos.sale.create',
          'pos.sale.view',
          'pos.return.process',
          'inventory.balance.view',
          'inventory.transfer.create',
          'inventory.transfer.receive',
          'reports.branch.view',
        ];
      case MerchantUserRole.CASHIER:
        return [
          'pos.session.open',
          'pos.session.close',
          'pos.sale.create',
          'pos.sale.view',
          'pos.return.process',
          'catalog.product.view',
          'customer.view',
          'customer.create',
        ];
      case MerchantUserRole.INVENTORY_CLERK:
        return [
          'catalog.product.view',
          'inventory.balance.view',
          'inventory.movement.view',
          'inventory.adjustment.create',
          'inventory.transfer.create',
          'inventory.transfer.receive',
          'purchasing.grn.create',
        ];
      case MerchantUserRole.ACCOUNTANT:
        return [
          'accounting.coa.manage',
          'accounting.journal.manage',
          'accounting.reports.view',
          'sales.reports.view',
          'purchasing.reports.view',
        ];
      default:
        return ['pos.sale.create'];
    }
  }
}
