import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PosTerminalController } from './controllers/pos-terminal.controller';
import { CashSessionController } from './controllers/cash-session.controller';
import { PosCheckoutController } from './controllers/pos-checkout.controller';
import { PosReturnsController } from './controllers/pos-returns.controller';
import { PosSyncController } from './controllers/pos-sync.controller';
import { PosTerminalService } from './services/pos-terminal.service';
import { CashSessionService } from './services/cash-session.service';
import { PosCheckoutService } from './services/pos-checkout.service';
import { PosReturnsService } from './services/pos-returns.service';
import { PosSyncService } from './services/pos-sync.service';

@Module({
  imports: [DatabaseModule],
  controllers: [
    PosTerminalController,
    CashSessionController,
    PosCheckoutController,
    PosReturnsController,
    PosSyncController,
  ],
  providers: [
    PosTerminalService,
    CashSessionService,
    PosCheckoutService,
    PosReturnsService,
    PosSyncService,
  ],
  exports: [
    PosTerminalService,
    CashSessionService,
    PosCheckoutService,
    PosReturnsService,
    PosSyncService,
  ],
})
export class PosModule {}
