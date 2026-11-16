import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  ClearChequeDto,
  BounceChequeDto,
  DepositChequeDto,
  CancelChequeDto,
  ListSupplierChequesQueryDto,
} from '../dto/supplier-cheque.dto';
import {
  ChequeStatus,
  SupplierInvoiceStatus,
  SupplierLedgerTransactionType,
  Prisma,
} from '@prisma/client';

function getEffectiveActorId(val?: string | null): string {
  if (val && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val)) {
    return val;
  }
  return '00000000-0000-0000-0000-000000000000';
}

@Injectable()
export class SupplierChequeService {
  constructor(private db: DatabaseService) {}

  async listCheques(merchantId: string, query: ListSupplierChequesQueryDto) {
    const { supplierId, status, maturityBefore, search } = query;
    const pageNum = Number(query.page || 1);
    const limitNum = Number(query.limit || 20);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.SupplierChequeWhereInput = {
      merchantId,
      ...(supplierId && { supplierId }),
      ...(status && { status }),
      ...(maturityBefore && { maturityDate: { lte: new Date(maturityBefore) } }),
      ...(search && {
        OR: [
          { chequeNumber: { contains: search, mode: 'insensitive' } },
          { bankName: { contains: search, mode: 'insensitive' } },
          { payeeName: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.db.supplierCheque.count({ where }),
      this.db.supplierCheque.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          payment: { select: { id: true, paymentNumber: true, paymentDate: true } },
        },
        orderBy: { maturityDate: 'asc' },
      }),
    ]);

    return {
      items,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async getChequeById(merchantId: string, id: string) {
    const cheque = await this.db.supplierCheque.findFirst({
      where: { id, merchantId },
      include: {
        supplier: true,
        payment: {
          include: {
            allocations: {
              include: {
                invoice: true,
              },
            },
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!cheque) {
      throw new NotFoundException(`Supplier Cheque ${id} not found.`);
    }

    return cheque;
  }

  async depositCheque(merchantId: string, id: string, dto: DepositChequeDto = {}, actorId?: string) {
    const cheque = await this.db.supplierCheque.findFirst({
      where: { id, merchantId },
    });

    if (!cheque) {
      throw new NotFoundException(`Supplier Cheque ${id} not found.`);
    }

    if (cheque.status !== ChequeStatus.ISSUED && cheque.status !== ChequeStatus.AWAITING_DEPOSIT) {
      throw new BadRequestException(
        `Cannot deposit cheque with status "${cheque.status}". Only ISSUED or AWAITING_DEPOSIT cheques can be marked as DEPOSITED.`,
      );
    }

    return this.db.$transaction(async (tx) => {
      const updated = await tx.supplierCheque.update({
        where: { id },
        data: {
          status: ChequeStatus.DEPOSITED,
          notes: dto.notes ? `${cheque.notes ? cheque.notes + '\n' : ''}[Deposited]: ${dto.notes}` : cheque.notes,
        },
      });

      await tx.supplierChequeStatusHistory.create({
        data: {
          chequeId: id,
          fromStatus: cheque.status,
          toStatus: ChequeStatus.DEPOSITED,
          reason: dto.notes?.trim() || 'Cheque presented for bank clearing',
          changedById: getEffectiveActorId(actorId),
        },
      });

      return updated;
    });
  }

  async clearCheque(merchantId: string, id: string, dto: ClearChequeDto = {}, actorId?: string) {
    const cheque = await this.db.supplierCheque.findFirst({
      where: { id, merchantId },
    });

    if (!cheque) {
      throw new NotFoundException(`Supplier Cheque ${id} not found.`);
    }

    if (cheque.status === ChequeStatus.CLEARED) {
      throw new BadRequestException('Cheque is already cleared.');
    }

    if (cheque.status === ChequeStatus.BOUNCED || cheque.status === ChequeStatus.CANCELLED) {
      throw new BadRequestException(`Cannot clear cheque in status "${cheque.status}".`);
    }

    return this.db.$transaction(async (tx) => {
      const updated = await tx.supplierCheque.update({
        where: { id },
        data: {
          status: ChequeStatus.CLEARED,
          clearedAt: dto.clearedAt ? new Date(dto.clearedAt) : new Date(),
          notes: dto.notes ? `${cheque.notes ? cheque.notes + '\n' : ''}[Cleared]: ${dto.notes}` : cheque.notes,
        },
      });

      await tx.supplierChequeStatusHistory.create({
        data: {
          chequeId: id,
          fromStatus: cheque.status,
          toStatus: ChequeStatus.CLEARED,
          reason: dto.notes?.trim() || 'Cheque successfully honoured and cleared by bank',
          changedById: getEffectiveActorId(actorId),
        },
      });

      return updated;
    });
  }

  async bounceCheque(merchantId: string, id: string, dto: BounceChequeDto, actorId?: string) {
    const cheque = await this.db.supplierCheque.findFirst({
      where: { id, merchantId },
      include: {
        payment: {
          include: { allocations: true },
        },
        supplier: true,
      },
    });

    if (!cheque) {
      throw new NotFoundException(`Supplier Cheque ${id} not found.`);
    }

    if (cheque.status === ChequeStatus.BOUNCED) {
      throw new BadRequestException('Cheque is already marked as bounced.');
    }

    const chequeAmount = Number(cheque.amount);
    const bounceCharges = Number(dto?.bounceCharges || 0);
    const bounceReason = dto?.bounceReason?.trim() || 'Cheque dishonoured / bounced by bank';

    return this.db.$transaction(async (tx) => {
      // 1. Reverse Invoice Allocations if linked through payment
      if (cheque.payment && cheque.payment.allocations.length > 0) {
        for (const alloc of cheque.payment.allocations) {
          const invoice = await tx.supplierInvoice.findFirst({
            where: { id: alloc.invoiceId, merchantId },
          });

          if (invoice) {
            const allocAmt = Number(alloc.allocatedAmount);
            const currentPaid = Number(invoice.paidAmount);
            const newPaid = Math.max(0, currentPaid - allocAmt);
            const invoiceTotal = Number(invoice.totalAmount);
            const newBalance = Math.min(invoiceTotal, invoiceTotal - newPaid);

            await tx.supplierInvoice.update({
              where: { id: alloc.invoiceId },
              data: {
                paidAmount: newPaid,
                balanceAmount: newBalance,
                status:
                  newBalance >= invoiceTotal
                    ? SupplierInvoiceStatus.VERIFIED
                    : SupplierInvoiceStatus.PARTIALLY_PAID,
              },
            });
          }
        }
      }

      // 2. Restore Supplier Payable Liability in Ledger
      const lastEntry = await tx.supplierLedgerEntry.findFirst({
        where: { merchantId, supplierId: cheque.supplierId },
        orderBy: { entryDate: 'desc' },
      });

      const currentBalance = lastEntry ? Number(lastEntry.runningBalance) : Number(cheque.supplier.outstandingPayables);
      const restoredLiability = chequeAmount + bounceCharges;
      const newRunningBalance = currentBalance + restoredLiability;

      await tx.supplierLedgerEntry.create({
        data: {
          merchantId,
          supplierId: cheque.supplierId,
          transactionType: SupplierLedgerTransactionType.ADJUSTMENT,
          referenceNumber: `BOUNCE-${cheque.chequeNumber}`,
          referenceId: cheque.id,
          debit: 0,
          credit: restoredLiability, // Credit increases liability
          runningBalance: newRunningBalance,
          description: `Cheque BOUNCED: ${cheque.chequeNumber} (${cheque.bankName}). Reason: ${bounceReason}${bounceCharges > 0 ? '. Bank charges: ' + bounceCharges : ''}`,
          createdById: getEffectiveActorId(actorId),
        },
      });

      // 3. Restore Supplier Outstanding Balance
      await tx.supplier.update({
        where: { id: cheque.supplierId },
        data: {
          outstandingPayables: {
            increment: restoredLiability,
          },
        },
      });

      // 4. Update Cheque status
      const updatedCheque = await tx.supplierCheque.update({
        where: { id },
        data: {
          status: ChequeStatus.BOUNCED,
          bounceReason,
          bounceCharges,
          bouncedAt: dto?.bouncedAt ? new Date(dto.bouncedAt) : new Date(),
          notes: dto?.notes ? `${cheque.notes ? cheque.notes + '\n' : ''}[Bounced]: ${dto.notes}` : cheque.notes,
        },
      });

      // 5. Audit History
      await tx.supplierChequeStatusHistory.create({
        data: {
          chequeId: id,
          fromStatus: cheque.status,
          toStatus: ChequeStatus.BOUNCED,
          reason: bounceReason,
          bankCharges: bounceCharges,
          changedById: getEffectiveActorId(actorId),
        },
      });

      return updatedCheque;
    });
  }

  async cancelCheque(merchantId: string, id: string, dto: CancelChequeDto = {}, actorId?: string) {
    const cheque = await this.db.supplierCheque.findFirst({
      where: { id, merchantId },
      include: {
        payment: {
          include: { allocations: true },
        },
        supplier: true,
      },
    });

    if (!cheque) {
      throw new NotFoundException(`Supplier Cheque ${id} not found.`);
    }

    if (cheque.status === ChequeStatus.CLEARED) {
      throw new BadRequestException('Cannot cancel a cheque that has already cleared in the bank.');
    }

    if (cheque.status === ChequeStatus.BOUNCED) {
      throw new BadRequestException('Cannot cancel a cheque that has already bounced.');
    }

    if (cheque.status === ChequeStatus.CANCELLED) {
      throw new BadRequestException('Cheque is already cancelled.');
    }

    const chequeAmount = Number(cheque.amount);
    const cancelReason = dto.reason?.trim() || dto.notes?.trim() || 'Cheque voided / payment stopped';

    return this.db.$transaction(async (tx) => {
      // 1. Reverse Invoice Allocations if linked through payment
      if (cheque.payment && cheque.payment.allocations.length > 0) {
        for (const alloc of cheque.payment.allocations) {
          const invoice = await tx.supplierInvoice.findFirst({
            where: { id: alloc.invoiceId, merchantId },
          });

          if (invoice) {
            const allocAmt = Number(alloc.allocatedAmount);
            const currentPaid = Number(invoice.paidAmount);
            const newPaid = Math.max(0, currentPaid - allocAmt);
            const invoiceTotal = Number(invoice.totalAmount);
            const newBalance = Math.min(invoiceTotal, invoiceTotal - newPaid);

            await tx.supplierInvoice.update({
              where: { id: alloc.invoiceId },
              data: {
                paidAmount: newPaid,
                balanceAmount: newBalance,
                status:
                  newBalance >= invoiceTotal
                    ? SupplierInvoiceStatus.VERIFIED
                    : SupplierInvoiceStatus.PARTIALLY_PAID,
              },
            });
          }
        }
      }

      // 2. Restore Supplier Payable Liability in Ledger
      const lastEntry = await tx.supplierLedgerEntry.findFirst({
        where: { merchantId, supplierId: cheque.supplierId },
        orderBy: { entryDate: 'desc' },
      });

      const currentBalance = lastEntry ? Number(lastEntry.runningBalance) : Number(cheque.supplier.outstandingPayables);
      const newRunningBalance = currentBalance + chequeAmount;

      await tx.supplierLedgerEntry.create({
        data: {
          merchantId,
          supplierId: cheque.supplierId,
          transactionType: SupplierLedgerTransactionType.ADJUSTMENT,
          referenceNumber: `VOID-${cheque.chequeNumber}`,
          referenceId: cheque.id,
          debit: 0,
          credit: chequeAmount,
          runningBalance: newRunningBalance,
          description: `Cheque VOIDED/CANCELLED: ${cheque.chequeNumber} (${cheque.bankName}). Reason: ${cancelReason}`,
          createdById: getEffectiveActorId(actorId),
        },
      });

      // 3. Restore Supplier Outstanding Balance
      await tx.supplier.update({
        where: { id: cheque.supplierId },
        data: {
          outstandingPayables: {
            increment: chequeAmount,
          },
        },
      });

      // 4. Update Cheque status
      const updatedCheque = await tx.supplierCheque.update({
        where: { id },
        data: {
          status: ChequeStatus.CANCELLED,
          notes: dto.notes ? `${cheque.notes ? cheque.notes + '\n' : ''}[Cancelled]: ${dto.notes}` : cheque.notes,
        },
      });

      // 5. Audit History
      await tx.supplierChequeStatusHistory.create({
        data: {
          chequeId: id,
          fromStatus: cheque.status,
          toStatus: ChequeStatus.CANCELLED,
          reason: cancelReason,
          changedById: getEffectiveActorId(actorId),
        },
      });

      return updatedCheque;
    });
  }

  async getMaturityAlerts(merchantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in1Day = new Date(today);
    in1Day.setDate(in1Day.getDate() + 1);

    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);

    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);

    const activeStatuses: ChequeStatus[] = [
      ChequeStatus.ISSUED,
      ChequeStatus.AWAITING_DEPOSIT,
      ChequeStatus.DEPOSITED,
    ];

    const [overdue, dueToday, dueIn3Days, dueIn7Days] = await Promise.all([
      // Overdue
      this.db.supplierCheque.findMany({
        where: {
          merchantId,
          status: { in: activeStatuses },
          maturityDate: { lt: today },
        },
        include: { supplier: { select: { id: true, name: true, code: true } } },
        orderBy: { maturityDate: 'asc' },
      }),
      // Due Today
      this.db.supplierCheque.findMany({
        where: {
          merchantId,
          status: { in: activeStatuses },
          maturityDate: { gte: today, lt: in1Day },
        },
        include: { supplier: { select: { id: true, name: true, code: true } } },
        orderBy: { maturityDate: 'asc' },
      }),
      // Due in 1-3 Days
      this.db.supplierCheque.findMany({
        where: {
          merchantId,
          status: { in: activeStatuses },
          maturityDate: { gte: in1Day, lte: in3Days },
        },
        include: { supplier: { select: { id: true, name: true, code: true } } },
        orderBy: { maturityDate: 'asc' },
      }),
      // Due in 4-7 Days
      this.db.supplierCheque.findMany({
        where: {
          merchantId,
          status: { in: activeStatuses },
          maturityDate: { gt: in3Days, lte: in7Days },
        },
        include: { supplier: { select: { id: true, name: true, code: true } } },
        orderBy: { maturityDate: 'asc' },
      }),
    ]);

    const sumAmounts = (list: { amount: Prisma.Decimal }[]) =>
      list.reduce((acc, c) => acc + Number(c.amount), 0);

    const allPending = await this.db.supplierCheque.findMany({
      where: {
        merchantId,
        status: { in: activeStatuses },
      },
      select: { amount: true },
    });

    return {
      totalPending: {
        count: allPending.length,
        totalAmount: sumAmounts(allPending),
      },
      overdue: {
        count: overdue.length,
        totalAmount: sumAmounts(overdue),
        items: overdue,
      },
      dueToday: {
        count: dueToday.length,
        totalAmount: sumAmounts(dueToday),
        items: dueToday,
      },
      dueIn3Days: {
        count: dueIn3Days.length,
        totalAmount: sumAmounts(dueIn3Days),
        items: dueIn3Days,
      },
      dueIn7Days: {
        count: dueIn7Days.length,
        totalAmount: sumAmounts(dueIn7Days),
        items: dueIn7Days,
      },
    };
  }

  async getPendingSummary(merchantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in1Day = new Date(today);
    in1Day.setDate(in1Day.getDate() + 1);

    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);

    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);
    in7Days.setHours(23, 59, 59, 999);

    const activeStatuses: ChequeStatus[] = [
      ChequeStatus.ISSUED,
      ChequeStatus.AWAITING_DEPOSIT,
      ChequeStatus.DEPOSITED,
    ];

    const pendingCheques = await this.db.supplierCheque.findMany({
      where: {
        merchantId,
        status: { in: activeStatuses },
      },
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        payment: { select: { id: true, paymentNumber: true, paymentDate: true } },
      },
      orderBy: { maturityDate: 'asc' },
    });

    const sumAmounts = (list: { amount: Prisma.Decimal | number }[]) =>
      list.reduce((acc, c) => acc + Number(c.amount), 0);

    const overdue = pendingCheques.filter((c) => new Date(c.maturityDate) < today);
    const dueToday = pendingCheques.filter((c) => {
      const d = new Date(c.maturityDate);
      return d >= today && d < in1Day;
    });
    const dueIn3Days = pendingCheques.filter((c) => {
      const d = new Date(c.maturityDate);
      return d >= in1Day && d <= in3Days;
    });
    const dueIn7Days = pendingCheques.filter((c) => {
      const d = new Date(c.maturityDate);
      return d >= in1Day && d <= in7Days;
    });
    const upcomingLater = pendingCheques.filter((c) => new Date(c.maturityDate) > in7Days);

    const byStatus = {
      ISSUED: {
        count: pendingCheques.filter((c) => c.status === ChequeStatus.ISSUED).length,
        totalAmount: sumAmounts(pendingCheques.filter((c) => c.status === ChequeStatus.ISSUED)),
      },
      AWAITING_DEPOSIT: {
        count: pendingCheques.filter((c) => c.status === ChequeStatus.AWAITING_DEPOSIT).length,
        totalAmount: sumAmounts(pendingCheques.filter((c) => c.status === ChequeStatus.AWAITING_DEPOSIT)),
      },
      DEPOSITED: {
        count: pendingCheques.filter((c) => c.status === ChequeStatus.DEPOSITED).length,
        totalAmount: sumAmounts(pendingCheques.filter((c) => c.status === ChequeStatus.DEPOSITED)),
      },
    };

    return {
      totalPendingCount: pendingCheques.length,
      totalPendingAmount: sumAmounts(pendingCheques),
      overdue: {
        count: overdue.length,
        totalAmount: sumAmounts(overdue),
        items: overdue,
      },
      dueToday: {
        count: dueToday.length,
        totalAmount: sumAmounts(dueToday),
        items: dueToday,
      },
      dueIn3Days: {
        count: dueIn3Days.length,
        totalAmount: sumAmounts(dueIn3Days),
        items: dueIn3Days,
      },
      dueIn7Days: {
        count: dueIn7Days.length,
        totalAmount: sumAmounts(dueIn7Days),
        items: dueIn7Days,
      },
      upcomingLater: {
        count: upcomingLater.length,
        totalAmount: sumAmounts(upcomingLater),
      },
      byStatus,
      upcomingCheques: pendingCheques.slice(0, 15),
    };
  }
}
