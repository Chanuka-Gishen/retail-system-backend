import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreatePurchaseRequisitionDto,
  ApproveRequisitionDto,
  RejectRequisitionDto,
  ConvertRequisitionToPODto,
  ListPurchaseRequisitionsQueryDto,
} from '../dto/purchase-requisition.dto';
import {
  PurchaseRequisitionStatus,
  PurchaseOrderStatus,
  Prisma,
} from '@prisma/client';

@Injectable()
export class PurchaseRequisitionService {
  constructor(private db: DatabaseService) {}

  async listRequisitions(merchantId: string, query: ListPurchaseRequisitionsQueryDto) {
    const { warehouseId, branchId, status, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseRequisitionWhereInput = {
      merchantId,
      ...(warehouseId && { warehouseId }),
      ...(branchId && { branchId }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { requisitionNo: { contains: search, mode: 'insensitive' } },
          { reason: { contains: search, mode: 'insensitive' } },
          { remarks: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.db.purchaseRequisition.count({ where }),
      this.db.purchaseRequisition.findMany({
        where,
        skip,
        take: limit,
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
          branch: { select: { id: true, code: true, name: true } },
          supplier: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true, purchaseOrders: true } },
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

  async getRequisitionById(merchantId: string, id: string) {
    const requisition = await this.db.purchaseRequisition.findFirst({
      where: { id, merchantId },
      include: {
        warehouse: true,
        branch: true,
        supplier: true,
        items: {
          include: {
            variant: {
              include: {
                product: { select: { id: true, code: true, name: true, unit: true } },
              },
            },
          },
        },
        purchaseOrders: {
          select: {
            id: true,
            poNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
          },
        },
      },
    });

    if (!requisition) {
      throw new NotFoundException(`Requisition ${id} not found.`);
    }

    return requisition;
  }

  async createRequisition(merchantId: string, dto: CreatePurchaseRequisitionDto, actorId: string) {
    // 1. Verify warehouse
    const warehouse = await this.db.warehouse.findFirst({
      where: { id: dto.warehouseId, merchantId, isActive: true },
    });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${dto.warehouseId} not found.`);
    }

    // 2. Generate Requisition Number
    const count = await this.db.purchaseRequisition.count({ where: { merchantId } });
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(count + 1).padStart(4, '0');
    const requisitionNo = `PR-${dateStr}-${seq}`;

    // 3. Process line items & get current stock
    let totalEstimated = 0;
    const itemsData = [];

    for (const item of dto.items) {
      const variant = await this.db.productVariant.findFirst({
        where: { id: item.variantId, merchantId, isActive: true },
        include: {
          stockBalances: {
            where: { warehouseId: dto.warehouseId },
          },
        },
      });

      if (!variant) {
        throw new NotFoundException(`Product variant ${item.variantId} not found.`);
      }

      const currentStock = variant.stockBalances[0]
        ? Number(variant.stockBalances[0].quantityOnHand)
        : 0;

      const unitCost = item.estimatedUnitCost !== undefined ? Number(item.estimatedUnitCost) : Number(variant.costPrice);
      const estTotal = item.requestedQuantity * unitCost;
      totalEstimated += estTotal;

      itemsData.push({
        variantId: item.variantId,
        requestedQuantity: item.requestedQuantity,
        approvedQuantity: item.requestedQuantity, // Default to requested
        currentStock,
        estimatedUnitCost: unitCost,
        estimatedTotal: estTotal,
        reason: item.reason?.trim(),
      });
    }

    return this.db.purchaseRequisition.create({
      data: {
        merchantId,
        requisitionNo,
        branchId: dto.branchId,
        warehouseId: dto.warehouseId,
        supplierId: dto.supplierId,
        status: PurchaseRequisitionStatus.PENDING_APPROVAL,
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : null,
        reason: dto.reason?.trim(),
        remarks: dto.remarks?.trim(),
        totalEstimated,
        createdById: actorId,
        items: {
          create: itemsData,
        },
      },
      include: {
        items: true,
        warehouse: true,
        supplier: true,
      },
    });
  }

  async approveRequisition(
    merchantId: string,
    id: string,
    dto: ApproveRequisitionDto,
    actorId: string,
  ) {
    const requisition = await this.db.purchaseRequisition.findFirst({
      where: { id, merchantId },
      include: { items: true },
    });

    if (!requisition) {
      throw new NotFoundException(`Requisition ${id} not found.`);
    }

    if (requisition.status !== PurchaseRequisitionStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Only requisitions in PENDING_APPROVAL can be approved (currently ${requisition.status}).`,
      );
    }

    return this.db.$transaction(async (tx) => {
      // If approved quantities are specified per item
      if (dto.approvedItems && dto.approvedItems.length > 0) {
        for (const itemDto of dto.approvedItems) {
          await tx.purchaseRequisitionItem.updateMany({
            where: { requisitionId: id, variantId: itemDto.variantId },
            data: { approvedQuantity: itemDto.approvedQuantity },
          });
        }
      }

      return tx.purchaseRequisition.update({
        where: { id },
        data: {
          status: PurchaseRequisitionStatus.APPROVED,
          approvedById: actorId,
          approvedAt: new Date(),
          remarks: dto.remarks
            ? `${requisition.remarks ? requisition.remarks + '\n' : ''}[Approved]: ${dto.remarks}`
            : requisition.remarks,
        },
        include: { items: true },
      });
    });
  }

  async rejectRequisition(
    merchantId: string,
    id: string,
    dto: RejectRequisitionDto,
    actorId: string,
  ) {
    const requisition = await this.db.purchaseRequisition.findFirst({
      where: { id, merchantId },
    });

    if (!requisition) {
      throw new NotFoundException(`Requisition ${id} not found.`);
    }

    if (requisition.status !== PurchaseRequisitionStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Only requisitions in PENDING_APPROVAL can be rejected (currently ${requisition.status}).`,
      );
    }

    return this.db.purchaseRequisition.update({
      where: { id },
      data: {
        status: PurchaseRequisitionStatus.REJECTED,
        approvedById: actorId,
        rejectionReason: dto.reason.trim(),
      },
    });
  }

  async convertToPO(
    merchantId: string,
    id: string,
    dto: ConvertRequisitionToPODto,
    actorId: string,
  ) {
    const requisition = await this.db.purchaseRequisition.findFirst({
      where: { id, merchantId },
      include: { items: true },
    });

    if (!requisition) {
      throw new NotFoundException(`Requisition ${id} not found.`);
    }

    if (requisition.status !== PurchaseRequisitionStatus.APPROVED) {
      throw new BadRequestException(
        `Only APPROVED requisitions can be converted to Purchase Orders (currently ${requisition.status}).`,
      );
    }

    const supplier = await this.db.supplier.findFirst({
      where: { id: dto.supplierId, merchantId, isActive: true },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier ${dto.supplierId} not found.`);
    }

    return this.db.$transaction(async (tx) => {
      // 1. Generate PO Number
      const poCount = await tx.purchaseOrder.count({ where: { merchantId } });
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const seq = String(poCount + 1).padStart(4, '0');
      const poNumber = `PO-${dateStr}-${seq}`;

      // 2. Prepare PO Items from approved requisition items
      const poItems = [];
      let subtotal = 0;

      for (const item of requisition.items) {
        const qty = Number(item.approvedQuantity);
        if (qty > 0) {
          const cost = Number(item.estimatedUnitCost);
          const lineTotal = qty * cost;
          subtotal += lineTotal;

          poItems.push({
            variantId: item.variantId,
            quantityOrdered: qty,
            quantityReceived: 0,
            freeQuantity: 0,
            unitCost: cost,
            lineTotal,
          });
        }
      }

      if (poItems.length === 0) {
        throw new BadRequestException('No items with approved quantity > 0 to create Purchase Order.');
      }

      // 3. Create PO
      const po = await tx.purchaseOrder.create({
        data: {
          merchantId,
          supplierId: dto.supplierId,
          warehouseId: requisition.warehouseId,
          branchId: requisition.branchId,
          requisitionId: requisition.id,
          poNumber,
          status: PurchaseOrderStatus.DRAFT,
          subtotal,
          totalAmount: subtotal,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : requisition.requiredDate,
          notes: dto.notes ? dto.notes.trim() : `Generated from Requisition ${requisition.requisitionNo}`,
          createdById: actorId,
          items: {
            create: poItems,
          },
        },
        include: { items: true },
      });

      // 4. Update Requisition status to CONVERTED
      await tx.purchaseRequisition.update({
        where: { id },
        data: { status: PurchaseRequisitionStatus.CONVERTED },
      });

      return po;
    });
  }
}
