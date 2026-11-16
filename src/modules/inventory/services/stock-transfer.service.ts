import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreateStockTransferDto,
  ReceiveStockTransferDto,
} from '../dto/stock-transfer.dto';
import { ListTransfersQueryDto } from '../dto/inventory-query.dto';
import { MovementType, TransferStatus, Prisma } from '@prisma/client';

@Injectable()
export class StockTransferService {
  constructor(private db: DatabaseService) {}

  async createTransfer(merchantId: string, dto: CreateStockTransferDto, actorId: string) {
    if (dto.sourceWarehouseId === dto.destinationWarehouseId) {
      throw new BadRequestException('Source and destination warehouses must be different.');
    }

    // 1. Validate both warehouses
    const [sourceWarehouse, destinationWarehouse] = await Promise.all([
      this.db.warehouse.findFirst({
        where: { id: dto.sourceWarehouseId, merchantId, isActive: true },
      }),
      this.db.warehouse.findFirst({
        where: { id: dto.destinationWarehouseId, merchantId, isActive: true },
      }),
    ]);

    if (!sourceWarehouse) {
      throw new NotFoundException(`Source warehouse ${dto.sourceWarehouseId} not found.`);
    }
    if (!destinationWarehouse) {
      throw new NotFoundException(`Destination warehouse ${dto.destinationWarehouseId} not found.`);
    }

    // 2. Validate all variants belong to merchant
    const variantIds = dto.items.map((i) => i.variantId);
    const variants = await this.db.productVariant.findMany({
      where: { id: { in: variantIds }, merchantId },
    });

    if (variants.length !== variantIds.length) {
      throw new BadRequestException('One or more product variants were not found.');
    }

    // 3. Generate unique transfer number
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const transferNumber = `TRF-${todayStr}-${randomDigits}`;

    // 4. Create Transfer Draft
    const transfer = await this.db.stockTransfer.create({
      data: {
        merchantId,
        sourceWarehouseId: dto.sourceWarehouseId,
        destinationWarehouseId: dto.destinationWarehouseId,
        transferNumber,
        status: TransferStatus.DRAFT,
        notes: dto.notes?.trim(),
        createdById: actorId,
        items: {
          create: dto.items.map((item) => ({
            variantId: item.variantId,
            quantitySent: item.quantitySent,
          })),
        },
      },
      include: {
        sourceWarehouse: { select: { id: true, code: true, name: true } },
        destinationWarehouse: { select: { id: true, code: true, name: true } },
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

    return transfer;
  }

  async dispatchTransfer(merchantId: string, transferId: string, actorId: string) {
    const transfer = await this.db.stockTransfer.findFirst({
      where: { id: transferId, merchantId },
      include: {
        items: {
          include: { variant: true },
        },
        sourceWarehouse: true,
        destinationWarehouse: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException(`Transfer ${transferId} not found.`);
    }

    if (transfer.status !== TransferStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot dispatch transfer with status ${transfer.status}. Only DRAFT transfers can be dispatched.`,
      );
    }

    // Atomic Dispatch Transaction
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const item of transfer.items) {
        // Fetch source warehouse balance
        const balance = await tx.stockBalance.findUnique({
          where: {
            merchantId_warehouseId_variantId: {
              merchantId,
              warehouseId: transfer.sourceWarehouseId,
              variantId: item.variantId,
            },
          },
        });

        const currentOnHand = balance ? Number(balance.quantityOnHand) : 0;
        const currentAllocated = balance ? Number(balance.quantityAllocated) : 0;
        const sendQty = Number(item.quantitySent);

        if (currentOnHand < sendQty) {
          throw new BadRequestException(
            `Insufficient stock in source warehouse for variant ${item.variant.sku}. Available on-hand: ${currentOnHand}, required: ${sendQty}.`,
          );
        }

        const newOnHand = currentOnHand - sendQty;
        const newAvailable = Math.max(0, newOnHand - currentAllocated);
        const unitCost = Number(item.variant.costPrice);

        // Deduct from source warehouse
        await tx.stockBalance.update({
          where: { id: balance!.id },
          data: {
            quantityOnHand: newOnHand,
            quantityAvailable: newAvailable,
          },
        });

        // Append-Only InventoryMovement in source warehouse
        await tx.inventoryMovement.create({
          data: {
            merchantId,
            warehouseId: transfer.sourceWarehouseId,
            variantId: item.variantId,
            movementType: MovementType.TRANSFER_OUT,
            quantity: -sendQty,
            unitCost,
            runningBalance: newOnHand,
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            notes: `Dispatch transfer ${transfer.transferNumber} to ${transfer.destinationWarehouse.name}`,
            createdById: actorId,
          },
        });
      }

      // Update transfer status
      return tx.stockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: TransferStatus.IN_TRANSIT,
          dispatchedAt: new Date(),
        },
        include: {
          sourceWarehouse: { select: { id: true, code: true, name: true } },
          destinationWarehouse: { select: { id: true, code: true, name: true } },
          items: {
            include: {
              variant: {
                select: {
                  id: true,
                  sku: true,
                  product: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });
    });
  }

  async receiveTransfer(
    merchantId: string,
    transferId: string,
    dto: ReceiveStockTransferDto,
    actorId: string,
  ) {
    const transfer = await this.db.stockTransfer.findFirst({
      where: { id: transferId, merchantId },
      include: {
        items: {
          include: { variant: true },
        },
        sourceWarehouse: true,
        destinationWarehouse: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException(`Transfer ${transferId} not found.`);
    }

    if (transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new BadRequestException(
        `Cannot receive transfer with status ${transfer.status}. Only IN_TRANSIT transfers can be received.`,
      );
    }

    const receivedMap = new Map<string, number>();
    if (dto.items && dto.items.length > 0) {
      for (const item of dto.items) {
        receivedMap.set(item.variantId, item.quantityReceived);
      }
    }

    // Atomic Receive Transaction
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const item of transfer.items) {
        // Determine received quantity
        const receivedQty = receivedMap.has(item.variantId)
          ? receivedMap.get(item.variantId)!
          : Number(item.quantitySent);

        if (receivedQty < 0) {
          throw new BadRequestException('Received quantity cannot be negative.');
        }

        // Fetch or create destination warehouse stock balance
        let destBalance = await tx.stockBalance.findUnique({
          where: {
            merchantId_warehouseId_variantId: {
              merchantId,
              warehouseId: transfer.destinationWarehouseId,
              variantId: item.variantId,
            },
          },
        });

        if (!destBalance) {
          destBalance = await tx.stockBalance.create({
            data: {
              merchantId,
              warehouseId: transfer.destinationWarehouseId,
              variantId: item.variantId,
              quantityOnHand: 0,
              quantityAllocated: 0,
              quantityAvailable: 0,
            },
          });
        }

        const currentOnHand = Number(destBalance.quantityOnHand);
        const currentAllocated = Number(destBalance.quantityAllocated);
        const newOnHand = currentOnHand + receivedQty;
        const newAvailable = Math.max(0, newOnHand - currentAllocated);
        const unitCost = Number(item.variant.costPrice);

        // Add to destination warehouse stock balance
        await tx.stockBalance.update({
          where: { id: destBalance.id },
          data: {
            quantityOnHand: newOnHand,
            quantityAvailable: newAvailable,
          },
        });

        // Update item received quantity
        await tx.stockTransferItem.update({
          where: { id: item.id },
          data: {
            quantityReceived: receivedQty,
          },
        });

        // Strictly Append-Only InventoryMovement in destination warehouse
        await tx.inventoryMovement.create({
          data: {
            merchantId,
            warehouseId: transfer.destinationWarehouseId,
            variantId: item.variantId,
            movementType: MovementType.TRANSFER_IN,
            quantity: receivedQty,
            unitCost,
            runningBalance: newOnHand,
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            notes: `Received transfer ${transfer.transferNumber} from ${transfer.sourceWarehouse.name}`,
            createdById: actorId,
          },
        });
      }

      // Update transfer header
      return tx.stockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: TransferStatus.RECEIVED,
          receivedAt: new Date(),
          ...(dto.notes && { notes: dto.notes.trim() }),
        },
        include: {
          sourceWarehouse: { select: { id: true, code: true, name: true } },
          destinationWarehouse: { select: { id: true, code: true, name: true } },
          items: {
            include: {
              variant: {
                select: {
                  id: true,
                  sku: true,
                  product: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });
    });
  }

  async cancelTransfer(merchantId: string, transferId: string, actorId: string, notes?: string) {
    const transfer = await this.db.stockTransfer.findFirst({
      where: { id: transferId, merchantId },
      include: {
        items: { include: { variant: true } },
        sourceWarehouse: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException(`Transfer ${transferId} not found.`);
    }

    if (
      transfer.status === TransferStatus.RECEIVED ||
      transfer.status === TransferStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot cancel transfer with status ${transfer.status}. Only DRAFT or IN_TRANSIT transfers can be cancelled.`,
      );
    }

    // If DRAFT, no movements took place yet; just update status
    if (transfer.status === TransferStatus.DRAFT) {
      return this.db.stockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: TransferStatus.CANCELLED,
          ...(notes && { notes }),
        },
      });
    }

    // If IN_TRANSIT, stock was deducted from source warehouse and must be reversed
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const item of transfer.items) {
        const sendQty = Number(item.quantitySent);
        const unitCost = Number(item.variant.costPrice);

        const balance = await tx.stockBalance.findUnique({
          where: {
            merchantId_warehouseId_variantId: {
              merchantId,
              warehouseId: transfer.sourceWarehouseId,
              variantId: item.variantId,
            },
          },
        });

        const currentOnHand = balance ? Number(balance.quantityOnHand) : 0;
        const currentAllocated = balance ? Number(balance.quantityAllocated) : 0;
        const newOnHand = currentOnHand + sendQty;
        const newAvailable = Math.max(0, newOnHand - currentAllocated);

        await tx.stockBalance.update({
          where: { id: balance!.id },
          data: {
            quantityOnHand: newOnHand,
            quantityAvailable: newAvailable,
          },
        });

        // Compensating InventoryMovement reversal
        await tx.inventoryMovement.create({
          data: {
            merchantId,
            warehouseId: transfer.sourceWarehouseId,
            variantId: item.variantId,
            movementType: MovementType.TRANSFER_IN,
            quantity: sendQty,
            unitCost,
            runningBalance: newOnHand,
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            notes: `Transfer cancelled: Reversal of dispatched transfer ${transfer.transferNumber}`,
            createdById: actorId,
          },
        });
      }

      return tx.stockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: TransferStatus.CANCELLED,
          ...(notes && { notes: `Cancelled: ${notes}` }),
        },
      });
    });
  }

  async listTransfers(merchantId: string, query: ListTransfersQueryDto) {
    const { sourceWarehouseId, destinationWarehouseId, status, search, page = 1, limit = 20 } =
      query;
    const skip = (page - 1) * limit;

    const where: Prisma.StockTransferWhereInput = {
      merchantId,
      ...(sourceWarehouseId && { sourceWarehouseId }),
      ...(destinationWarehouseId && { destinationWarehouseId }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { transferNumber: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.db.stockTransfer.count({ where }),
      this.db.stockTransfer.findMany({
        where,
        skip,
        take: limit,
        include: {
          sourceWarehouse: { select: { id: true, code: true, name: true } },
          destinationWarehouse: { select: { id: true, code: true, name: true } },
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

  async getTransferById(merchantId: string, id: string) {
    const transfer = await this.db.stockTransfer.findFirst({
      where: { id, merchantId },
      include: {
        sourceWarehouse: { select: { id: true, code: true, name: true, address: true } },
        destinationWarehouse: { select: { id: true, code: true, name: true, address: true } },
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

    if (!transfer) {
      throw new NotFoundException(`Stock transfer ${id} not found.`);
    }

    return transfer;
  }
}
