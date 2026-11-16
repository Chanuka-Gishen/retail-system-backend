import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreateSupplierInvoiceDto,
  VerifySupplierInvoiceDto,
  ListSupplierInvoicesQueryDto,
} from '../dto/supplier-invoice.dto';
import {
  SupplierInvoiceStatus,
  SupplierLedgerTransactionType,
  Prisma,
} from '@prisma/client';

@Injectable()
export class SupplierInvoiceService {
  constructor(private db: DatabaseService) {}

  async listInvoices(merchantId: string, query: ListSupplierInvoicesQueryDto) {
    const { supplierId, status, isOverdue, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: Prisma.SupplierInvoiceWhereInput = {
      merchantId,
      ...(supplierId && { supplierId }),
      ...(status && { status }),
      ...(isOverdue && {
        dueDate: { lt: now },
        balanceAmount: { gt: 0 },
        status: { notIn: [SupplierInvoiceStatus.FULLY_PAID, SupplierInvoiceStatus.VOID] },
      }),
      ...(search && {
        OR: [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { discrepancyNote: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.db.supplierInvoice.count({ where }),
      this.db.supplierInvoice.findMany({
        where,
        skip,
        take: limit,
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          purchaseOrder: { select: { id: true, poNumber: true } },
          grn: { select: { id: true, grnNumber: true } },
          _count: { select: { items: true, allocations: true } },
        },
        orderBy: { invoiceDate: 'desc' },
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

  async getInvoiceById(merchantId: string, id: string) {
    const invoice = await this.db.supplierInvoice.findFirst({
      where: { id, merchantId },
      include: {
        supplier: true,
        purchaseOrder: {
          include: {
            items: {
              include: {
                variant: {
                  select: { id: true, sku: true, product: { select: { name: true } } },
                },
              },
            },
          },
        },
        grn: {
          include: {
            items: {
              include: {
                variant: {
                  select: { id: true, sku: true, product: { select: { name: true } } },
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
        allocations: {
          include: {
            payment: {
              select: {
                id: true,
                paymentNumber: true,
                paymentMethod: true,
                paymentDate: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Supplier Invoice ${id} not found.`);
    }

    return invoice;
  }

  async createInvoice(merchantId: string, dto: CreateSupplierInvoiceDto, actorId: string) {
    const supplier = await this.db.supplier.findFirst({
      where: { id: dto.supplierId, merchantId },
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${dto.supplierId} not found.`);
    }

    // Check duplicate invoice number
    const existing = await this.db.supplierInvoice.findUnique({
      where: {
        merchantId_supplierId_invoiceNumber: {
          merchantId,
          supplierId: dto.supplierId,
          invoiceNumber: dto.invoiceNumber.trim(),
        },
      },
    });
    if (existing) {
      throw new ConflictException(`Invoice "${dto.invoiceNumber}" already recorded for this supplier.`);
    }

    // Fetch PO and GRN if linked for 3-Way Matching
    const po = dto.purchaseOrderId
      ? await this.db.purchaseOrder.findFirst({
          where: { id: dto.purchaseOrderId, merchantId },
          include: { items: true },
        })
      : null;

    const grn = dto.grnId
      ? await this.db.goodsReceivedNote.findFirst({
          where: { id: dto.grnId, merchantId },
          include: { items: true },
        })
      : null;

    // 3-Way Matching Discrepancy Checks
    const discrepancies: string[] = [];

    let subtotal = 0;
    const itemsData = dto.items.map((item) => {
      const gross = Number(item.billedQuantity) * Number(item.unitCost);
      const discount = Number(item.discountAmount || 0);
      const tax = Number(item.taxAmount || 0);
      const lineTotal = Math.max(0, gross - discount + tax);
      subtotal += lineTotal;

      // Check against PO unit cost
      if (po) {
        const poItem = po.items.find((p) => p.variantId === item.variantId);
        if (poItem && Number(item.unitCost) > Number(poItem.unitCost)) {
          discrepancies.push(
            `Unit price ${item.unitCost} exceeds PO unit price ${poItem.unitCost} for variant ${item.variantId}`,
          );
        }
      }

      // Check against GRN accepted quantity
      if (grn) {
        const grnItem = grn.items.find((g) => g.variantId === item.variantId);
        if (grnItem) {
          const accepted = Number(Number(grnItem.acceptedQuantity) > 0 ? grnItem.acceptedQuantity : grnItem.quantityReceived);
          if (Number(item.billedQuantity) > accepted) {
            discrepancies.push(
              `Billed quantity ${item.billedQuantity} exceeds GRN accepted quantity ${accepted} for variant ${item.variantId}`,
            );
          }
        }
      }

      return {
        variantId: item.variantId,
        billedQuantity: item.billedQuantity,
        unitCost: item.unitCost,
        discountAmount: discount,
        taxAmount: tax,
        lineTotal,
      };
    });

    const headerDiscount = Number(dto.discountAmount || 0);
    const headerTax = Number(dto.taxAmount || 0);
    const shipping = Number(dto.shippingCharges || 0);
    const grandTotal = Math.max(0, subtotal - headerDiscount + headerTax + shipping);

    const matchStatus = discrepancies.length > 0 ? 'DISCREPANCY' : 'MATCHED';
    const discrepancyNote = discrepancies.length > 0 ? discrepancies.join('\n') : null;

    return this.db.supplierInvoice.create({
      data: {
        merchantId,
        supplierId: dto.supplierId,
        purchaseOrderId: dto.purchaseOrderId,
        grnId: dto.grnId,
        invoiceNumber: dto.invoiceNumber.trim(),
        invoiceDate: new Date(dto.invoiceDate),
        dueDate: new Date(dto.dueDate),
        subtotal,
        discountAmount: headerDiscount,
        taxAmount: headerTax,
        shippingCharges: shipping,
        totalAmount: grandTotal,
        paidAmount: 0,
        balanceAmount: grandTotal,
        status: SupplierInvoiceStatus.PENDING_VERIFICATION,
        matchStatus,
        discrepancyNote,
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

  async verifyInvoice(merchantId: string, id: string, dto: VerifySupplierInvoiceDto, actorId: string) {
    const invoice = await this.db.supplierInvoice.findFirst({
      where: { id, merchantId },
      include: { supplier: true },
    });

    if (!invoice) {
      throw new NotFoundException(`Supplier Invoice ${id} not found.`);
    }

    if (invoice.status !== SupplierInvoiceStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(
        `Invoice is already in status "${invoice.status}". Only PENDING_VERIFICATION invoices can be verified.`,
      );
    }

    return this.db.$transaction(async (tx) => {
      // 1. Update invoice status
      const updatedInvoice = await tx.supplierInvoice.update({
        where: { id },
        data: {
          status: SupplierInvoiceStatus.VERIFIED,
          verifiedById: actorId,
          verifiedAt: new Date(),
          notes: dto.notes ? `${invoice.notes ? invoice.notes + '\n' : ''}[Verified]: ${dto.notes}` : invoice.notes,
        },
      });

      // 2. Fetch latest supplier ledger entry for running balance
      const lastEntry = await tx.supplierLedgerEntry.findFirst({
        where: { merchantId, supplierId: invoice.supplierId },
        orderBy: { entryDate: 'desc' },
      });

      const currentBalance = lastEntry ? Number(lastEntry.runningBalance) : Number(invoice.supplier.outstandingPayables);
      const invoiceTotal = Number(invoice.totalAmount);
      const newRunningBalance = currentBalance + invoiceTotal;

      // 3. Post to Supplier Ledger
      await tx.supplierLedgerEntry.create({
        data: {
          merchantId,
          supplierId: invoice.supplierId,
          transactionType: SupplierLedgerTransactionType.INVOICE,
          referenceNumber: invoice.invoiceNumber,
          referenceId: invoice.id,
          debit: 0,
          credit: invoiceTotal,
          runningBalance: newRunningBalance,
          description: `Supplier Invoice verified: ${invoice.invoiceNumber}`,
          createdById: actorId,
        },
      });

      // 4. Update supplier outstandingPayables
      await tx.supplier.update({
        where: { id: invoice.supplierId },
        data: {
          outstandingPayables: {
            increment: invoiceTotal,
          },
        },
      });

      return updatedInvoice;
    });
  }

  async getThreeWayMatch(merchantId: string, id: string) {
    const invoice = await this.db.supplierInvoice.findFirst({
      where: { id, merchantId },
      include: {
        purchaseOrder: { include: { items: { include: { variant: true } } } },
        grn: { include: { items: { include: { variant: true } } } },
        items: { include: { variant: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Supplier Invoice ${id} not found.`);
    }

    // Build comparison lines
    const matrix = invoice.items.map((invItem) => {
      const poItem = invoice.purchaseOrder?.items.find((p) => p.variantId === invItem.variantId);
      const grnItem = invoice.grn?.items.find((g) => g.variantId === invItem.variantId);

      const orderedQty = poItem ? Number(poItem.quantityOrdered) : null;
      const poCost = poItem ? Number(poItem.unitCost) : null;

      const receivedQty = grnItem ? Number(grnItem.quantityReceived) : null;
      const acceptedQty = grnItem ? Number(Number(grnItem.acceptedQuantity) > 0 ? grnItem.acceptedQuantity : grnItem.quantityReceived) : null;

      const billedQty = Number(invItem.billedQuantity);
      const billedCost = Number(invItem.unitCost);

      const qtyVariance = acceptedQty !== null ? billedQty - acceptedQty : null;
      const priceVariance = poCost !== null ? billedCost - poCost : null;

      return {
        variantId: invItem.variantId,
        variantSku: invItem.variant.sku,
        variantName: invItem.variant.variantName,
        poOrderedQty: orderedQty,
        poUnitCost: poCost,
        grnReceivedQty: receivedQty,
        grnAcceptedQty: acceptedQty,
        invoiceBilledQty: billedQty,
        invoiceUnitCost: billedCost,
        qtyVariance,
        priceVariance,
        isDiscrepant: (qtyVariance !== null && qtyVariance > 0) || (priceVariance !== null && priceVariance > 0),
      };
    });

    return {
      invoiceNumber: invoice.invoiceNumber,
      poNumber: invoice.purchaseOrder?.poNumber,
      grnNumber: invoice.grn?.grnNumber,
      matchStatus: invoice.matchStatus,
      discrepancyNote: invoice.discrepancyNote,
      matrix,
    };
  }
}
