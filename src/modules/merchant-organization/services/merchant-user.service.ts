import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';
import { CreateMerchantStaffDto, UpdateMerchantStaffDto } from '../dto/user.dto';
import { AuditAction, MerchantUserRole } from '@/common/types';

@Injectable()
export class MerchantUserService {
  private readonly logger = new Logger(MerchantUserService.name);

  constructor(
    private db: DatabaseService,
    private redis: RedisService,
  ) {}

  async getUserQuota(merchantId: string) {
    const userCount = await this.db.merchantUser.count({ where: { merchantId } });
    const activeSub = await this.db.merchantSubscription.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    const maxUsers = activeSub?.plan?.maxUsers ?? 1;
    const planName = activeSub?.plan?.name ?? 'Standard Plan';
    const planCode = activeSub?.plan?.code ?? 'STANDARD';

    return {
      currentUsers: userCount,
      maxUsers,
      planName,
      planCode,
      isLimitReached: userCount >= maxUsers,
      remainingSlots: Math.max(0, maxUsers - userCount),
    };
  }

  async listUsers(merchantId: string) {
    return this.db.merchantUser.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        merchantId: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        customRoleId: true,
        isActive: true,
        isOwner: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        customRole: true,
        branchAccess: {
          include: { branch: { select: { id: true, code: true, name: true, isMain: true } } },
        },
        warehouseAccess: {
          include: { warehouse: { select: { id: true, code: true, name: true, isMain: true } } },
        },
      },
    });
  }

  async getUserById(merchantId: string, id: string) {
    const user = await this.db.merchantUser.findFirst({
      where: { id, merchantId },
      select: {
        id: true,
        merchantId: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        customRoleId: true,
        isActive: true,
        isOwner: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        customRole: true,
        branchAccess: {
          include: { branch: { select: { id: true, code: true, name: true, isMain: true } } },
        },
        warehouseAccess: {
          include: { warehouse: { select: { id: true, code: true, name: true, isMain: true } } },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User ${id} not found.`);
    }

    return user;
  }

  async createUser(merchantId: string, dto: CreateMerchantStaffDto, actorId: string) {
    // 1. Check Subscription Plan maxUsers Limit
    const activeSub = await this.db.merchantSubscription.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    const maxUsers = activeSub?.plan?.maxUsers ?? 1;
    const planName = activeSub?.plan?.name ?? 'Basic Plan';
    const userCount = await this.db.merchantUser.count({ where: { merchantId } });

    if (userCount >= maxUsers) {
      throw new ForbiddenException(
        `Staff user subscription limit reached (${userCount}/${maxUsers} max users for ${planName}). Please upgrade your subscription plan to add more staff.`,
      );
    }

    // 2. Check Email Uniqueness within Merchant
    const existing = await this.db.merchantUser.findUnique({
      where: {
        merchantId_email: {
          merchantId,
          email: dto.email.trim().toLowerCase(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(`User with email ${dto.email} already exists in your organization.`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.db.$transaction(async (tx) => {
      const u = await tx.merchantUser.create({
        data: {
          merchantId,
          email: dto.email.trim().toLowerCase(),
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          phone: dto.phone?.trim(),
          role: dto.role as any,
          customRoleId: dto.role === MerchantUserRole.CUSTOM ? dto.customRoleId : null,
          isOwner: false,
          isActive: true,
        },
      });

      // Branch Scoping Access
      if (dto.branchIds && dto.branchIds.length > 0) {
        await tx.merchantUserBranchAccess.createMany({
          data: dto.branchIds.map((bId) => ({
            merchantUserId: u.id,
            branchId: bId,
          })),
        });
      }

      // Warehouse Scoping Access
      if (dto.warehouseIds && dto.warehouseIds.length > 0) {
        await tx.merchantUserWarehouseAccess.createMany({
          data: dto.warehouseIds.map((wId) => ({
            merchantUserId: u.id,
            warehouseId: wId,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.CREATE as any,
          entityType: 'MerchantUser',
          entityId: u.id,
          newValues: { email: u.email, role: u.role },
        },
      });

      return u;
    });

    this.logger.log(`Created merchant staff user: ${user.email} (${user.role}) for merchant ${merchantId}`);
    return this.getUserById(merchantId, user.id);
  }

  async updateUser(
    merchantId: string,
    id: string,
    dto: UpdateMerchantStaffDto,
    actorId: string,
  ) {
    const user = await this.db.merchantUser.findFirst({ where: { id, merchantId } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found.`);
    }

    if (user.isOwner && dto.isActive === false) {
      throw new ForbiddenException('The organization primary owner cannot be deactivated.');
    }

    if (user.isOwner && dto.role && dto.role !== MerchantUserRole.MERCHANT_OWNER) {
      throw new ForbiddenException('The organization primary owner role cannot be downgraded.');
    }

    let passwordHash: string | undefined;
    if (dto.password && dto.password.trim().length >= 8) {
      passwordHash = await bcrypt.hash(dto.password.trim(), 10);
    }

    const updated = await this.db.$transaction(async (tx) => {
      const u = await tx.merchantUser.update({
        where: { id },
        data: {
          ...(dto.firstName ? { firstName: dto.firstName.trim() } : {}),
          ...(dto.lastName ? { lastName: dto.lastName.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone?.trim() } : {}),
          ...(dto.role ? { role: dto.role as any } : {}),
          ...(dto.customRoleId !== undefined ? { customRoleId: dto.customRoleId } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(passwordHash ? { passwordHash } : {}),
        },
      });

      // Update Branch Access if provided
      if (dto.branchIds) {
        await tx.merchantUserBranchAccess.deleteMany({ where: { merchantUserId: id } });
        if (dto.branchIds.length > 0) {
          await tx.merchantUserBranchAccess.createMany({
            data: dto.branchIds.map((bId) => ({
              merchantUserId: id,
              branchId: bId,
            })),
          });
        }
      }

      // Update Warehouse Access if provided
      if (dto.warehouseIds) {
        await tx.merchantUserWarehouseAccess.deleteMany({ where: { merchantUserId: id } });
        if (dto.warehouseIds.length > 0) {
          await tx.merchantUserWarehouseAccess.createMany({
            data: dto.warehouseIds.map((wId) => ({
              merchantUserId: id,
              warehouseId: wId,
            })),
          });
        }
      }

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'MerchantUser',
          entityId: u.id,
          newValues: { role: u.role, isActive: u.isActive },
        },
      });

      return u;
    });

    // Invalidate Redis sessions so permission or role changes take effect immediately
    await this.redis.revokeAllUserSessions(id);

    return this.getUserById(merchantId, updated.id);
  }
}
