import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUserContext, PlatformUserRole, MerchantUserRole } from '@/common/types';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUserContext | undefined;

    if (!user) {
      throw new ForbiddenException('Access denied: unauthenticated.');
    }

    // Super Admin and Merchant Owner have wildcard administrative permissions
    if (
      user.role === PlatformUserRole.SUPER_ADMIN ||
      user.role === MerchantUserRole.MERCHANT_OWNER
    ) {
      return true;
    }

    const userPermissions = new Set(user.permissions || []);
    const hasAllRequired = requiredPermissions.every((perm) => userPermissions.has(perm));

    if (!hasAllRequired) {
      throw new ForbiddenException('Access denied: insufficient permissions.');
    }

    return true;
  }
}
