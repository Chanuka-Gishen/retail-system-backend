import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreateSupplierPaymentDto,
  ListSupplierPaymentsQueryDto,
} from '../dto/supplier-payment.dto';
import {
  SupplierPaymentMethod,
  SupplierInvoiceStatus,
  SupplierLedgerTransactionType,
  ChequeStatus,
  Prisma,
} from '@prisma/client';

@Injectable()
export class SupplierPaymentService {
  constructor(private db: DatabaseService) {}

  async listPayments(merchantId: string, query: ListSupplierPaymentsQueryDto) {
    const { supplierId, paymentMethod, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierPaymentWhereInput = {
      merchantId,
      ...(supplierId && { supplierId }),
      ...(paymentMethod && { paymentMethod }),
      ...(search && {
        OR: [
          { paymentNumber: { contains: search, mode: 'insensitive' } },
          { referenceNumber: { contains: search, mode: 'insensitive' } },
          { bankName: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.db.supplierPayment.count({ where }),
      this.db.supplierPayment.findMany({
        where,
        skip,
        take: limit,
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          cheques: { select: { id: true, chequeNumber: true, status: true, maturityDate: true } },
          _count: { select: { allocations: true } },
        },
        orderBy: { paymentDate: 'desc' },
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

  async getPaymentById(merchantId: string, id: string) {
    const payment = await this.db.supplierPayment.findFirst({
      where: { id, merchantId },
      include: {
        supplier: true,
        cheques: true,
        allocations: {
          include: {
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                totalAmount: true,
                paidAmount: true,
                balanceAmount: true,
                dueDate: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(`Supplier Payment ${id} not found.`);
    }

    return payment;
  }

  async recordPayment(merchantId: string, dto: CreateSupplierPaymentDto, actorId: string) {
    const supplier = await this.db.supplier.findFirst({
      where: { id: dto.supplierId, merchantId },
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${dto.supplierId} not found.`);
    }

    const paymentAmount = Number(dto.amount);
    let totalAllocated = 0;

    if (dto.allocations && dto.allocations.length > 0) {
      for (const alloc of dto.allocations) {
        totalAllocated += Number(alloc.allocatedAmount);
      }
    }

    if (totalAllocated > paymentAmount) {
      throw new BadRequestException(
        `Total allocated amount (${totalAllocated}) cannot exceed the payment amount (${paymentAmount}).`,
      );
    }

    const unallocatedAmount = Math.max(0, paymentAmount - totalAllocated);

    return this.db.$transaction(async (tx) => {
      // 1. Generate payment number
      const count = await tx.supplierPayment.count({ where: { merchantId } });
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const seq = String(count + 1).padStart(4, '0');
      const paymentNumber = `SP-${dateStr}-${seq}`;

      // 2. Create Payment record
      const payment = await tx.supplierPayment.create({
        data: {
          merchantId,
          supplierId: dto.supplierId,
          paymentNumber,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          paymentMethod: dto.paymentMethod,
          amount: paymentAmount,
          unallocatedAmount,
          referenceNumber: dto.referenceNumber?.trim(),
          bankName: dto.bankName?.trim() || dto.chequeDetails?.bankName?.trim(),
          bankAccountNumber: dto.bankAccountNumber?.trim(),
          notes: dto.notes?.trim(),
          status: 'COMPLETED',
          createdById: actorId,
        },
      });

      // 3. Process allocations
      if (dto.allocations && dto.allocations.length > 0) {
        for (const alloc of dto.allocations) {
          const invoice = await tx.supplierInvoice.findFirst({
            where: { id: alloc.invoiceId, merchantId, supplierId: dto.supplierId },
          });

          if (!invoice) {
            throw new NotFoundException(`Invoice ${alloc.invoiceId} not found for this supplier.`);
          }

          const allocAmount = Number(alloc.allocatedAmount);
          const currentPaid = Number(invoice.paidAmount);
          const newPaid = currentPaid + allocAmount;
          const invoiceTotal = Number(invoice.totalAmount);
          const newBalance = Math.max(0, invoiceTotal - newPaid);

          await tx.supplierPaymentAllocation.create({
            data: {
              paymentId: payment.id,
              invoiceId: alloc.invoiceId,
              allocatedAmount: allocAmount,
            },
          });

          await tx.supplierInvoice.update({
            where: { id: alloc.invoiceId },
            data: {
              paidAmount: newPaid,
              balanceAmount: newBalance,
              status:
                newBalance === 0
                  ? SupplierInvoiceStatus.FULLY_PAID
                  : SupplierInvoiceStatus.PARTIALLY_PAID,
            },
          });
        }
      }

      // 4. If method is CHEQUE, register cheque
      if (dto.paymentMethod === SupplierPaymentMethod.CHEQUE && dto.chequeDetails) {
        const cheque = await tx.supplierCheque.create({
          data: {
            merchantId,
            supplierId: dto.supplierId,
            paymentId: payment.id,
            chequeNumber: dto.chequeDetails.chequeNumber.trim(),
            bankName: dto.chequeDetails.bankName.trim(),
            branchName: dto.chequeDetails.branchName?.trim(),
            chequeDate: new Date(dto.chequeDetails.chequeDate),
            maturityDate: new Date(dto.chequeDetails.maturityDate),
            amount: paymentAmount,
            payeeName: dto.chequeDetails.payeeName.trim(),
            status: ChequeStatus.ISSUED,
            createdById: actorId,
          },
        });

        await tx.supplierChequeStatusHistory.create({
          data: {
            chequeId: cheque.id,
            fromStatus: ChequeStatus.ISSUED,
            toStatus: ChequeStatus.ISSUED,
            reason: 'Cheque issued with payment',
            changedById: actorId,
          },
        });
      }

      // 5. Post to Supplier Ledger
      const lastEntry = await tx.supplierLedgerEntry.findFirst({
        where: { merchantId, supplierId: dto.supplierId },
        orderBy: { entryDate: 'desc' },
      });

      const currentBalance = lastEntry ? Number(lastEntry.runningBalance) : Number(supplier.outstandingPayables);
      const newRunningBalance = currentBalance - paymentAmount;

      await tx.supplierLedgerEntry.create({
        data: {
          merchantId,
          supplierId: dto.supplierId,
          transactionType: SupplierLedgerTransactionType.PAYMENT,
          referenceNumber: paymentNumber,
          referenceId: payment.id,
          debit: paymentAmount, // Debit reduces liability
          credit: 0,
          runningBalance: newRunningBalance,
          description: `Supplier payment (${dto.paymentMethod}): ${paymentNumber}${dto.referenceNumber ? ' Ref: ' + dto.referenceNumber : ''}`,
          createdById: actorId,
        },
      });

      // 6. Update supplier outstanding payables
      await tx.supplier.update({
        where: { id: dto.supplierId },
        data: {
          outstandingPayables: {
            decrement: paymentAmount,
          },
        },
      });

      return payment;
    });
  }
}
