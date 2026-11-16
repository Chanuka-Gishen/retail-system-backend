import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';

// Controllers
import { SupplierController } from './controllers/supplier.controller';
import { PurchaseOrderController } from './controllers/purchase-order.controller';
import { GoodsReceivedNoteController } from './controllers/grn.controller';
import { PurchaseRequisitionController } from './controllers/purchase-requisition.controller';
import { SupplierInvoiceController } from './controllers/supplier-invoice.controller';
import { SupplierReturnController } from './controllers/supplier-return.controller';
import { SupplierPaymentController } from './controllers/supplier-payment.controller';
import { SupplierChequeController } from './controllers/supplier-cheque.controller';
import { SupplierLedgerController } from './controllers/supplier-ledger.controller';
import { PurchasingReportsController } from './controllers/purchasing-reports.controller';

// Services
import { SupplierService } from './services/supplier.service';
import { PurchaseOrderService } from './services/purchase-order.service';
import { GoodsReceivedNoteService } from './services/grn.service';
import { PurchaseRequisitionService } from './services/purchase-requisition.service';
import { SupplierInvoiceService } from './services/supplier-invoice.service';
import { SupplierReturnService } from './services/supplier-return.service';
import { SupplierPaymentService } from './services/supplier-payment.service';
import { SupplierChequeService } from './services/supplier-cheque.service';
import { SupplierLedgerService } from './services/supplier-ledger.service';
import { PurchasingReportsService } from './services/purchasing-reports.service';

@Module({
  imports: [DatabaseModule],
  controllers: [
    SupplierController,
    PurchaseRequisitionController,
    PurchaseOrderController,
    GoodsReceivedNoteController,
    SupplierInvoiceController,
    SupplierReturnController,
    SupplierPaymentController,
    SupplierChequeController,
    SupplierLedgerController,
    PurchasingReportsController,
  ],
  providers: [
    SupplierService,
    PurchaseRequisitionService,
    PurchaseOrderService,
    GoodsReceivedNoteService,
    SupplierInvoiceService,
    SupplierReturnService,
    SupplierPaymentService,
    SupplierChequeService,
    SupplierLedgerService,
    PurchasingReportsService,
  ],
  exports: [
    SupplierService,
    PurchaseRequisitionService,
    PurchaseOrderService,
    GoodsReceivedNoteService,
    SupplierInvoiceService,
    SupplierReturnService,
    SupplierPaymentService,
    SupplierChequeService,
    SupplierLedgerService,
    PurchasingReportsService,
  ],
})
export class PurchasingModule {}
