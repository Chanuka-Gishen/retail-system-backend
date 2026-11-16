import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateStockAdjustmentDto } from '../dto/stock-adjustment.dto';
import { ListAdjustmentsQueryDto } from '../dto/inventory-query.dto';
import { MovementType, Prisma } from '@prisma/client';

@Injectable()
export class StockAdjustmentService {
  constructor(private db: DatabaseService) {}

  async createAdjustment(merchantId: string, dto: CreateStockAdjustmentDto, actorId: string) {
    // 1. Validate Warehouse
    const warehouse = await this.db.warehouse.findFirst({
      where: { id: dto.warehouseId, merchantId, isActive: true },
    });

    if (!warehouse) {
      throw new NotFoundException(`Active warehouse with ID ${dto.warehouseId} not found.`);
    }

    // 2. Validate all Variants belong to this merchant
    const variantIds = dto.items.map((i) => i.variantId);
    const variants = await this.db.productVariant.findMany({
      where: {
        id: { in: variantIds },
        merchantId,
      },
    });

    if (variants.length !== variantIds.length) {
      throw new BadRequestException('One or more product variants were not found or do not belong to this merchant.');
    }

    const variantMap = new Map<string, (typeof variants)[0]>(
      variants.map((v) => [v.id, v]),
    );

    // 3. Generate unique adjustment number
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const adjustmentNumber = `ADJ-${todayStr}-${randomDigits}`;

    // 4. Atomic Execution Transaction
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      // 4.1 Create StockAdjustment header
      const adjustment = await tx.stockAdjustment.create({
        data: {
          merchantId,
          warehouseId: dto.warehouseId,
          adjustmentNumber,
          reason: dto.reason.trim(),
          createdById: actorId,
        },
      });

      const processedItems = [];

      // 4.2 Process each item atomically
      for (const item of dto.items) {
        const variant = variantMap.get(item.variantId)!;

        // Fetch or create stock balance record
        let stockBalance = await tx.stockBalance.findUnique({
          where: {
            merchantId_warehouseId_variantId: {
              merchantId,
              warehouseId: dto.warehouseId,
              variantId: item.variantId,
            },
          },
        });

        if (!stockBalance) {
          stockBalance = await tx.stockBalance.create({
            data: {
              merchantId,
              warehouseId: dto.warehouseId,
              variantId: item.variantId,
              quantityOnHand: 0,
              quantityAllocated: 0,
              quantityAvailable: 0,
            },
          });
        }

        const currentOnHand = Number(stockBalance.quantityOnHand);
        const currentAllocated = Number(stockBalance.quantityAllocated);

        // Validation for negative stock deductions
        if (item.type === 'NEGATIVE' && currentOnHand < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for variant "${variant.sku}". Current stock: ${currentOnHand}, requested adjustment: -${item.quantity}`,
          );
        }

        const delta = item.type === 'POSITIVE' ? item.quantity : -item.quantity;
        const newOnHand = currentOnHand + delta;
        const newAvailable = Math.max(0, newOnHand - currentAllocated);
        const unitCost = item.unitCost !== undefined ? item.unitCost : Number(variant.costPrice);

        // Update Stock Balance
        await tx.stockBalance.update({
          where: { id: stockBalance.id },
          data: {
            quantityOnHand: newOnHand,
            quantityAvailable: newAvailable,
          },
        });

        // Create StockAdjustmentItem
        const createdItem = await tx.stockAdjustmentItem.create({
          data: {
            adjustmentId: adjustment.id,
            variantId: item.variantId,
            type: item.type,
            quantity: item.quantity,
            unitCost,
          },
        });

        // Strictly Append-Only InventoryMovement Ledger Record
        await tx.inventoryMovement.create({
          data: {
            merchantId,
            warehouseId: dto.warehouseId,
            variantId: item.variantId,
            movementType:
              item.type === 'POSITIVE'
                ? MovementType.ADJUSTMENT_POSITIVE
                : MovementType.ADJUSTMENT_NEGATIVE,
            quantity: delta,
            unitCost,
            runningBalance: newOnHand,
            referenceType: 'ADJUSTMENT',
            referenceId: adjustment.id,
            notes: `Stock adjustment ${adjustmentNumber}: ${dto.reason.trim()}`,
            createdById: actorId,
          },
        });

        processedItems.push({
          ...createdItem,
          variant: {
            id: variant.id,
            sku: variant.sku,
            productName: variant.sku,
          },
          previousOnHand: currentOnHand,
          newOnHand,
        });
      }

      return {
        ...adjustment,
        warehouse: {
          id: warehouse.id,
          code: warehouse.code,
          name: warehouse.name,
        },
        items: processedItems,
      };
    });
  }

  async listAdjustments(merchantId: string, query: ListAdjustmentsQueryDto) {
    const { warehouseId, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.StockAdjustmentWhereInput = {
      merchantId,
      ...(warehouseId && { warehouseId }),
      ...(search && {
        OR: [
          { adjustmentNumber: { contains: search, mode: 'insensitive' } },
          { reason: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.db.stockAdjustment.count({ where }),
      this.db.stockAdjustment.findMany({
        where,
        skip,
        take: limit,
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
          items: {
            include: {
              variant: {
                select: {
                  id: true,
                  sku: true,
                  barcode: true,
                  product: { select: { id: true, name: true, unit: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAdjustmentById(merchantId: string, id: string) {
    const adjustment = await this.db.stockAdjustment.findFirst({
      where: { id, merchantId },
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        items: {
          include: {
            variant: {
              select: {
                id: true,
                sku: true,
                barcode: true,
                costPrice: true,
                product: { select: { id: true, name: true, unit: true } },
              },
            },
          },
        },
      },
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment ${id} not found.`);
    }

    return adjustment;
  }
}
