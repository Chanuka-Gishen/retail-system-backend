import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreateGoodsReceivedNoteDto,
  ListGRNQueryDto,
} from '../dto/grn.dto';
import {
  GRNStatus,
  MovementType,
  PurchaseOrderStatus,
  Prisma,
} from '@prisma/client';

@Injectable()
export class GoodsReceivedNoteService {
  constructor(private db: DatabaseService) {}

  async listGRNs(merchantId: string, query: ListGRNQueryDto) {
    const { supplierId, warehouseId, branchId, purchaseOrderId, status, search, page = 1, limit = 20 } =
      query;
    const skip = (page - 1) * limit;

    const where: Prisma.GoodsReceivedNoteWhereInput = {
      merchantId,
      ...(supplierId && { supplierId }),
      ...(warehouseId && { warehouseId }),
      ...(branchId && { branchId }),
      ...(purchaseOrderId && { purchaseOrderId }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { grnNumber: { contains: search, mode: 'insensitive' } },
          { deliveryNoteNumber: { contains: search, mode: 'insensitive' } },
          { supplierInvoiceRef: { contains: search, mode: 'insensitive' } },
          { vehicleReference: { contains: search, mode: 'insensitive' } },
          { remarks: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.db.goodsReceivedNote.count({ where }),
      this.db.goodsReceivedNote.findMany({
        where,
        skip,
        take: limit,
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          branch: { select: { id: true, code: true, name: true } },
          purchaseOrder: { select: { id: true, poNumber: true } },
          _count: { select: { items: true, invoices: true, returns: true } },
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

  async getGRNById(merchantId: string, id: string) {
    const grn = await this.db.goodsReceivedNote.findFirst({
      where: { id, merchantId },
      include: {
        supplier: true,
        warehouse: true,
        branch: true,
        purchaseOrder: {
          include: {
            items: {
              include: {
                variant: {
                  select: { id: true, sku: true, barcode: true, product: { select: { name: true } } },
                },
              },
            },
          },
        },
        items: {
          include: {
            variant: {
              include: {
                product: { select: { id: true, code: true, name: true, unit: true } },
              },
            },
          },
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
            balanceAmount: true,
          },
        },
        returns: {
          select: {
            id: true,
            returnNumber: true,
            status: true,
            totalAmount: true,
            returnDate: true,
          },
        },
      },
    });

    if (!grn) {
      throw new NotFoundException(`Goods Received Note ${id} not found.`);
    }

    return grn;
  }

  async createGRN(merchantId: string, dto: CreateGoodsReceivedNoteDto, actorId: string) {
    // 1. Validate Supplier
    const supplier = await this.db.supplier.findFirst({
      where: { id: dto.supplierId, merchantId, isActive: true },
    });
    if (!supplier) {
      throw new NotFoundException(`Active supplier ${dto.supplierId} not found.`);
    }

    // 2. Validate Warehouse
    const warehouse = await this.db.warehouse.findFirst({
      where: { id: dto.warehouseId, merchantId, isActive: true },
    });
    if (!warehouse) {
      throw new NotFoundException(`Active warehouse ${dto.warehouseId} not found.`);
    }

    // 3. Validate Purchase Order if linked
    if (dto.purchaseOrderId) {
      const po = await this.db.purchaseOrder.findFirst({
        where: { id: dto.purchaseOrderId, merchantId },
      });
      if (!po) {
        throw new NotFoundException(`Purchase Order ${dto.purchaseOrderId} not found.`);
      }
      if (
        po.status !== PurchaseOrderStatus.ISSUED &&
        po.status !== PurchaseOrderStatus.APPROVED &&
        po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
      ) {
        throw new BadRequestException(
          `Cannot receive goods against purchase order with status "${po.status}". PO must be APPROVED, ISSUED or PARTIALLY_RECEIVED.`,
        );
      }
      if (po.supplierId !== dto.supplierId) {
        throw new BadRequestException('Supplier mismatch: GRN supplier must match Purchase Order supplier.');
      }
    }

    // 4. Validate Variants belong to merchant
    const variantIds = dto.items.map((i) => i.variantId);
    const variants = await this.db.productVariant.findMany({
      where: { id: { in: variantIds }, merchantId },
    });
    if (variants.length !== variantIds.length) {
      throw new BadRequestException('One or more product variants were not found.');
    }

    // 5. Calculate line totals, subtotal, tax and total amount
    let subtotal = 0;
    let taxAmount = 0;
    const itemsData = dto.items.map((item) => {
      const acceptedQty = item.acceptedQuantity !== undefined ? Number(item.acceptedQuantity) : Number(item.quantityReceived);
      const damagedQty = Number(item.damagedQuantity || 0);
      const rejectedQty = Number(item.rejectedQuantity || 0);
      const freeQty = Number(item.freeQuantity || 0);
      const discount = Number(item.discountAmount || 0);
      const tax = Number(item.taxAmount || 0);

      // Value calculated on accepted + free units
      const payableQty = acceptedQty;
      const gross = payableQty * Number(item.unitCost);
      const lineTotal = Math.max(0, gross - discount + tax);

      subtotal += lineTotal;
      taxAmount += tax;

      return {
        variantId: item.variantId,
        orderedQuantity: item.orderedQuantity || 0,
        quantityReceived: item.quantityReceived,
        acceptedQuantity: acceptedQty,
        damagedQuantity: damagedQty,
        rejectedQuantity: rejectedQty,
        freeQuantity: freeQty,
        unitCost: item.unitCost,
        discountAmount: discount,
        taxAmount: tax,
        lineTotal,
        batchNumber: item.batchNumber?.trim(),
        serialNumber: item.serialNumber?.trim(),
        manufacturingDate: item.manufacturingDate ? new Date(item.manufacturingDate) : null,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
      };
    });

    const landedCosts = Number(dto.landedCosts ?? 0);
    const totalAmount = subtotal + landedCosts;

    // 6. Generate unique GRN number
    const count = await this.db.goodsReceivedNote.count({ where: { merchantId } });
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(count + 1).padStart(4, '0');
    const grnNumber = `GRN-${dateStr}-${seq}`;

    return this.db.goodsReceivedNote.create({
      data: {
        merchantId,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        branchId: dto.branchId,
        purchaseOrderId: dto.purchaseOrderId,
        grnNumber,
        deliveryNoteNumber: dto.deliveryNoteNumber?.trim(),
        supplierInvoiceRef: dto.supplierInvoiceRef?.trim(),
        vehicleReference: dto.vehicleReference?.trim(),
        remarks: dto.remarks?.trim(),
        status: GRNStatus.DRAFT,
        subtotal,
        taxAmount,
        landedCosts,
        totalAmount,
        receivedAt: new Date(),
        createdById: actorId,
        items: {
          create: itemsData,
        },
      },
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        items: {
          include: {
            variant: {
              select: { id: true, sku: true, barcode: true, product: { select: { name: true } } },
            },
          },
        },
      },
    });
  }

  async postGRN(merchantId: string, id: string, actorId: string) {
    const grn = await this.db.goodsReceivedNote.findFirst({
      where: { id, merchantId },
      include: {
        items: {
          include: { variant: true },
        },
        purchaseOrder: {
          include: { items: true },
        },
        supplier: true,
        warehouse: true,
      },
    });

    if (!grn) {
      throw new NotFoundException(`Goods Received Note ${id} not found.`);
    }

    if (grn.status !== GRNStatus.DRAFT && grn.status !== GRNStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Cannot post GRN with status "${grn.status}". Only DRAFT GRNs can be posted.`,
      );
    }

    // Execute atomic posting transaction
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const totalSubtotal = Number(grn.subtotal);
      const landedCosts = Number(grn.landedCosts);

      for (const item of grn.items) {
        const itemLineTotal = Number(item.lineTotal);
        // Only accepted items enter physical inventory
        const stockQty = Number(Number(item.acceptedQuantity) > 0 ? item.acceptedQuantity : item.quantityReceived);

        if (stockQty <= 0) continue;

        // Landed cost apportionment proportionally by line value
        const itemLandedShare =
          totalSubtotal > 0 && landedCosts > 0
            ? (itemLineTotal / totalSubtotal) * landedCosts
            : 0;

        const effectiveUnitCost = (itemLineTotal + itemLandedShare) / stockQty;

        // Fetch current stock balance
        let balance = await tx.stockBalance.findUnique({
          where: {
            merchantId_warehouseId_variantId: {
              merchantId,
              warehouseId: grn.warehouseId,
              variantId: item.variantId,
            },
          },
        });

        if (!balance) {
          balance = await tx.stockBalance.create({
            data: {
              merchantId,
              warehouseId: grn.warehouseId,
              variantId: item.variantId,
              quantityOnHand: 0,
              quantityAllocated: 0,
              quantityAvailable: 0,
            },
          });
        }

        const currentOnHand = Number(balance.quantityOnHand);
        const currentAllocated = Number(balance.quantityAllocated);
        const currentCost = Number(item.variant.costPrice);

        // Weighted Average Costing (AVCO)
        const totalUnitsAfter = currentOnHand + stockQty;
        if (totalUnitsAfter > 0) {
          const newAvgCost =
            (currentOnHand * currentCost + stockQty * effectiveUnitCost) / totalUnitsAfter;
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { costPrice: Math.round(newAvgCost * 100) / 100 },
          });
        }

        // Update Stock Balance
        const newOnHand = currentOnHand + stockQty;
        const newAvailable = Math.max(0, newOnHand - currentAllocated);

        await tx.stockBalance.update({
          where: { id: balance.id },
          data: {
            quantityOnHand: newOnHand,
            quantityAvailable: newAvailable,
          },
        });

        // Create or update ProductBatch tracking for FIFO/FEFO inventory & batch pricing
        const batchNo = item.batchNumber?.trim() || (item.expiryDate ? `BAT-${grn.grnNumber.slice(-6)}-${item.variant.sku.slice(0, 4)}` : null);
        if (batchNo) {
          await tx.productBatch.upsert({
            where: {
              merchantId_warehouseId_variantId_batchNumber: {
                merchantId,
                warehouseId: grn.warehouseId,
                variantId: item.variantId,
                batchNumber: batchNo,
              },
            },
            update: {
              quantityReceived: { increment: stockQty },
              quantityOnHand: { increment: stockQty },
              costPrice: Math.round(effectiveUnitCost * 100) / 100,
              sellingPrice: item.variant.sellingPrice,
              manufacturingDate: item.manufacturingDate,
              expiryDate: item.expiryDate,
              supplierId: grn.supplierId,
              grnId: grn.id,
              isActive: true,
            },
            create: {
              merchantId,
              warehouseId: grn.warehouseId,
              variantId: item.variantId,
              batchNumber: batchNo,
              costPrice: Math.round(effectiveUnitCost * 100) / 100,
              sellingPrice: item.variant.sellingPrice,
              quantityReceived: stockQty,
              quantityOnHand: stockQty,
              quantitySold: 0,
              manufacturingDate: item.manufacturingDate,
              expiryDate: item.expiryDate,
              supplierId: grn.supplierId,
              grnId: grn.id,
              isActive: true,
            },
          });
        }

        // Strictly Append-Only InventoryMovement
        await tx.inventoryMovement.create({
          data: {
            merchantId,
            warehouseId: grn.warehouseId,
            variantId: item.variantId,
            movementType: MovementType.PURCHASE_RECEIPT,
            quantity: stockQty,
            unitCost: effectiveUnitCost,
            runningBalance: newOnHand,
            batchNumber: batchNo || undefined,
            referenceType: 'GRN',
            referenceId: grn.id,
            notes: `Goods received against GRN ${grn.grnNumber}${grn.purchaseOrder ? ' (PO ' + grn.purchaseOrder.poNumber + ')' : ''}${batchNo ? ' [Batch ' + batchNo + ']' : ''}`,
            createdById: actorId,
          },
        });
      }

      // Update linked Purchase Order items and overall status
      if (grn.purchaseOrder) {
        for (const item of grn.items) {
          const poItem = grn.purchaseOrder.items.find((pi) => pi.variantId === item.variantId);
          if (poItem) {
            const currentRecv = Number(poItem.quantityReceived);
            const stockQty = Number(Number(item.acceptedQuantity) > 0 ? item.acceptedQuantity : item.quantityReceived);
            await tx.purchaseOrderItem.update({
              where: { id: poItem.id },
              data: { quantityReceived: currentRecv + stockQty },
            });
          }
        }

        const refreshedPoItems = await tx.purchaseOrderItem.findMany({
          where: { poId: grn.purchaseOrderId! },
        });

        const allCompleted = refreshedPoItems.every(
          (pi) => Number(pi.quantityReceived) >= Number(pi.quantityOrdered),
        );

        await tx.purchaseOrder.update({
          where: { id: grn.purchaseOrderId! },
          data: {
            status: allCompleted
              ? PurchaseOrderStatus.COMPLETED
              : PurchaseOrderStatus.PARTIALLY_RECEIVED,
          },
        });
      }

      // Update GRN Header
      return tx.goodsReceivedNote.update({
        where: { id: grn.id },
        data: {
          status: GRNStatus.POSTED,
          postedAt: new Date(),
          approvedById: actorId,
        },
        include: {
          supplier: { select: { id: true, code: true, name: true, outstandingPayables: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          purchaseOrder: { select: { id: true, poNumber: true, status: true } },
          items: {
            include: {
              variant: {
                select: { id: true, sku: true, costPrice: true, product: { select: { name: true } } },
              },
            },
          },
        },
      });
    });
  }

  async cancelGRN(merchantId: string, id: string, _actorId: string) {
    const grn = await this.db.goodsReceivedNote.findFirst({
      where: { id, merchantId },
    });

    if (!grn) {
      throw new NotFoundException(`Goods Received Note ${id} not found.`);
    }

    if (grn.status !== GRNStatus.DRAFT && grn.status !== GRNStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Cannot cancel GRN with status "${grn.status}". Only DRAFT GRNs can be cancelled.`,
      );
    }

    return this.db.goodsReceivedNote.update({
      where: { id },
      data: {
        status: GRNStatus.CANCELLED,
      },
    });
  }
}
