import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class PurchasingReportsService {
  constructor(private db: DatabaseService) {}

  async getAgeingReport(merchantId: string) {
    const suppliers = await this.db.supplier.findMany({
      where: { merchantId },
      include: {
        invoices: {
          where: {
            balanceAmount: { gt: 0 },
            status: { notIn: ['FULLY_PAID', 'VOID'] },
          },
        },
      },
    });

    const now = new Date();
    const rows = [];
    const totals = {
      current: 0,
      days1To30: 0,
      days31To60: 0,
      days61To90: 0,
      daysOver90: 0,
      totalOutstanding: 0,
    };

    for (const supplier of suppliers) {
      let current = 0;
      let days1To30 = 0;
      let days31To60 = 0;
      let days61To90 = 0;
      let daysOver90 = 0;

      for (const inv of supplier.invoices) {
        const bal = Number(inv.balanceAmount);
        const dueDate = new Date(inv.dueDate);
        const diffMs = now.getTime() - dueDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) {
          current += bal;
        } else if (diffDays <= 30) {
          days1To30 += bal;
        } else if (diffDays <= 60) {
          days31To60 += bal;
        } else if (diffDays <= 90) {
          days61To90 += bal;
        } else {
          daysOver90 += bal;
        }
      }

      const supplierTotal = current + days1To30 + days31To60 + days61To90 + daysOver90;

      if (supplierTotal > 0 || Number(supplier.outstandingPayables) > 0) {
        totals.current += current;
        totals.days1To30 += days1To30;
        totals.days31To60 += days31To60;
        totals.days61To90 += days61To90;
        totals.daysOver90 += daysOver90;
        totals.totalOutstanding += supplierTotal;

        rows.push({
          supplierId: supplier.id,
          supplierCode: supplier.code,
          supplierName: supplier.name,
          creditDays: supplier.creditDays,
          creditLimit: Number(supplier.creditLimit),
          current,
          days1To30,
          days31To60,
          days61To90,
          daysOver90,
          total: supplierTotal,
        });
      }
    }

    return {
      totals,
      rows: rows.sort((a, b) => b.total - a.total),
    };
  }

  async getSpendReport(merchantId: string, startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    if (end) {
      end.setHours(23, 59, 59, 999);
    }

    const invoices = await this.db.supplierInvoice.findMany({
      where: {
        merchantId,
        status: { notIn: ['VOID'] },
        ...(start || end
          ? {
              invoiceDate: {
                ...(start && { gte: start }),
                ...(end && { lte: end }),
              },
            }
          : {}),
      },
      include: {
        supplier: {
          include: { category: true },
        },
      },
    });

    const supplierMap = new Map<string, { code: string; name: string; category: string; totalSpend: number; count: number }>();
    const categoryMap = new Map<string, { name: string; totalSpend: number; count: number }>();

    let totalSpend = 0;

    for (const inv of invoices) {
      const amount = Number(inv.totalAmount);
      totalSpend += amount;

      // Group by supplier
      const sId = inv.supplierId;
      const sName = inv.supplier.name;
      const sCode = inv.supplier.code;
      const catName = inv.supplier.category?.name || 'Uncategorized';

      const sEntry = supplierMap.get(sId) || { code: sCode, name: sName, category: catName, totalSpend: 0, count: 0 };
      sEntry.totalSpend += amount;
      sEntry.count += 1;
      supplierMap.set(sId, sEntry);

      // Group by category
      const cEntry = categoryMap.get(catName) || { name: catName, totalSpend: 0, count: 0 };
      cEntry.totalSpend += amount;
      cEntry.count += 1;
      categoryMap.set(catName, cEntry);
    }

    return {
      period: { startDate, endDate },
      totalSpend,
      bySupplier: Array.from(supplierMap.entries()).map(([supplierId, val]) => ({ supplierId, ...val })).sort((a, b) => b.totalSpend - a.totalSpend),
      byCategory: Array.from(categoryMap.entries()).map(([category, val]) => ({ category, ...val })).sort((a, b) => b.totalSpend - a.totalSpend),
    };
  }

  async getDiscrepancyReport(merchantId: string) {
    return this.db.supplierInvoice.findMany({
      where: {
        merchantId,
        matchStatus: 'DISCREPANCY',
      },
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        purchaseOrder: { select: { id: true, poNumber: true } },
        grn: { select: { id: true, grnNumber: true } },
      },
      orderBy: { invoiceDate: 'desc' },
    });
  }
}
