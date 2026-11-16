import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  RejectPurchaseOrderDto,
  ListPurchaseOrdersQueryDto,
} from '../dto/purchase-order.dto';
import { PurchaseOrderStatus, Prisma } from '@prisma/client';

@Injectable()
export class PurchaseOrderService {
  constructor(private db: DatabaseService) {}

  async listPurchaseOrders(merchantId: string, query: ListPurchaseOrdersQueryDto) {
    const { supplierId, warehouseId, branchId, status, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = {
      merchantId,
      ...(supplierId && { supplierId }),
      ...(warehouseId && { warehouseId }),
      ...(branchId && { branchId }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { poNumber: { contains: search, mode: 'insensitive' } },
          { referenceNumber: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.db.purchaseOrder.count({ where }),
      this.db.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          branch: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true, grns: true, invoices: true } },
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

  async getPurchaseOrderById(merchantId: string, id: string) {
    const po = await this.db.purchaseOrder.findFirst({
      where: { id, merchantId },
      include: {
        supplier: true,
        warehouse: true,
        branch: true,
        requisition: { select: { id: true, requisitionNo: true } },
        items: {
          include: {
            variant: {
              include: {
                product: { select: { id: true, code: true, name: true, unit: true } },
              },
            },
          },
        },
        grns: {
          select: {
            id: true,
            grnNumber: true,
            status: true,
            totalAmount: true,
            receivedAt: true,
            postedAt: true,
          },
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
            balanceAmount: true,
            dueDate: true,
          },
        },
      },
    });

    if (!po) {
      throw new NotFoundException(`Purchase Order ${id} not found.`);
    }

    return po;
  }

  async createPurchaseOrder(merchantId: string, dto: CreatePurchaseOrderDto, actorId: string) {
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

    // 3. Validate Variants
    const variantIds = dto.items.map((i) => i.variantId);
    const variants = await this.db.productVariant.findMany({
      where: { id: { in: variantIds }, merchantId },
    });
    if (variants.length !== variantIds.length) {
      throw new BadRequestException('One or more product variants were not found.');
    }

    // 4. Calculate line totals and subtotal
    let subtotal = 0;
    const itemsData = dto.items.map((item) => {
      const gross = Number(item.quantityOrdered) * Number(item.unitCost);
      const discount = Number(item.discountAmount || 0);
      const tax = Number(item.taxAmount || 0);
      const lineTotal = Math.max(0, gross - discount + tax);
      subtotal += lineTotal;

      return {
        variantId: item.variantId,
        quantityOrdered: item.quantityOrdered,
        freeQuantity: item.freeQuantity || 0,
        unitCost: item.unitCost,
        discountAmount: discount,
        taxAmount: tax,
        lineTotal,
      };
    });

    const headerDiscount = Number(dto.discountAmount || 0);
    const headerTax = Number(dto.taxAmount || 0);
    const shipping = Number(dto.shippingCharges || 0);
    const other = Number(dto.otherCharges || 0);
    const grandTotal = Math.max(0, subtotal - headerDiscount + headerTax + shipping + other);

    // 5. Generate PO number
    const count = await this.db.purchaseOrder.count({ where: { merchantId } });
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(count + 1).padStart(4, '0');
    const poNumber = `PO-${dateStr}-${seq}`;

    return this.db.purchaseOrder.create({
      data: {
        merchantId,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        branchId: dto.branchId,
        requisitionId: dto.requisitionId,
        poNumber,
        status: PurchaseOrderStatus.DRAFT,
        subtotal,
        discountAmount: headerDiscount,
        taxAmount: headerTax,
        shippingCharges: shipping,
        otherCharges: other,
        totalAmount: grandTotal,
        currency: dto.currency || supplier.defaultCurrency || 'LKR',
        paymentTerms: dto.paymentTerms || `${supplier.creditDays} Days`,
        referenceNumber: dto.referenceNumber?.trim(),
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        notes: dto.notes?.trim(),
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

  async approvePurchaseOrder(merchantId: string, id: string, actorId: string) {
    const po = await this.db.purchaseOrder.findFirst({
      where: { id, merchantId },
    });

    if (!po) {
      throw new NotFoundException(`Purchase Order ${id} not found.`);
    }

    if (po.status !== PurchaseOrderStatus.DRAFT && po.status !== PurchaseOrderStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Cannot approve PO with status "${po.status}". Only DRAFT or PENDING_APPROVAL POs can be approved.`,
      );
    }

    return this.db.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.APPROVED,
        approvedById: actorId,
        approvedAt: new Date(),
      },
      include: {
        supplier: true,
        items: true,
      },
    });
  }

  async rejectPurchaseOrder(merchantId: string, id: string, dto: RejectPurchaseOrderDto, actorId: string) {
    const po = await this.db.purchaseOrder.findFirst({
      where: { id, merchantId },
    });

    if (!po) {
      throw new NotFoundException(`Purchase Order ${id} not found.`);
    }

    return this.db.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.REJECTED,
        approvedById: actorId,
        rejectionReason: dto.reason.trim(),
      },
    });
  }

  async issuePurchaseOrder(merchantId: string, id: string, _actorId: string) {
    const po = await this.db.purchaseOrder.findFirst({
      where: { id, merchantId },
    });

    if (!po) {
      throw new NotFoundException(`Purchase Order ${id} not found.`);
    }

    if (
      po.status !== PurchaseOrderStatus.DRAFT &&
      po.status !== PurchaseOrderStatus.APPROVED &&
      po.status !== PurchaseOrderStatus.PENDING_APPROVAL
    ) {
      throw new BadRequestException(
        `Cannot issue purchase order with status "${po.status}".`,
      );
    }

    return this.db.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.ISSUED,
        issuedAt: new Date(),
      },
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        items: true,
      },
    });
  }

  async updatePurchaseOrder(
    merchantId: string,
    id: string,
    dto: UpdatePurchaseOrderDto,
  ) {
    const po = await this.db.purchaseOrder.findFirst({
      where: { id, merchantId },
    });

    if (!po) {
      throw new NotFoundException(`Purchase Order ${id} not found.`);
    }

    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot update purchase order with status "${po.status}". Only DRAFT purchase orders can be edited.`,
      );
    }

    let updateData: Prisma.PurchaseOrderUpdateInput = {
      ...(dto.expectedDate && { expectedDate: new Date(dto.expectedDate) }),
      ...(dto.paymentTerms !== undefined && { paymentTerms: dto.paymentTerms }),
      ...(dto.referenceNumber !== undefined && { referenceNumber: dto.referenceNumber }),
      ...(dto.discountAmount !== undefined && { discountAmount: dto.discountAmount }),
      ...(dto.taxAmount !== undefined && { taxAmount: dto.taxAmount }),
      ...(dto.shippingCharges !== undefined && { shippingCharges: dto.shippingCharges }),
      ...(dto.otherCharges !== undefined && { otherCharges: dto.otherCharges }),
      ...(dto.notes !== undefined && { notes: dto.notes.trim() }),
    };

    if (dto.items && dto.items.length > 0) {
      let subtotal = 0;
      const itemsData = dto.items.map((item) => {
        const gross = Number(item.quantityOrdered) * Number(item.unitCost);
        const discount = Number(item.discountAmount || 0);
        const tax = Number(item.taxAmount || 0);
        const lineTotal = Math.max(0, gross - discount + tax);
        subtotal += lineTotal;

        return {
          variantId: item.variantId,
          quantityOrdered: item.quantityOrdered,
          freeQuantity: item.freeQuantity || 0,
          unitCost: item.unitCost,
          discountAmount: discount,
          taxAmount: tax,
          lineTotal,
        };
      });

      const headerDiscount = dto.discountAmount !== undefined ? Number(dto.discountAmount) : Number(po.discountAmount);
      const headerTax = dto.taxAmount !== undefined ? Number(dto.taxAmount) : Number(po.taxAmount);
      const shipping = dto.shippingCharges !== undefined ? Number(dto.shippingCharges) : Number(po.shippingCharges);
      const other = dto.otherCharges !== undefined ? Number(dto.otherCharges) : Number(po.otherCharges);
      const grandTotal = Math.max(0, subtotal - headerDiscount + headerTax + shipping + other);

      return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.purchaseOrderItem.deleteMany({ where: { poId: id } });
        return tx.purchaseOrder.update({
          where: { id },
          data: {
            ...updateData,
            subtotal,
            totalAmount: grandTotal,
            items: { create: itemsData },
          },
          include: {
            supplier: { select: { id: true, code: true, name: true } },
            warehouse: { select: { id: true, code: true, name: true } },
            items: {
              include: {
                variant: { select: { id: true, sku: true, product: { select: { name: true } } } },
              },
            },
          },
        });
      });
    }

    return this.db.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        items: true,
      },
    });
  }

  async cancelPurchaseOrder(merchantId: string, id: string, _actorId: string) {
    const po = await this.db.purchaseOrder.findFirst({
      where: { id, merchantId },
      include: { grns: true },
    });

    if (!po) {
      throw new NotFoundException(`Purchase Order ${id} not found.`);
    }

    if (
      po.status === PurchaseOrderStatus.COMPLETED ||
      po.status === PurchaseOrderStatus.CANCELLED ||
      po.status === PurchaseOrderStatus.PARTIALLY_RECEIVED
    ) {
      throw new BadRequestException(
        `Cannot cancel purchase order with status "${po.status}".`,
      );
    }

    return this.db.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.CANCELLED,
      },
    });
  }
}
