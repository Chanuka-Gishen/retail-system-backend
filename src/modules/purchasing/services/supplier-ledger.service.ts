import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { SupplierLedgerQueryDto } from '../dto/supplier-ledger.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SupplierLedgerService {
  constructor(private db: DatabaseService) {}

  async getSupplierStatement(merchantId: string, query: SupplierLedgerQueryDto) {
    const { supplierId, startDate, endDate, transactionType } = query;

    const supplier = await this.db.supplier.findFirst({
      where: { id: supplierId, merchantId },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier ${supplierId} not found.`);
    }

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    if (end) {
      end.setHours(23, 59, 59, 999);
    }

    // Calculate opening balance before startDate
    let priorBalance = 0;
    if (start) {
      const priorEntries = await this.db.supplierLedgerEntry.findMany({
        where: {
          merchantId,
          supplierId,
          entryDate: { lt: start },
        },
        orderBy: { entryDate: 'asc' },
      });

      for (const entry of priorEntries) {
        priorBalance += Number(entry.credit) - Number(entry.debit);
      }
    }

    const where: Prisma.SupplierLedgerEntryWhereInput = {
      merchantId,
      supplierId,
      ...(transactionType && { transactionType }),
      ...(start || end
        ? {
            entryDate: {
              ...(start && { gte: start }),
              ...(end && { lte: end }),
            },
          }
        : {}),
    };

    const entries = await this.db.supplierLedgerEntry.findMany({
      where,
      orderBy: { entryDate: 'asc' },
    });

    let running = priorBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    const formattedEntries = entries.map((e) => {
      const debit = Number(e.debit);
      const credit = Number(e.credit);
      running = running + credit - debit;
      totalDebit += debit;
      totalCredit += credit;

      return {
        id: e.id,
        entryDate: e.entryDate,
        transactionType: e.transactionType,
        referenceNumber: e.referenceNumber,
        referenceId: e.referenceId,
        debit,
        credit,
        runningBalance: running,
        description: e.description,
      };
    });

    return {
      supplier: {
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        currency: supplier.defaultCurrency,
        creditLimit: Number(supplier.creditLimit),
        creditDays: supplier.creditDays,
        currentOutstanding: Number(supplier.outstandingPayables),
      },
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
        openingBalance: priorBalance,
        totalDebit,
        totalCredit,
        closingBalance: running,
      },
      entries: formattedEntries,
    };
  }
}
