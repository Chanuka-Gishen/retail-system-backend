import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { InventoryController } from './controllers/inventory.controller';
import { StockAdjustmentController } from './controllers/stock-adjustment.controller';
import { StockTransferController } from './controllers/stock-transfer.controller';
import { InventoryService } from './services/inventory.service';
import { StockAdjustmentService } from './services/stock-adjustment.service';
import { StockTransferService } from './services/stock-transfer.service';

@Module({
  imports: [DatabaseModule],
  controllers: [
    InventoryController,
    StockAdjustmentController,
    StockTransferController,
  ],
  providers: [
    InventoryService,
    StockAdjustmentService,
    StockTransferService,
  ],
  exports: [
    InventoryService,
    StockAdjustmentService,
    StockTransferService,
  ],
})
export class InventoryModule {}
