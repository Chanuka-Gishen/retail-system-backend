import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from '../dto/warehouse.dto';
import { AuditAction } from '@/common/types';

@Injectable()
export class WarehouseService {
  private readonly logger = new Logger(WarehouseService.name);

  constructor(private db: DatabaseService) {}

  async listWarehouses(merchantId: string) {
    return this.db.warehouse.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { stockBalances: true, inventoryMovements: true },
        },
      },
    });
  }

  async getWarehouseById(merchantId: string, id: string) {
    const warehouse = await this.db.warehouse.findFirst({
      where: { id, merchantId },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${id} not found.`);
    }

    return warehouse;
  }

  async createWarehouse(merchantId: string, dto: CreateWarehouseDto, actorId: string) {
    // 1. Check Subscription Plan maxWarehouses Limit
    const activeSub = await this.db.merchantSubscription.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    if (activeSub) {
      const warehouseCount = await this.db.warehouse.count({ where: { merchantId } });
      if (warehouseCount >= activeSub.plan.maxWarehouses) {
        throw new ForbiddenException(
          `Warehouse limit reached (${activeSub.plan.maxWarehouses} warehouses max for ${activeSub.plan.name}). Please upgrade your plan.`,
        );
      }
    }

    // 2. Check Code Uniqueness within Merchant
    const existing = await this.db.warehouse.findUnique({
      where: {
        merchantId_code: {
          merchantId,
          code: dto.code.trim().toUpperCase(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Warehouse with code ${dto.code} already exists.`);
    }

    // 3. Create Warehouse
    const warehouse = await this.db.$transaction(async (tx) => {
      const w = await tx.warehouse.create({
        data: {
          merchantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          address: dto.address?.trim(),
          phone: dto.phone?.trim(),
          isMain: dto.isMain ?? false,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.CREATE as any,
          entityType: 'Warehouse',
          entityId: w.id,
          newValues: { code: w.code, name: w.name },
        },
      });

      return w;
    });

    this.logger.log(`Created warehouse ${warehouse.code} for merchant ${merchantId}`);
    return warehouse;
  }

  async updateWarehouse(
    merchantId: string,
    id: string,
    dto: UpdateWarehouseDto,
    actorId: string,
  ) {
    const warehouse = await this.db.warehouse.findFirst({ where: { id, merchantId } });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${id} not found.`);
    }

    const updated = await this.db.$transaction(async (tx) => {
      const w = await tx.warehouse.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.address !== undefined ? { address: dto.address?.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone?.trim() } : {}),
          ...(dto.isMain !== undefined ? { isMain: dto.isMain } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'Warehouse',
          entityId: w.id,
          oldValues: { name: warehouse.name, isMain: warehouse.isMain, isActive: warehouse.isActive },
          newValues: { name: w.name, isMain: w.isMain, isActive: w.isActive },
        },
      });

      return w;
    });

    return updated;
  }
}
