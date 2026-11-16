import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedUserContext } from '@/common/types';
import { DatabaseService } from '../../modules/database/database.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUserContext | undefined;

    if (!user) {
      throw new UnauthorizedException('Authentication required.');
    }

    // Platform users bypass merchant scoping when operating platform endpoints
    if (user.isPlatformUser) {
      return true;
    }

    if (!user.merchantId) {
      throw new ForbiddenException('User is not associated with an active merchant tenant.');
    }

    // Bind verified merchantId directly to request context
    request.merchantId = user.merchantId;

    // Check if client maliciously attempted to pass another merchant_id in body, query, or params
    const bodyMerchantId = request.body?.merchantId || request.body?.merchant_id;
    const queryMerchantId = request.query?.merchantId || request.query?.merchant_id;
    const paramsMerchantId = request.params?.merchantId || request.params?.merchant_id;

    if (
      (bodyMerchantId && bodyMerchantId !== user.merchantId) ||
      (queryMerchantId && queryMerchantId !== user.merchantId) ||
      (paramsMerchantId && paramsMerchantId !== user.merchantId)
    ) {
      throw new ForbiddenException('Cross-tenant data manipulation is strictly prohibited.');
    }

    // Check merchant subscription expiration
    const sub = await this.db.merchantSubscription.findFirst({
      where: { merchantId: user.merchantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, endDate: true },
    });

    if (
      !sub ||
      sub.status === 'CANCELLED' ||
      sub.status === 'EXPIRED' ||
      sub.endDate < new Date()
    ) {
      throw new ForbiddenException(
        'Your subscription has ended and your account access has expired. Please contact your platform administrator to renew or request a grace period extension.',
      );
    }

    return true;
  }
}
