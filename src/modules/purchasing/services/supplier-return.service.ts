import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreateSupplierReturnDto,
  ListSupplierReturnsQueryDto,
} from '../dto/supplier-return.dto';
import {
  SupplierReturnStatus,
  SupplierReturnSettlement,
  SupplierLedgerTransactionType,
  MovementType,
  Prisma,
} from '@prisma/client';

@Injectable()
export class SupplierReturnService {
  constructor(private db: DatabaseService) {}

  async listReturns(merchantId: string, query: ListSupplierReturnsQueryDto) {
    const { supplierId, warehouseId, status, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierReturnWhereInput = {
      merchantId,
      ...(supplierId && { supplierId }),
      ...(warehouseId && { warehouseId }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { returnNumber: { contains: search, mode: 'insensitive' } },
          { creditNoteNumber: { contains: search, mode: 'insensitive' } },
          { reason: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.db.supplierReturn.count({ where }),
      this.db.supplierReturn.findMany({
        where,
        skip,
        take: limit,
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          grn: { select: { id: true, grnNumber: true } },
          _count: { select: { items: true } },
        },
        orderBy: { returnDate: 'desc' },
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

  async getReturnById(merchantId: string, id: string) {
    const supplierReturn = await this.db.supplierReturn.findFirst({
      where: { id, merchantId },
      include: {
        supplier: true,
        warehouse: true,
        grn: { select: { id: true, grnNumber: true, receivedAt: true } },
        items: {
          include: {
            variant: {
              include: {
                product: { select: { id: true, code: true, name: true, unit: true } },
              },
            },
          },
        },
      },
    });

    if (!supplierReturn) {
      throw new NotFoundException(`Supplier Return ${id} not found.`);
    }

    return supplierReturn;
  }

  async createReturn(merchantId: string, dto: CreateSupplierReturnDto, actorId: string) {
    const supplier = await this.db.supplier.findFirst({
      where: { id: dto.supplierId, merchantId },
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${dto.supplierId} not found.`);
    }

    const warehouse = await this.db.warehouse.findFirst({
      where: { id: dto.warehouseId, merchantId },
    });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${dto.warehouseId} not found.`);
    }

    let totalAmount = 0;
    const itemsData = dto.items.map((item) => {
      const lineTotal = Number(item.quantity) * Number(item.unitCost);
      totalAmount += lineTotal;

      return {
        variantId: item.variantId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        lineTotal,
        returnReason: item.returnReason.trim(),
        batchNumber: item.batchNumber?.trim(),
      };
    });

    const count = await this.db.supplierReturn.count({ where: { merchantId } });
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(count + 1).padStart(4, '0');
    const returnNumber = `SR-${dateStr}-${seq}`;

    return this.db.supplierReturn.create({
      data: {
        merchantId,
        supplierId: dto.supplierId,
        grnId: dto.grnId,
        warehouseId: dto.warehouseId,
        returnNumber,
        returnDate: dto.returnDate ? new Date(dto.returnDate) : new Date(),
        status: SupplierReturnStatus.DRAFT,
        settlementMethod: dto.settlementMethod || SupplierReturnSettlement.CREDIT_NOTE,
        totalAmount,
        reason: dto.reason?.trim(),
        notes: dto.notes?.trim(),
        createdById: actorId,
        items: {
          create: itemsData,
        },
      },
      include: {
        supplier: true,
        items: true,
      },
    });
  }

  async approveReturn(merchantId: string, id: string, actorId: string) {
    const supplierReturn = await this.db.supplierReturn.findFirst({
      where: { id, merchantId },
    });

    if (!supplierReturn) {
      throw new NotFoundException(`Supplier Return ${id} not found.`);
    }

    if (supplierReturn.status !== SupplierReturnStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot approve return in status "${supplierReturn.status}". Only DRAFT returns can be approved.`,
      );
    }

    return this.db.supplierReturn.update({
      where: { id },
      data: {
        status: SupplierReturnStatus.APPROVED,
        approvedById: actorId,
        approvedAt: new Date(),
      },
    });
  }

  async dispatchReturn(merchantId: string, id: string, actorId: string) {
    const supplierReturn = await this.db.supplierReturn.findFirst({
      where: { id, merchantId },
      include: {
        supplier: true,
        items: { include: { variant: true } },
      },
    });

    if (!supplierReturn) {
      throw new NotFoundException(`Supplier Return ${id} not found.`);
    }

    if (supplierReturn.status !== SupplierReturnStatus.APPROVED) {
      throw new BadRequestException(
        `Only APPROVED returns can be dispatched (currently "${supplierReturn.status}").`,
      );
    }

    return this.db.$transaction(async (tx) => {
      // 1. Deduct Stock for each returned item
      for (const item of supplierReturn.items) {
        const qtyToReturn = Number(item.quantity);

        let balance = await tx.stockBalance.findUnique({
          where: {
            merchantId_warehouseId_variantId: {
              merchantId,
              warehouseId: supplierReturn.warehouseId,
              variantId: item.variantId,
            },
          },
        });

        const currentOnHand = balance ? Number(balance.quantityOnHand) : 0;
        const newOnHand = Math.max(0, currentOnHand - qtyToReturn);
        const newAvailable = Math.max(0, newOnHand - (balance ? Number(balance.quantityAllocated) : 0));

        if (balance) {
          await tx.stockBalance.update({
            where: { id: balance.id },
            data: {
              quantityOnHand: newOnHand,
              quantityAvailable: newAvailable,
            },
          });
        }

        // Record Append-Only Inventory Movement
        await tx.inventoryMovement.create({
          data: {
            merchantId,
            warehouseId: supplierReturn.warehouseId,
            variantId: item.variantId,
            movementType: MovementType.SUPPLIER_RETURN,
            quantity: -qtyToReturn, // Negative for outflow
            unitCost: item.unitCost,
            runningBalance: newOnHand,
            referenceType: 'SUPPLIER_RETURN',
            referenceId: supplierReturn.id,
            notes: `Dispatched return ${supplierReturn.returnNumber} to supplier: ${item.returnReason}`,
            createdById: actorId,
          },
        });
      }

      // 2. Financial Settlement: If Credit Note, deduct payable balance & post ledger
      const returnTotal = Number(supplierReturn.totalAmount);
      let creditNoteNumber = supplierReturn.creditNoteNumber;

      if (supplierReturn.settlementMethod === SupplierReturnSettlement.CREDIT_NOTE) {
        creditNoteNumber = `CN-${supplierReturn.returnNumber}`;

        const lastEntry = await tx.supplierLedgerEntry.findFirst({
          where: { merchantId, supplierId: supplierReturn.supplierId },
          orderBy: { entryDate: 'desc' },
        });

        const currentBalance = lastEntry ? Number(lastEntry.runningBalance) : Number(supplierReturn.supplier.outstandingPayables);
        const newRunningBalance = currentBalance - returnTotal;

        await tx.supplierLedgerEntry.create({
          data: {
            merchantId,
            supplierId: supplierReturn.supplierId,
            transactionType: SupplierLedgerTransactionType.RETURN,
            referenceNumber: creditNoteNumber,
            referenceId: supplierReturn.id,
            debit: returnTotal, // Debit reduces supplier liability
            credit: 0,
            runningBalance: newRunningBalance,
            description: `Supplier Return: ${supplierReturn.returnNumber}`,
            createdById: actorId,
          },
        });

        await tx.supplier.update({
          where: { id: supplierReturn.supplierId },
          data: {
            outstandingPayables: {
              decrement: returnTotal,
            },
          },
        });
      }

      // 3. Mark return DISPATCHED
      return tx.supplierReturn.update({
        where: { id },
        data: {
          status: SupplierReturnStatus.DISPATCHED,
          settlementStatus: supplierReturn.settlementMethod === SupplierReturnSettlement.CREDIT_NOTE ? 'SETTLED' : 'PENDING',
          creditNoteNumber,
          dispatchedAt: new Date(),
        },
        include: {
          supplier: true,
          items: true,
        },
      });
    });
  }
}
