import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUserContext, PlatformUserRole } from '@/common/types';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUserContext | undefined;

    if (!user || !user.isPlatformUser) {
      throw new ForbiddenException('Access restricted to Platform Administrators.');
    }

    // Role check: PLATFORM_VIEWER has read-only permissions across platform administration
    if (user.role === PlatformUserRole.PLATFORM_VIEWER) {
      const method = (request.method || '').toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        throw new ForbiddenException(
          'Access denied: Viewer accounts have read-only permissions across platform administration.',
        );
      }
    }

    return true;
  }
}
