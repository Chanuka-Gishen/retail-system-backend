import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import {
  CreateCustomerReturnDto,
  ListCustomerReturnsQueryDto,
} from '../dto/return.dto';
import {
  SaleStatus,
  MovementType,
  TenderType,
  Prisma,
} from '@prisma/client';

@Injectable()
export class PosReturnsService {
  constructor(private db: DatabaseService) {}

  async createReturn(merchantId: string, dto: CreateCustomerReturnDto, cashierId: string) {
    // 1. Validate Original Sale
    const sale = await this.db.sale.findFirst({
      where: { id: dto.saleId, merchantId },
      include: {
        branch: true,
        warehouse: true,
        customer: true,
        items: {
          include: {
            variant: true,
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException(`Sale ${dto.saleId} not found.`);
    }

    if (sale.status === SaleStatus.REFUNDED || sale.status === SaleStatus.VOIDED) {
      throw new BadRequestException(`Sale ${sale.invoiceNumber} cannot be returned because it is already ${sale.status}.`);
    }

    const branchId = dto.branchId || sale.branchId;
    const warehouseId = dto.warehouseId || sale.warehouseId;

    const branch = await this.db.branch.findFirst({
      where: { id: branchId, merchantId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch ${branchId} not found.`);
    }

    const warehouse = await this.db.warehouse.findFirst({
      where: { id: warehouseId, merchantId },
    });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${warehouseId} not found.`);
    }

    // 2. Validate Items & Quantities
    const saleItemMap = new Map(sale.items.map((si) => [si.id, si]));
    let totalRefundAmount = 0;

    const returnItemCalculations: Array<{
      saleItemId: string;
      variantId: string;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      refundSubtotal: number;
      returnAction: 'RETURN_TO_STOCK' | 'DAMAGE_DISPOSAL';
    }> = [];

    for (const itemDto of dto.items) {
      const saleItem = saleItemMap.get(itemDto.saleItemId);
      if (!saleItem) {
        throw new BadRequestException(`Sale item ${itemDto.saleItemId} does not belong to sale ${sale.invoiceNumber}.`);
      }

      const availableToReturn = Number(saleItem.quantity) - Number(saleItem.returnedQuantity);
      if (itemDto.quantity > availableToReturn) {
        throw new BadRequestException(
          `Cannot return ${itemDto.quantity} units of "${saleItem.variant.sku}". Only ${availableToReturn} unit(s) remaining available for return.`,
        );
      }

      // Proportional unit price calculation
      const unitPrice = Number(saleItem.lineTotal) / Number(saleItem.quantity);
      const refundSubtotal = Math.round(unitPrice * itemDto.quantity * 100) / 100;

      totalRefundAmount += refundSubtotal;

      returnItemCalculations.push({
        saleItemId: itemDto.saleItemId,
        variantId: saleItem.variantId,
        quantity: itemDto.quantity,
        unitPrice: Number(saleItem.unitPrice),
        unitCost: Number(saleItem.unitCost),
        refundSubtotal,
        returnAction: itemDto.returnAction,
      });
    }

    totalRefundAmount = Math.round(totalRefundAmount * 100) / 100;

    // 3. Generate Return Number, Voucher Code (if ITEM_TO_ITEM) and UUID
    const returnId = randomUUID();
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const returnNumber = `RET-${branch.code}-${todayStr}-${randomDigits}`;

    const refundMethod: 'CASH' | 'ONLINE_TRANSFER' | 'ITEM_TO_ITEM' =
      dto.refundMethod ||
      (dto.refundTender === TenderType.STORE_CREDIT
        ? 'ITEM_TO_ITEM'
        : dto.refundTender === TenderType.CARD
        ? 'ONLINE_TRANSFER'
        : 'CASH');

    let refundTender = dto.refundTender;
    if (!refundTender) {
      if (refundMethod === 'ITEM_TO_ITEM') refundTender = TenderType.STORE_CREDIT;
      else if (refundMethod === 'ONLINE_TRANSFER') refundTender = TenderType.CARD;
      else refundTender = TenderType.CASH;
    }

    let voucherCode: string | null = null;
    let voucherExpiresAt: Date | null = null;
    let voucherBalance = 0;

    if (refundMethod === 'ITEM_TO_ITEM') {
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      voucherCode = `EXC-${branch.code || 'B01'}-${randomSuffix}`;
      const hours = dto.voucherExpiresInHours && dto.voucherExpiresInHours > 0 ? dto.voucherExpiresInHours : 24;
      voucherExpiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      voucherBalance = totalRefundAmount;
    }

    // 4. Execute Atomic Return Transaction
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      // 4.1 Update Sale Items and Stock Balances
      for (const calc of returnItemCalculations) {
        const saleItem = saleItemMap.get(calc.saleItemId)!;
        const newReturnedQty = Number(saleItem.returnedQuantity) + calc.quantity;
        const isFullyReturned = newReturnedQty >= Number(saleItem.quantity);

        await tx.saleItem.update({
          where: { id: calc.saleItemId },
          data: {
            returnedQuantity: newReturnedQty,
            isReturned: isFullyReturned,
          },
        });

        if (calc.returnAction === 'RETURN_TO_STOCK') {
          // Find or create StockBalance
          let balance = await tx.stockBalance.findUnique({
            where: {
              merchantId_warehouseId_variantId: {
                merchantId,
                warehouseId,
                variantId: calc.variantId,
              },
            },
          });

          if (!balance) {
            balance = await tx.stockBalance.create({
              data: {
                merchantId,
                warehouseId,
                variantId: calc.variantId,
                quantityOnHand: calc.quantity,
                quantityAvailable: calc.quantity,
                quantityAllocated: 0,
              },
            });
          } else {
            const newOnHand = Number(balance.quantityOnHand) + calc.quantity;
            const newAvailable = Number(balance.quantityAvailable) + calc.quantity;

            balance = await tx.stockBalance.update({
              where: { id: balance.id },
              data: {
                quantityOnHand: newOnHand,
                quantityAvailable: newAvailable,
              },
            });
          }

          // Append strictly immutable InventoryMovement ledger
          await tx.inventoryMovement.create({
            data: {
              merchantId,
              warehouseId,
              variantId: calc.variantId,
              movementType: MovementType.SALE_RETURN,
              quantity: calc.quantity,
              unitCost: calc.unitCost,
              runningBalance: balance.quantityOnHand,
              referenceType: 'RETURN',
              referenceId: returnId,
              notes: `Customer Return Restock: ${returnNumber} (Ref Sale: ${sale.invoiceNumber})`,
              createdById: cashierId,
            },
          });
        } else if (calc.returnAction === 'DAMAGE_DISPOSAL') {
          // Log damage write-off movement for audit trail
          const existingBalance = await tx.stockBalance.findUnique({
            where: {
              merchantId_warehouseId_variantId: {
                merchantId,
                warehouseId,
                variantId: calc.variantId,
              },
            },
          });

          await tx.inventoryMovement.create({
            data: {
              merchantId,
              warehouseId,
              variantId: calc.variantId,
              movementType: MovementType.DAMAGE_DISPOSAL,
              quantity: 0,
              unitCost: calc.unitCost,
              runningBalance: existingBalance ? existingBalance.quantityOnHand : 0,
              referenceType: 'RETURN',
              referenceId: returnId,
              notes: `Customer Return Scrapped / Damaged: ${returnNumber}`,
              createdById: cashierId,
            },
          });
        }
      }

      // 4.2 Create CustomerReturn Record
      const customerReturn = await tx.customerReturn.create({
        data: {
          id: returnId,
          merchantId,
          branchId,
          warehouseId,
          saleId: sale.id,
          customerId: sale.customerId,
          returnNumber,
          refundAmount: totalRefundAmount,
          refundTender,
          refundMethod,
          transferReference: dto.transferReference?.trim() || null,
          voucherCode,
          voucherExpiresAt,
          voucherBalance,
          isVoucherRedeemed: false,
          reason: dto.reason?.trim() || null,
          items: {
            create: returnItemCalculations.map((ci) => ({
              saleItemId: ci.saleItemId,
              variantId: ci.variantId,
              quantity: ci.quantity,
              unitPrice: ci.unitPrice,
              refundSubtotal: ci.refundSubtotal,
              returnAction: ci.returnAction,
            })),
          },
        },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          sale: { select: { id: true, invoiceNumber: true, totalAmount: true } },
          customer: { select: { id: true, name: true, phone: true } },
          items: {
            include: {
              variant: {
                select: {
                  id: true,
                  sku: true,
                  variantName: true,
                  product: { select: { name: true, unit: true } },
                },
              },
            },
          },
        },
      });

      // 4.3 Evaluate Sale Status (REFUNDED vs PARTIALLY_REFUNDED)
      const allUpdatedItems = await tx.saleItem.findMany({
        where: { saleId: sale.id },
      });
      const allFullyReturned = allUpdatedItems.every((si) => si.isReturned);
      const newSaleStatus = allFullyReturned ? SaleStatus.REFUNDED : SaleStatus.PARTIALLY_REFUNDED;

      await tx.sale.update({
        where: { id: sale.id },
        data: { status: newSaleStatus },
      });

      // 4.4 Loyalty Points Reversal (if sale had customer attached)
      if (sale.customerId && sale.customer) {
        const pointsToReverse = Math.floor(totalRefundAmount / 100);
        if (pointsToReverse > 0) {
          const currentPoints = sale.customer.loyaltyPoints;
          const adjustedPoints = Math.max(0, currentPoints - pointsToReverse);
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { loyaltyPoints: adjustedPoints },
          });
        }
      }

      // 4.5 If cash refund, record CASH_OUT against active drawer session if open
      if (refundMethod === 'CASH') {
        const activeSession = await tx.cashSession.findFirst({
          where: {
            merchantId,
            branchId,
            status: 'OPEN',
          },
          orderBy: { openedAt: 'desc' },
        });

        if (activeSession) {
          await tx.cashTransaction.create({
            data: {
              sessionId: activeSession.id,
              merchantId,
              type: 'CASH_OUT',
              amount: totalRefundAmount,
              reason: `Customer Cash Refund: ${returnNumber} (Ref Sale: ${sale.invoiceNumber})`,
              performedById: cashierId,
            },
          });
        }
      }

      return customerReturn;
    });
  }

