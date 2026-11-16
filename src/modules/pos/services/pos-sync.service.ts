import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PosCheckoutService } from './pos-checkout.service';
import {
  BatchSyncDto,
  CatalogDeltaQueryDto,
} from '../dto/pos-sync.dto';

@Injectable()
export class PosSyncService {
  private readonly logger = new Logger(PosSyncService.name);

  constructor(
    private db: DatabaseService,
    private checkoutService: PosCheckoutService,
  ) {}

  async syncBatch(
    merchantId: string,
    dto: BatchSyncDto,
    cashierId: string,
  ) {
    const salesList = dto.sales || [];
    const cashTxList = dto.cashTransactions || [];

    const processedSales: Array<{
      clientOperationId: string;
      status: 'SYNCED' | 'ALREADY_SYNCED' | 'FAILED';
      saleId?: string;
      invoiceNumber?: string;
      error?: string;
    }> = [];

    const processedCashTransactions: Array<{
      clientOperationId: string;
      status: 'SYNCED' | 'ALREADY_SYNCED' | 'FAILED';
      transactionId?: string;
      error?: string;
    }> = [];

    let processedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;

    // 1. Process Offline Sales
    for (const offlineSale of salesList) {
      const opId = offlineSale.clientOperationId.trim();

      try {
        // Check Idempotency
        const existingSale = await this.db.sale.findUnique({
          where: {
            merchantId_clientOperationId: {
              merchantId,
              clientOperationId: opId,
            },
          },
          select: { id: true, invoiceNumber: true },
        });

        if (existingSale) {
          duplicateCount++;
          processedSales.push({
            clientOperationId: opId,
            status: 'ALREADY_SYNCED',
            saleId: existingSale.id,
            invoiceNumber: existingSale.invoiceNumber,
          });
          continue;
        }

        // Process Checkout with offline sync flag
        const sale = await this.checkoutService.checkout(
          merchantId,
          {
            branchId: offlineSale.branchId || '',
            warehouseId: offlineSale.warehouseId,
            posTerminalId: offlineSale.posTerminalId,
            cashSessionId: offlineSale.cashSessionId,
            customerId: offlineSale.customerId,
            clientOperationId: opId,
            cartDiscountAmount: offlineSale.cartDiscountAmount ?? 0,
            items: offlineSale.items,
            payments: offlineSale.payments,
            isOfflineSync: true,
            completedAt: offlineSale.completedAt,
          },
          cashierId,
        );

        processedCount++;
        processedSales.push({
          clientOperationId: opId,
          status: 'SYNCED',
          saleId: sale.id,
          invoiceNumber: sale.invoiceNumber,
        });
      } catch (err: any) {
        this.logger.error(`Failed to sync offline sale [${opId}]: ${err.message}`, err.stack);
        failedCount++;
        processedSales.push({
          clientOperationId: opId,
          status: 'FAILED',
          error: err.message || 'Unknown processing error',
        });
      }
    }

    // 2. Process Offline Cash Drawer Transactions
    for (const offlineTx of cashTxList) {
      const opId = offlineTx.clientOperationId.trim();

      try {
        // Find session
        const session = await this.db.cashSession.findFirst({
          where: { id: offlineTx.sessionId, merchantId },
        });

        if (!session) {
          failedCount++;
          processedCashTransactions.push({
            clientOperationId: opId,
            status: 'FAILED',
            error: `Cash session ${offlineTx.sessionId} not found for this merchant.`,
          });
          continue;
        }

        // Check if already synced via reason reference
        const refMarker = `[Op:${opId}]`;
        const existingTx = await this.db.cashTransaction.findFirst({
          where: {
            sessionId: session.id,
            reason: { contains: refMarker },
          },
        });

        if (existingTx) {
          duplicateCount++;
          processedCashTransactions.push({
            clientOperationId: opId,
            status: 'ALREADY_SYNCED',
            transactionId: existingTx.id,
          });
          continue;
        }

        const createdTx = await this.db.cashTransaction.create({
          data: {
            sessionId: session.id,
            merchantId,
            type: offlineTx.type,
            amount: offlineTx.amount,
            reason: `${offlineTx.reason.trim()} ${refMarker}`,
            performedById: cashierId,
            createdAt: offlineTx.occurredAt ? new Date(offlineTx.occurredAt) : new Date(),
          },
        });

        processedCount++;
        processedCashTransactions.push({
          clientOperationId: opId,
          status: 'SYNCED',
          transactionId: createdTx.id,
        });
      } catch (err: any) {
        this.logger.error(`Failed to sync offline cash transaction [${opId}]: ${err.message}`);
        failedCount++;
        processedCashTransactions.push({
          clientOperationId: opId,
          status: 'FAILED',
          error: err.message || 'Cash transaction recording failed',
        });
      }
    }

    const totalSubmitted = salesList.length + cashTxList.length;

    return {
      summary: {
        totalSubmitted,
        totalProcessed: processedCount,
        totalDuplicates: duplicateCount,
        totalFailed: failedCount,
        isFullySynchronized: failedCount === 0,
      },
      processedSales,
      processedCashTransactions,
    };
  }

  async getCatalogDelta(merchantId: string, query: CatalogDeltaQueryDto) {
    let sinceDate = new Date(0);
    if (query.since && typeof query.since === 'string' && query.since.trim()) {
      const parsed = new Date(query.since);
      if (!isNaN(parsed.getTime())) {
        sinceDate = parsed;
      }
    }
    const serverTimestamp = new Date().toISOString();

    const [products, taxProfiles, categories] = await Promise.all([
      this.db.product.findMany({
        where: {
          merchantId,
          OR: [
            { updatedAt: { gte: sinceDate } },
            { variants: { some: { updatedAt: { gte: sinceDate } } } },
          ],
        },
        include: {
          variants: true,
          taxProfile: true,
          category: { select: { id: true, name: true, code: true } },
          brand: { select: { id: true, name: true, code: true } },
        },
        orderBy: { updatedAt: 'asc' },
      }),
      this.db.taxProfile.findMany({
        where: {
          merchantId,
          updatedAt: { gte: sinceDate },
        },
        orderBy: { updatedAt: 'asc' },
      }),
      this.db.category.findMany({
        where: {
          merchantId,
          updatedAt: { gte: sinceDate },
        },
        orderBy: { updatedAt: 'asc' },
      }),
    ]);

    return {
      serverTimestamp,
      delta: {
        productsCount: products.length,
        taxProfilesCount: taxProfiles.length,
        categoriesCount: categories.length,
        products,
        taxProfiles,
        categories,
      },
    };
  }
}
