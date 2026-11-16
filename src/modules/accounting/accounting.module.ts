import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AccountingController } from './controllers/accounting.controller';
import { AccountingService } from './services/accounting.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