  async listReturns(merchantId: string, query: ListCustomerReturnsQueryDto) {
    const {
      saleId,
      branchId,
      warehouseId,
      customerId,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerReturnWhereInput = {
      merchantId,
      ...(saleId && { saleId }),
      ...(branchId && { branchId }),
      ...(warehouseId && { warehouseId }),
      ...(customerId && { customerId }),
      ...(search && {
        returnNumber: { contains: search, mode: 'insensitive' },
      }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
    };

    const [total, items] = await Promise.all([
      this.db.customerReturn.count({ where }),
      this.db.customerReturn.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          sale: { select: { id: true, invoiceNumber: true } },
          customer: { select: { id: true, name: true, phone: true } },
          _count: { select: { items: true } },
        },
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
    const customerReturn = await this.db.customerReturn.findFirst({
      where: { id, merchantId },
      include: {
        branch: true,
        warehouse: true,
        sale: {
          include: {
            cashier: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        customer: true,
        items: {
          include: {
            variant: {
              include: {
                product: { select: { id: true, name: true, unit: true } },
              },
            },
            saleItem: true,
          },
        },
      },
    });

    if (!customerReturn) {
      throw new NotFoundException(`Customer return ${id} not found.`);
    }

    return customerReturn;
  }

  async getReturnReceipt(merchantId: string, id: string) {
    const ret = await this.getReturnById(merchantId, id);
    const merchant = await this.db.merchant.findUnique({
      where: { id: merchantId },
      select: { businessName: true, tradeName: true, taxNumber: true, contactEmail: true, contactPhone: true },
    });

    const isItemToItem = ret.refundMethod === 'ITEM_TO_ITEM' || ret.voucherCode !== null;
    const isOnlineTransfer = ret.refundMethod === 'ONLINE_TRANSFER';

    return {
      id: ret.id,
      returnNumber: ret.returnNumber,
      originalInvoiceNumber: ret.sale.invoiceNumber,
      issuedAt: ret.createdAt,
      store: {
        companyName: merchant?.tradeName || merchant?.businessName,
        taxNumber: merchant?.taxNumber,
        branchName: ret.branch.name,
        branchAddress: ret.branch.address,
        branchPhone: ret.branch.phone,
      },
      customer: ret.customer ? { name: ret.customer.name, phone: ret.customer.phone } : null,
      refundTender: ret.refundTender,
      refundMethod: ret.refundMethod || 'CASH',
      transferReference: ret.transferReference,
      voucherCode: ret.voucherCode,
      voucherExpiresAt: ret.voucherExpiresAt,
      voucherBalance: Number(ret.voucherBalance || 0),
      isVoucherRedeemed: ret.isVoucherRedeemed,
      totalRefund: Number(ret.refundAmount),
      reason: ret.reason,
      items: ret.items.map((i) => ({
        sku: i.variant.sku,
        name: i.variant.product.name,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        refundSubtotal: Number(i.refundSubtotal),
        returnAction: i.returnAction,
      })),
      footer: {
        message: isItemToItem
          ? 'EXCHANGE CREDIT VOUCHER: Valid for 24 hours only. Present this voucher or barcode at checkout to deduct from your next purchase.'
          : isOnlineTransfer
          ? `Online transfer refund processed to customer. Ref: ${ret.transferReference || 'N/A'}`
          : 'Cash refund disbursed from register.',
      },
    };
  }

  async verifyVoucher(merchantId: string, voucherCode: string) {
    const cleanCode = voucherCode.trim().toUpperCase();
    const ret = await this.db.customerReturn.findFirst({
      where: {
        merchantId,
        voucherCode: cleanCode,
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
        sale: { select: { id: true, invoiceNumber: true } },
      },
    });

    if (!ret) {
      return {
        isValid: false,
        error: `Voucher "${cleanCode}" was not found or does not belong to this merchant.`,
      };
    }

    const now = new Date();
    const isExpired = ret.voucherExpiresAt ? now > ret.voucherExpiresAt : false;
    const balance = Number(ret.voucherBalance || 0);

    if (ret.isVoucherRedeemed || balance <= 0) {
      return {
        isValid: false,
        voucherCode: ret.voucherCode,
        isRedeemed: true,
        isExpired,
        error: `Exchange voucher ${ret.voucherCode} has already been fully redeemed.`,
      };
    }

    if (isExpired) {
      return {
        isValid: false,
        voucherCode: ret.voucherCode,
        isRedeemed: false,
        isExpired: true,
        error: `Exchange voucher expired on ${ret.voucherExpiresAt?.toLocaleString()} (24-hour validity limit exceeded).`,
      };
    }

    const msRemaining = (ret.voucherExpiresAt?.getTime() || 0) - now.getTime();
    const hoursRemaining = Math.max(0, Math.floor(msRemaining / (1000 * 60 * 60)));
    const minutesRemaining = Math.max(0, Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60)));

    return {
      isValid: true,
      voucherCode: ret.voucherCode,
      returnId: ret.id,
      returnNumber: ret.returnNumber,
      originalInvoiceNumber: ret.sale.invoiceNumber,
      initialAmount: Number(ret.refundAmount),
      balance,
      expiresAt: ret.voucherExpiresAt,
      hoursRemaining,
      minutesRemaining,
      customer: ret.customer,
      branch: ret.branch,
    };
  }
}
