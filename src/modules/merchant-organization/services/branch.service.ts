import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateBranchDto, UpdateBranchDto } from '../dto/branch.dto';
import { AuditAction } from '@/common/types';

@Injectable()
export class BranchService {
  private readonly logger = new Logger(BranchService.name);

  constructor(private db: DatabaseService) {}

  async listBranches(merchantId: string) {
    return this.db.branch.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
      include: {
        defaultWarehouse: {
          select: { id: true, code: true, name: true },
        },
        _count: {
          select: { posTerminals: true, sales: true },
        },
      },
    });
  }

  async getBranchById(merchantId: string, id: string) {
    const branch = await this.db.branch.findFirst({
      where: { id, merchantId },
      include: {
        defaultWarehouse: true,
        posTerminals: true,
      },
    });

    if (!branch) {
      throw new NotFoundException(`Branch ${id} not found.`);
    }

    return branch;
  }

  async createBranch(merchantId: string, dto: CreateBranchDto, actorId: string) {
    // 1. Check Subscription Plan maxBranches Limit
    const activeSub = await this.db.merchantSubscription.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    if (activeSub) {
      const branchCount = await this.db.branch.count({ where: { merchantId } });
      if (branchCount >= activeSub.plan.maxBranches) {
        throw new ForbiddenException(
          `Branch limit reached (${activeSub.plan.maxBranches} branches max for ${activeSub.plan.name}). Please upgrade your plan.`,
        );
      }
    }

    // 2. Check Code Uniqueness within Merchant
    const existing = await this.db.branch.findUnique({
      where: {
        merchantId_code: {
          merchantId,
          code: dto.code.trim().toUpperCase(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Branch with code ${dto.code} already exists.`);
    }

    // 3. Create Branch
    const branch = await this.db.$transaction(async (tx) => {
      const b = await tx.branch.create({
        data: {
          merchantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          address: dto.address?.trim(),
          phone: dto.phone?.trim(),
          isMain: dto.isMain ?? false,
          defaultWarehouseId: dto.defaultWarehouseId,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.CREATE as any,
          entityType: 'Branch',
          entityId: b.id,
          newValues: { code: b.code, name: b.name },
        },
      });

      return b;
    });

    this.logger.log(`Created branch ${branch.code} for merchant ${merchantId}`);
    return branch;
  }

  async updateBranch(merchantId: string, id: string, dto: UpdateBranchDto, actorId: string) {
    const branch = await this.db.branch.findFirst({ where: { id, merchantId } });
    if (!branch) {
      throw new NotFoundException(`Branch ${id} not found.`);
    }

    const updated = await this.db.$transaction(async (tx) => {
      const b = await tx.branch.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.address !== undefined ? { address: dto.address?.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone?.trim() } : {}),
          ...(dto.isMain !== undefined ? { isMain: dto.isMain } : {}),
          ...(dto.defaultWarehouseId !== undefined ? { defaultWarehouseId: dto.defaultWarehouseId } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'Branch',
          entityId: b.id,
          oldValues: { name: branch.name, isMain: branch.isMain, isActive: branch.isActive },
          newValues: { name: b.name, isMain: b.isMain, isActive: b.isActive },
        },
      });

      return b;
    });

    return updated;
  }
}
