import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { DatabaseService } from '../../database/database.service';
import { CreatePlatformUserDto, UpdatePlatformUserDto } from '../dto/platform-users.dto';
import { PlatformUserRole } from '@/common/types';

@Injectable()
export class PlatformUsersService {
  private readonly logger = new Logger(PlatformUsersService.name);

  constructor(private db: DatabaseService) {}

  async listUsers() {
    return this.db.platformUser.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getUserById(id: string) {
    const user = await this.db.platformUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`Platform user ${id} not found.`);
    }

    return user;
  }

  async createUser(dto: CreatePlatformUserDto, actorId: string) {
    const existing = await this.db.platformUser.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });

    if (existing) {
      throw new ConflictException(`Platform user with email "${dto.email}" already exists.`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.db.platformUser.create({
      data: {
        email: dto.email.trim().toLowerCase(),
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        role: dto.role as any,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    this.logger.log(`Created platform user ${user.email} with role ${user.role} by actor ${actorId}`);
    return user;
  }

  async updateUser(id: string, dto: UpdatePlatformUserDto, actorId: string) {
    const user = await this.db.platformUser.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Platform user ${id} not found.`);
    }

    // Protection: Prevent self-deactivation of logged in superadmin
    if (id === actorId && dto.isActive === false) {
      throw new ForbiddenException('You cannot deactivate your own account.');
    }

    // Protection: Prevent deactivation or role-downgrade of last active superadmin
    if (user.role === PlatformUserRole.SUPER_ADMIN) {
      const willLoseSuperAdmin =
        (dto.role && dto.role !== PlatformUserRole.SUPER_ADMIN) || dto.isActive === false;

      if (willLoseSuperAdmin) {
        const superAdminCount = await this.db.platformUser.count({
          where: { role: PlatformUserRole.SUPER_ADMIN, isActive: true },
        });

        if (superAdminCount <= 1) {
          throw new ForbiddenException(
            'Cannot deactivate or downgrade the only active Super Admin on the platform.',
          );
        }
      }
    }

    let passwordHash: string | undefined;
    if (dto.password && dto.password.trim().length >= 8) {
      passwordHash = await bcrypt.hash(dto.password.trim(), 10);
    }

    const updated = await this.db.platformUser.update({
      where: { id },
      data: {
        ...(dto.firstName ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.role ? { role: dto.role as any } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        updatedAt: true,
      },
    });

    this.logger.log(`Updated platform user ${updated.email} (${id}) by actor ${actorId}`);
    return updated;
  }

  async deleteUser(id: string, actorId: string) {
    const user = await this.db.platformUser.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Platform user ${id} not found.`);
    }

    if (id === actorId) {
      throw new ForbiddenException('You cannot delete your own account.');
    }

    if (user.role === PlatformUserRole.SUPER_ADMIN) {
      const superAdminCount = await this.db.platformUser.count({
        where: { role: PlatformUserRole.SUPER_ADMIN },
      });
      if (superAdminCount <= 1) {
        throw new ForbiddenException('Cannot delete the only Super Admin on the platform.');
      }
    }

    await this.db.platformUser.delete({ where: { id } });
    this.logger.log(`Deleted platform user ${user.email} (${id}) by actor ${actorId}`);
    return { success: true, message: `Platform user ${user.email} deleted successfully.` };
  }
}
