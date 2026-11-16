import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ListStockBalancesQueryDto, ListMovementsQueryDto } from '../dto/inventory-query.dto';
import {
  ListBatchesQueryDto,
  CreateBatchDto,
  UpdateBatchDto,
  BatchExpiryStatus,
} from '../dto/batch.dto';
import { Prisma, MovementType } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private db: DatabaseService) {}

  async listBalances(merchantId: string, query: ListStockBalancesQueryDto) {
    const { warehouseId, variantId, productId, search, lowStock, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.StockBalanceWhereInput = {
      merchantId,
      ...(warehouseId && { warehouseId }),
      ...(variantId && { variantId }),
      ...(productId && {
        variant: {
          productId,
        },
      }),
      ...(search && {
        OR: [
          { variant: { sku: { contains: search, mode: 'insensitive' } } },
          { variant: { barcode: { contains: search, mode: 'insensitive' } } },
          { variant: { product: { name: { contains: search, mode: 'insensitive' } } } },
        ],
      }),
    };

    // If low stock requested, fetch balances where quantityOnHand <= variant.reorderPoint
    if (lowStock) {
      // Find variants with low stock in the warehouse / merchant
      const lowStockRecords = await this.db.$queryRaw<Array<{ id: string }>>`
        SELECT sb.id
        FROM stock_balances sb
        JOIN product_variants pv ON sb.variant_id = pv.id
        WHERE sb.merchant_id = ${merchantId}::uuid
          ${warehouseId ? Prisma.sql`AND sb.warehouse_id = ${warehouseId}::uuid` : Prisma.empty}
          ${variantId ? Prisma.sql`AND sb.variant_id = ${variantId}::uuid` : Prisma.empty}
          AND sb.quantity_on_hand <= pv.reorder_point
      `;
      const matchingIds = lowStockRecords.map((r: { id: string }) => r.id);
      where.id = { in: matchingIds };
    }

    const [total, items] = await Promise.all([
      this.db.stockBalance.count({ where }),
      this.db.stockBalance.findMany({
        where,
        skip,
        take: limit,
        include: {
          warehouse: {
            select: { id: true, code: true, name: true, isMain: true },
          },
          variant: {
            include: {
              product: {
                select: { id: true, code: true, name: true, unit: true, imageUrl: true },
              },
            },
          },
        },
        orderBy: [{ variant: { product: { name: 'asc' } } }, { warehouse: { name: 'asc' } }],
      }),
    ]);

    // Calculate aggregated inventory valuation for the merchant/warehouse
    const valuationAggregate = await this.db.$queryRaw<Array<{ total_units: number; total_valuation: number }>>`
      SELECT 
        COALESCE(SUM(sb.quantity_on_hand), 0)::float AS total_units,
        COALESCE(SUM(sb.quantity_on_hand * pv.cost_price), 0)::float AS total_valuation
      FROM stock_balances sb
      JOIN product_variants pv ON sb.variant_id = pv.id
      WHERE sb.merchant_id = ${merchantId}::uuid
        ${warehouseId ? Prisma.sql`AND sb.warehouse_id = ${warehouseId}::uuid` : Prisma.empty}
    `;

    const summary = valuationAggregate[0] || { total_units: 0, total_valuation: 0 };

    return {
      items,
      summary: {
        totalUnitsOnHand: summary.total_units,
        totalInventoryValuation: summary.total_valuation,
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getBalance(merchantId: string, warehouseId: string, variantId: string) {
    const balance = await this.db.stockBalance.findUnique({
      where: {
        merchantId_warehouseId_variantId: {
          merchantId,
          warehouseId,
          variantId,
        },
      },
      include: {
        warehouse: {
          select: { id: true, code: true, name: true, isMain: true },
        },
        variant: {
          include: {
            product: {
              select: { id: true, code: true, name: true, unit: true },
            },
          },
        },
      },
    });

    if (!balance) {
      throw new NotFoundException('Stock balance record not found.');
    }

    return balance;
  }

  async getItemDetails(merchantId: string, variantId: string) {
    const variant = await this.db.productVariant.findFirst({
      where: { id: variantId, merchantId },
      include: {
        product: {
          include: {
            category: true,
            brand: true,
            taxProfile: true,
          },
        },
        stockBalances: {
          include: {
            warehouse: {
              select: {
                id: true,
                code: true,
                name: true,
                isMain: true,
              },
            },
          },
        },
      },
    });

    if (!variant) {
      throw new NotFoundException(`Product variant ${variantId} not found.`);
    }

    const batches = await this.db.productBatch.findMany({
      where: { merchantId, variantId },
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });

    const recentMovements = await this.db.inventoryMovement.findMany({
      where: { merchantId, variantId },
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    let totalOnHand = 0;
    let totalAllocated = 0;
    let totalAvailable = 0;

    for (const sb of variant.stockBalances) {
      totalOnHand += Number(sb.quantityOnHand || 0);
      totalAllocated += Number(sb.quantityAllocated || 0);
      totalAvailable += Number(sb.quantityAvailable || 0);
    }

    const costValuation = totalOnHand * Number(variant.costPrice || 0);
    const retailValuation = totalOnHand * Number(variant.sellingPrice || 0);

    return {
      variant,
      batches,
      recentMovements,
      summary: {
        totalOnHand,
        totalAllocated,
        totalAvailable,
        costValuation,
        retailValuation,
      },
    };
  }

  async listMovements(merchantId: string, query: ListMovementsQueryDto) {
    const {
      warehouseId,
      variantId,
      movementType,
      referenceType,
      referenceId,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryMovementWhereInput = {
      merchantId,
      ...(warehouseId && { warehouseId }),
      ...(variantId && { variantId }),
      ...(movementType && { movementType }),
      ...(referenceType && { referenceType: { equals: referenceType, mode: 'insensitive' } }),
      ...(referenceId && { referenceId }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
    };

    const [total, items] = await Promise.all([
      this.db.inventoryMovement.count({ where }),
      this.db.inventoryMovement.findMany({
        where,
        skip,
        take: limit,
        include: {
          warehouse: {
            select: { id: true, code: true, name: true },
          },
          variant: {
            include: {
              product: {
                select: { id: true, code: true, name: true, unit: true },
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

  async getLowStockAlerts(merchantId: string, warehouseId?: string) {
    const lowStockBalances = await this.db.$queryRaw<
      Array<{
        id: string;
        warehouse_id: string;
        warehouse_name: string;
        variant_id: string;
        variant_sku: string;
        product_name: string;
        quantity_on_hand: number;
        reorder_point: number;
        cost_price: number;
      }>
    >`
      SELECT 
        sb.id,
        w.id AS warehouse_id,
        w.name AS warehouse_name,
        pv.id AS variant_id,
        pv.sku AS variant_sku,
        p.name AS product_name,
        sb.quantity_on_hand::float AS quantity_on_hand,
        pv.reorder_point::float AS reorder_point,
        pv.cost_price::float AS cost_price
      FROM stock_balances sb
      JOIN warehouses w ON sb.warehouse_id = w.id
      JOIN product_variants pv ON sb.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE sb.merchant_id = ${merchantId}::uuid
        ${warehouseId ? Prisma.sql`AND sb.warehouse_id = ${warehouseId}::uuid` : Prisma.empty}
        AND sb.quantity_on_hand <= pv.reorder_point
        AND p.is_active = true
      ORDER BY (sb.quantity_on_hand - pv.reorder_point) ASC
    `;

    return lowStockBalances;
  }

  async listBatches(merchantId: string, query: ListBatchesQueryDto) {
    const { warehouseId, variantId, status, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    let expiryFilter: Prisma.ProductBatchWhereInput = {};
    if (status === BatchExpiryStatus.EXPIRED) {
      expiryFilter = { expiryDate: { lt: now } };
    } else if (status === BatchExpiryStatus.NEAR_EXPIRY) {
      expiryFilter = { expiryDate: { gte: now, lte: thirtyDaysFromNow } };
    } else if (status === BatchExpiryStatus.HEALTHY) {
      expiryFilter = {
        OR: [
          { expiryDate: null },
          { expiryDate: { gt: thirtyDaysFromNow } },
        ],
      };
    }

    const where: Prisma.ProductBatchWhereInput = {
      merchantId,
      ...(warehouseId && { warehouseId }),
      ...(variantId && { variantId }),
      ...expiryFilter,
      ...(search && {
        OR: [
          { batchNumber: { contains: search, mode: 'insensitive' } },
          { variant: { sku: { contains: search, mode: 'insensitive' } } },
          { variant: { product: { name: { contains: search, mode: 'insensitive' } } } },
        ],
      }),
    };

    const [total, items, healthyCount, nearExpiryCount, expiredCount] = await Promise.all([
      this.db.productBatch.count({ where }),
      this.db.productBatch.findMany({
        where,
        skip,
        take: limit,
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
          supplier: { select: { id: true, code: true, name: true } },
          variant: {
            include: {
              product: { select: { id: true, code: true, name: true, unit: true } },
            },
          },
        },
        orderBy: [
          { expiryDate: 'asc' },
          { receivedDate: 'asc' },
        ],
      }),
      this.db.productBatch.count({
        where: {
          merchantId,
          ...(warehouseId && { warehouseId }),
          OR: [
            { expiryDate: null },
            { expiryDate: { gt: thirtyDaysFromNow } },
          ],
        },
      }),
      this.db.productBatch.count({
        where: {
          merchantId,
          ...(warehouseId && { warehouseId }),
          expiryDate: { gte: now, lte: thirtyDaysFromNow },
        },
      }),
      this.db.productBatch.count({
        where: {
          merchantId,
          ...(warehouseId && { warehouseId }),
          expiryDate: { lt: now },
        },
      }),
    ]);

    return {
      items,
      summary: {
        totalBatches: healthyCount + nearExpiryCount + expiredCount,
        healthyCount,
        nearExpiryCount,
        expiredCount,
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getBatchById(merchantId: string, id: string) {
    const batch = await this.db.productBatch.findFirst({
      where: { id, merchantId },
      include: {
        warehouse: true,
        variant: { include: { product: true } },
        supplier: true,
      },
    });
    if (!batch) {
      throw new NotFoundException(`Batch ${id} not found.`);
    }
    return batch;
  }

  async createBatch(merchantId: string, dto: CreateBatchDto, actorId: string) {
    const variant = await this.db.productVariant.findFirst({
      where: { id: dto.variantId, merchantId },
    });
    if (!variant) {
      throw new NotFoundException(`Product variant ${dto.variantId} not found.`);
    }

    const warehouse = await this.db.warehouse.findFirst({
      where: { id: dto.warehouseId, merchantId, isActive: true },
    });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${dto.warehouseId} not found.`);
    }

    return this.db.$transaction(async (tx) => {
      const batch = await tx.productBatch.create({
        data: {
          merchantId,
          warehouseId: dto.warehouseId,
          variantId: dto.variantId,
          batchNumber: dto.batchNumber.trim(),
          costPrice: dto.costPrice,
          sellingPrice: dto.sellingPrice,
          quantityReceived: dto.quantityReceived,
          quantityOnHand: dto.quantityOnHand,
          quantitySold: 0,
          manufacturingDate: dto.manufacturingDate ? new Date(dto.manufacturingDate) : null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          supplierId: dto.supplierId,
          isActive: true,
        },
      });

      // Update or create stock balance for warehouse
      let balance = await tx.stockBalance.findUnique({
        where: {
          merchantId_warehouseId_variantId: {
            merchantId,
            warehouseId: dto.warehouseId,
            variantId: dto.variantId,
          },
        },
      });

      const addQty = Number(dto.quantityOnHand);
      if (addQty > 0) {
        if (!balance) {
          balance = await tx.stockBalance.create({
            data: {
              merchantId,
              warehouseId: dto.warehouseId,
              variantId: dto.variantId,
              quantityOnHand: addQty,
              quantityAllocated: 0,
              quantityAvailable: addQty,
            },
          });
        } else {
          await tx.stockBalance.update({
            where: { id: balance.id },
            data: {
              quantityOnHand: { increment: addQty },
              quantityAvailable: { increment: addQty },
            },
          });
        }

        // Audit inventory movement
        await tx.inventoryMovement.create({
          data: {
            merchantId,
            warehouseId: dto.warehouseId,
            variantId: dto.variantId,
            movementType: MovementType.ADJUSTMENT_POSITIVE,
            quantity: addQty,
            unitCost: dto.costPrice,
            runningBalance: Number(balance.quantityOnHand) + addQty,
            batchNumber: dto.batchNumber.trim(),
            referenceType: 'MANUAL_BATCH',
            referenceId: batch.id,
            notes: `Batch ${dto.batchNumber.trim()} opening stock created`,
            createdById: actorId,
          },
        });
      }

      return batch;
    });
  }

  async updateBatch(merchantId: string, id: string, dto: UpdateBatchDto) {
    const batch = await this.db.productBatch.findFirst({
      where: { id, merchantId },
    });
    if (!batch) {
      throw new NotFoundException(`Batch ${id} not found.`);
    }

    return this.db.productBatch.update({
      where: { id },
      data: {
        ...(dto.costPrice !== undefined ? { costPrice: dto.costPrice } : {}),
        ...(dto.sellingPrice !== undefined ? { sellingPrice: dto.sellingPrice } : {}),
        ...(dto.manufacturingDate !== undefined ? { manufacturingDate: dto.manufacturingDate ? new Date(dto.manufacturingDate) : null } : {}),
        ...(dto.expiryDate !== undefined ? { expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async getBatchesForVariant(merchantId: string, variantId: string, warehouseId?: string) {
    return this.db.productBatch.findMany({
      where: {
        merchantId,
        variantId,
        ...(warehouseId && { warehouseId }),
        isActive: true,
        quantityOnHand: { gt: 0 },
      },
      orderBy: [
        { expiryDate: 'asc' },
        { receivedDate: 'asc' },
      ],
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
      },
    });
  }
}
