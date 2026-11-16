import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import {
  CreateCheckoutDto,
  ListSalesQueryDto,
} from '../dto/checkout.dto';
import {
  SaleStatus,
  MovementType,
  TenderType,
  CashSessionStatus,
  Prisma,
} from '@prisma/client';

@Injectable()
export class PosCheckoutService {
  constructor(private db: DatabaseService) {}

  async checkout(merchantId: string, dto: CreateCheckoutDto, cashierId: string) {
    // 1. Idempotency Check (clientOperationId)
    if (dto.clientOperationId) {
      const existingSale = await this.db.sale.findUnique({
        where: {
          merchantId_clientOperationId: {
            merchantId,
            clientOperationId: dto.clientOperationId,
          },
        },
        include: {
          items: {
            include: {
              variant: {
                select: { id: true, sku: true, variantName: true, product: { select: { name: true } } },
              },
            },
          },
          payments: true,
          customer: { select: { id: true, name: true, phone: true } },
          cashier: { select: { id: true, firstName: true, lastName: true } },
          branch: { select: { id: true, code: true, name: true } },
        },
      });

      if (existingSale) {
        return existingSale;
      }
    }

    // 2. Validate Branch
    let branch =
      dto.branchId && dto.branchId !== '00000000-0000-0000-0000-000000000000'
        ? await this.db.branch.findFirst({
            where: { id: dto.branchId, merchantId, isActive: true },
          })
        : null;

    if (!branch) {
      // Fallback to merchant's main branch or first active branch
      branch = await this.db.branch.findFirst({
        where: { merchantId, isActive: true },
        orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
      });
    }

    if (!branch) {
      throw new NotFoundException(`No active branch found for merchant ${merchantId}.`);
    }

    // 3. Resolve Warehouse
    let warehouseId = dto.warehouseId || branch.defaultWarehouseId;
    if (!warehouseId) {
      const mainWh = await this.db.warehouse.findFirst({
        where: { merchantId, isMain: true, isActive: true },
      });
      if (mainWh) warehouseId = mainWh.id;
    }

    let warehouse = warehouseId
      ? await this.db.warehouse.findFirst({
          where: { id: warehouseId, merchantId, isActive: true },
        })
      : null;

    if (!warehouse) {
      warehouse = await this.db.warehouse.findFirst({
        where: { merchantId, isActive: true },
        orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
      });
      if (warehouse) warehouseId = warehouse.id;
    }

    if (!warehouse || !warehouseId) {
      throw new NotFoundException(`No active warehouse found for merchant ${merchantId}.`);
    }

    // 4. Resolve Cash Drawer Session
    let cashSessionId = dto.cashSessionId;
    if (!cashSessionId) {
      // Auto-detect open session for terminal or cashier
      const activeSession = await this.db.cashSession.findFirst({
        where: {
          merchantId,
          branchId: branch.id,
          status: CashSessionStatus.OPEN,
          ...(dto.posTerminalId
            ? { posTerminalId: dto.posTerminalId }
            : { openedById: cashierId }),
        },
      });
      if (activeSession) {
        cashSessionId = activeSession.id;
      }
    } else {
      const session = await this.db.cashSession.findFirst({
        where: { id: cashSessionId, merchantId },
      });
      if (!session) {
        if (!dto.isOfflineSync) {
          throw new BadRequestException(`Specified cash session ${cashSessionId} not found.`);
        }
        cashSessionId = undefined;
      } else if (session.status !== CashSessionStatus.OPEN && !dto.isOfflineSync) {
        throw new BadRequestException(`Specified cash session ${cashSessionId} is not in OPEN status.`);
      }
    }

    // 5. Load and Validate Catalog Variants with Batches
    const variantIds = dto.items.map((i) => i.variantId);
    const variants = await this.db.productVariant.findMany({
      where: { id: { in: variantIds }, merchantId },
      include: {
        product: {
          include: { taxProfile: true },
        },
        batches: {
          where: {
            warehouseId,
            isActive: true,
            quantityOnHand: { gt: 0 },
          },
          orderBy: [
            { expiryDate: 'asc' },
            { receivedDate: 'asc' },
          ],
        },
      },
    });

    if (variants.length !== variantIds.length) {
      throw new BadRequestException('One or more product variants were not found in catalog.');
    }

    const variantMap = new Map(variants.map((v) => [v.id, v]));
    const now = new Date();

    // 6. Pricing, Discounts & Tax Calculations (supporting Batch Prices, FEFO/FIFO, and Expiry Check)
    let subtotal = 0;
    let itemDiscountsTotal = 0;
    let totalTax = 0;
    let totalBeforeCartDiscount = 0;

    const computedItems: Array<{
      variantId: string;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      discountAmount: number;
      taxAmount: number;
      lineTotal: number;
      batchId?: string;
      batchNumber?: string;
      expiryDate?: Date | null;
      batchesToDeduct: Array<{ id: string; quantity: number }>;
    }> = [];

    for (const item of dto.items) {
      const variant = variantMap.get(item.variantId)!;
      const quantity = Number(item.quantity);
      let unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : 0;
      let unitCost = Number(variant.costPrice);
      let selectedBatchId: string | undefined = item.batchId;
      let selectedBatchNumber: string | undefined = undefined;
      let selectedExpiryDate: Date | null | undefined = undefined;
      const batchesToDeduct: Array<{ id: string; quantity: number }> = [];

      // Check variant batches for this warehouse
      const availableBatches = variant.batches || [];
      const nonExpiredBatches = availableBatches.filter(
        (b) => !b.expiryDate || new Date(b.expiryDate) >= now,
      );

      if (selectedBatchId) {
        // Specific batch requested by cashier
        const explicitBatch = availableBatches.find((b) => b.id === selectedBatchId) ||
          await this.db.productBatch.findFirst({
            where: { id: selectedBatchId, merchantId, warehouseId },
          });

        if (!explicitBatch) {
          throw new BadRequestException(`Specified batch ${selectedBatchId} not found in this warehouse.`);
        }

        // Validate expiry
        if (explicitBatch.expiryDate && new Date(explicitBatch.expiryDate) < now) {
          throw new BadRequestException(
            `Batch "${explicitBatch.batchNumber}" for "${variant.sku}" expired on ${explicitBatch.expiryDate.toISOString().slice(0, 10)}. Expired items cannot be sold.`,
          );
        }

        selectedBatchNumber = explicitBatch.batchNumber;
        selectedExpiryDate = explicitBatch.expiryDate;
        if (item.unitPrice === undefined) {
          unitPrice = Number(explicitBatch.sellingPrice);
        }
        unitCost = Number(explicitBatch.costPrice);

        if (Number(explicitBatch.quantityOnHand) < quantity && !dto.isOfflineSync) {
          throw new BadRequestException(
            `Insufficient stock in batch "${explicitBatch.batchNumber}". Available: ${explicitBatch.quantityOnHand}, requested: ${quantity}.`,
          );
        }
        batchesToDeduct.push({ id: explicitBatch.id, quantity });
      } else if (availableBatches.length > 0) {
        // FEFO / FIFO Auto-allocation
        if (nonExpiredBatches.length === 0) {
          throw new BadRequestException(
            `All available stock for variant "${variant.sku}" has expired. Expired items cannot be sold.`,
          );
        }

        const primaryBatch = nonExpiredBatches[0]!;
        selectedBatchId = primaryBatch.id;
        selectedBatchNumber = primaryBatch.batchNumber;
        selectedExpiryDate = primaryBatch.expiryDate;

        if (item.unitPrice === undefined) {
          unitPrice = Number(primaryBatch.sellingPrice);
        }
        unitCost = Number(primaryBatch.costPrice);

        // Allocate across non-expired batches in FEFO order
        let remainingNeeded = quantity;
        for (const b of nonExpiredBatches) {
          if (remainingNeeded <= 0) break;
          const bOnHand = Number(b.quantityOnHand);
          if (bOnHand <= 0) continue;
          const alloc = Math.min(remainingNeeded, bOnHand);
          batchesToDeduct.push({ id: b.id, quantity: alloc });
          remainingNeeded = Math.round((remainingNeeded - alloc) * 1000) / 1000;
        }
      } else {
        // Unbatched stock fallback
        if (item.unitPrice === undefined) {
          unitPrice = Number(variant.sellingPrice);
        }
      }

      // Verify minimum selling price guard
      if (variant.minSellingPrice && unitPrice < Number(variant.minSellingPrice)) {
        throw new BadRequestException(
          `Unit price (${unitPrice}) for variant "${variant.sku}" cannot be below minimum selling price (${variant.minSellingPrice}).`,
        );
      }

      // Discount Calculation (auto-apply variant discount if item discount not explicitly set)
      let discountAmount = Number(item.discountAmount ?? 0);
      if (discountAmount <= 0) {
        if (Number(variant.discountPercentage) > 0) {
          discountAmount = Math.round(unitPrice * quantity * (Number(variant.discountPercentage) / 100) * 100) / 100;
        } else if (Number(variant.discountAmount) > 0) {
          discountAmount = Math.min(unitPrice * quantity, Math.round(Number(variant.discountAmount) * quantity * 100) / 100);
        }
      }

      const netLine = Math.max(0, unitPrice * quantity - discountAmount);
      let lineTax = 0;
      let lineTotal = netLine;

      const taxProfile = variant.product?.taxProfile;
      if (taxProfile && taxProfile.isActive) {
        const rate = Number(taxProfile.ratePercentage);
        if (taxProfile.isInclusive) {
          lineTax = netLine - netLine / (1 + rate / 100);
          lineTotal = netLine;
        } else {
          lineTax = netLine * (rate / 100);
          lineTotal = netLine + lineTax;
        }
      }

      lineTax = Math.round(lineTax * 100) / 100;
      lineTotal = Math.round(lineTotal * 100) / 100;

      subtotal += unitPrice * quantity;
      itemDiscountsTotal += discountAmount;
      totalTax += lineTax;
      totalBeforeCartDiscount += lineTotal;

      computedItems.push({
        variantId: item.variantId,
        quantity,
        unitPrice,
        unitCost,
        discountAmount,
        taxAmount: lineTax,
        lineTotal,
        batchId: selectedBatchId,
        batchNumber: selectedBatchNumber,
        expiryDate: selectedExpiryDate,
        batchesToDeduct,
      });
    }

    const cartDiscount = Number(dto.cartDiscountAmount ?? 0);
    const discountAmount = Math.round((itemDiscountsTotal + cartDiscount) * 100) / 100;
    const totalAmount = Math.max(0, Math.round((totalBeforeCartDiscount - cartDiscount) * 100) / 100);
    subtotal = Math.round(subtotal * 100) / 100;
    totalTax = Math.round(totalTax * 100) / 100;

    // 7. Validate Payments & Calculate Change
    let totalPaid = 0;
    let hasCashPayment = false;
    for (const p of dto.payments) {
      totalPaid += Number(p.amount);
      if (p.tenderType === TenderType.CASH) {
        hasCashPayment = true;
      }
    }
    totalPaid = Math.round(totalPaid * 100) / 100;

    if (totalPaid < totalAmount) {
      throw new BadRequestException(
        `Insufficient payment tendered. Total due: LKR ${totalAmount.toFixed(2)}, total paid: LKR ${totalPaid.toFixed(2)}.`,
      );
    }

    const changeGiven = totalPaid > totalAmount && hasCashPayment ? Math.round((totalPaid - totalAmount) * 100) / 100 : 0;
    const paidAmount = totalPaid;

    // 8. Generate Unique Invoice Number
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-${branch.code}-${todayStr}-${randomDigits}`;

    // 9. Execute Atomic Sale & Stock Deduction Transaction
    const saleId = randomUUID();

    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      // 9.1 Verify and deduct inventory for each item
      for (const item of computedItems) {
        const variant = variantMap.get(item.variantId)!;

        // Deduct from batches
        for (const bDeduct of item.batchesToDeduct) {
          await tx.productBatch.update({
            where: { id: bDeduct.id },
            data: {
              quantityOnHand: { decrement: bDeduct.quantity },
              quantitySold: { increment: bDeduct.quantity },
            },
          });
        }

        const balance = await tx.stockBalance.findUnique({
          where: {
            merchantId_warehouseId_variantId: {
              merchantId,
              warehouseId,
              variantId: item.variantId,
            },
          },
        });

        const currentOnHand = balance ? Number(balance.quantityOnHand) : 0;
        const currentAllocated = balance ? Number(balance.quantityAllocated) : 0;

        if (currentOnHand < item.quantity) {
          if (!dto.isOfflineSync) {
            throw new BadRequestException(
              `Insufficient stock in warehouse "${warehouse.name}" for "${variant.sku}". Available: ${currentOnHand}, requested: ${item.quantity}.`,
            );
          }
        }

        const newOnHand = currentOnHand - item.quantity;
        const newAvailable = Math.max(0, newOnHand - currentAllocated);

        // Update or insert Stock Balance atomically
        await tx.stockBalance.upsert({
          where: {
            merchantId_warehouseId_variantId: {
              merchantId,
              warehouseId,
              variantId: item.variantId,
            },
          },
          update: {
            quantityOnHand: newOnHand,
            quantityAvailable: newAvailable,
          },
          create: {
            merchantId,
            warehouseId,
            variantId: item.variantId,
            quantityOnHand: newOnHand,
            quantityAllocated: 0,
            quantityAvailable: newAvailable,
          },
        });

        // Append Strictly Immutable InventoryMovement Ledger
        await tx.inventoryMovement.create({
          data: {
            merchantId,
            warehouseId,
            variantId: item.variantId,
            movementType: MovementType.SALE_DEDUCTION,
            quantity: -item.quantity,
            unitCost: item.unitCost,
            runningBalance: newOnHand,
            batchNumber: item.batchNumber,
            referenceType: 'SALE',
            referenceId: saleId, // Reference sale UUID
            notes: dto.isOfflineSync
              ? `POS Offline Sale Sync: ${invoiceNumber}${item.batchNumber ? ' [Batch ' + item.batchNumber + ']' : ''}`
              : `POS Sale: ${invoiceNumber}${item.batchNumber ? ' [Batch ' + item.batchNumber + ']' : ''}`,
            createdById: cashierId,
          },
        });
      }

      // 9.2 Create Sale Record
      const sale = await tx.sale.create({
        data: {
          id: saleId,
          merchantId,
          branchId: branch.id,
          warehouseId,
          posTerminalId: dto.posTerminalId,
          cashSessionId,
          customerId: dto.customerId,
          cashierId,
          invoiceNumber,
          clientOperationId: dto.clientOperationId?.trim(),
          subtotal,
          taxAmount: totalTax,
          discountAmount,
          totalAmount,
          paidAmount,
          changeGiven,
          status: SaleStatus.COMPLETED,
          isOfflineSync: dto.isOfflineSync ?? false,
          syncedAt: dto.isOfflineSync ? new Date() : null,
          createdAt: dto.completedAt ? new Date(dto.completedAt) : new Date(),
          items: {
            create: computedItems.map((ci) => ({
              merchantId,
              variantId: ci.variantId,
              quantity: ci.quantity,
              unitCost: ci.unitCost,
              unitPrice: ci.unitPrice,
              discountAmount: ci.discountAmount,
              taxAmount: ci.taxAmount,
              lineTotal: ci.lineTotal,
              batchId: ci.batchId,
              batchNumber: ci.batchNumber,
              expiryDate: ci.expiryDate,
            })),
          },
          payments: {
            create: dto.payments.map((p) => ({
              merchantId,
              tenderType: p.tenderType,
              amount: p.amount,
              referenceNumber: p.referenceNumber?.trim(),
            })),
          },
        },
        include: {
          branch: { select: { id: true, code: true, name: true, address: true, phone: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          posTerminal: { select: { id: true, code: true, name: true } },
          cashSession: { select: { id: true, status: true, openingFloat: true } },
          customer: { select: { id: true, code: true, name: true, phone: true, loyaltyPoints: true } },
          cashier: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              variant: {
                select: {
                  id: true,
                  sku: true,
                  barcode: true,
                  variantName: true,
                  product: { select: { id: true, name: true, unit: true } },
                },
              },
            },
          },
          payments: true,
        },
      });

      // 9.3 Update Customer Loyalty Points if customer attached
      if (dto.customerId) {
        // Loyalty calculation: 1 point per LKR 100 spent
        const earnedPoints = Math.floor(totalAmount / 100);
        if (earnedPoints > 0) {
          await tx.customer.update({
            where: { id: dto.customerId },
            data: {
              loyaltyPoints: { increment: earnedPoints },
            },
          });
        }
      }

      // 9.4 Process Store Credit / Exchange Voucher Redemption
      for (const p of dto.payments) {
        if (p.tenderType === TenderType.STORE_CREDIT && p.referenceNumber) {
          const voucherCode = p.referenceNumber.trim().toUpperCase();
          const voucher = await tx.customerReturn.findFirst({
            where: {
              merchantId,
              voucherCode,
            },
          });

          if (voucher) {
            const currentBal = Number(voucher.voucherBalance || 0);
            const appliedAmt = Math.min(Number(p.amount), currentBal);
            const newBal = Math.max(0, currentBal - appliedAmt);
            const isFullyRedeemed = newBal <= 0.001;

            await tx.customerReturn.update({
              where: { id: voucher.id },
              data: {
                voucherBalance: newBal,
                isVoucherRedeemed: isFullyRedeemed,
                voucherRedeemedAt: new Date(),
                voucherRedeemedSaleId: sale.id,
              },
            });
          }
        }
      }

      return sale;
    });
  }

  async listSales(merchantId: string, query: ListSalesQueryDto) {
    const {
      branchId,
      warehouseId,
      posTerminalId,
      cashSessionId,
      cashierId,
      customerId,
      status,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SaleWhereInput = {
      merchantId,
      ...(branchId && { branchId }),
      ...(warehouseId && { warehouseId }),
      ...(posTerminalId && { posTerminalId }),
      ...(cashSessionId && { cashSessionId }),
      ...(cashierId && { cashierId }),
      ...(customerId && { customerId }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { clientOperationId: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
    };

    const [total, items] = await Promise.all([
      this.db.sale.count({ where }),
      this.db.sale.findMany({
        where,
        skip,
        take: limit,
        include: {
          branch: { select: { id: true, code: true, name: true } },
          posTerminal: { select: { id: true, code: true, name: true } },
          cashier: { select: { id: true, firstName: true, lastName: true } },
          customer: { select: { id: true, name: true, phone: true } },
          payments: { select: { tenderType: true, amount: true } },
          _count: { select: { items: true } },
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

  async getSaleById(merchantId: string, id: string) {
    const sale = await this.db.sale.findFirst({
      where: { id, merchantId },
      include: {
        branch: true,
        warehouse: true,
        posTerminal: true,
        cashSession: true,
        customer: true,
        cashier: { select: { id: true, firstName: true, lastName: true, email: true } },
        items: {
          include: {
            variant: {
              include: {
                product: { select: { id: true, code: true, name: true, unit: true } },
              },
            },
          },
        },
        payments: true,
        returns: true,
      },
    });

    if (!sale) {
      throw new NotFoundException(`Sale ${id} not found.`);
    }

    return sale;
  }

  async getReceipt(merchantId: string, id: string) {
    const sale = await this.getSaleById(merchantId, id);
    const merchant = await this.db.merchant.findUnique({
      where: { id: merchantId },
      select: { businessName: true, tradeName: true, taxNumber: true, contactEmail: true, contactPhone: true },
    });

    return {
      receiptNumber: sale.invoiceNumber,
      issuedAt: sale.createdAt,
      store: {
        companyName: merchant?.tradeName || merchant?.businessName,
        taxNumber: merchant?.taxNumber,
        branchName: sale.branch.name,
        branchAddress: sale.branch.address,
        branchPhone: sale.branch.phone,
      },
      cashier: `${sale.cashier.firstName} ${sale.cashier.lastName}`,
      counter: sale.posTerminal?.name || 'Main Checkout',
      customer: sale.customer ? { name: sale.customer.name, phone: sale.customer.phone } : null,
      items: sale.items.map((item) => ({
        sku: item.variant.sku,
        name: item.variant.product.name,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discountAmount),
        tax: Number(item.taxAmount),
        lineTotal: Number(item.lineTotal),
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
      })),
      pricing: {
        subtotal: Number(sale.subtotal),
        discountTotal: Number(sale.discountAmount),
        taxTotal: Number(sale.taxAmount),
        grandTotal: Number(sale.totalAmount),
        paidAmount: Number(sale.paidAmount),
        changeGiven: Number(sale.changeGiven),
      },
      tenders: sale.payments.map((p) => ({
        tenderType: p.tenderType,
        amount: Number(p.amount),
        reference: p.referenceNumber,
      })),
      footer: {
        returnPolicy: 'Goods once sold can be exchanged within 7 days with original receipt.',
        thankYouMessage: 'Thank you for shopping with us!',
      },
    };
  }
}
