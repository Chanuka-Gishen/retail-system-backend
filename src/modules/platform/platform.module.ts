import { Module } from '@nestjs/common';
import { PlatformMerchantsController } from './controllers/platform-merchants.controller';
import { PlatformPlansController } from './controllers/platform-plans.controller';
import { PlatformBillingController } from './controllers/platform-billing.controller';
import { PlatformUsersController } from './controllers/platform-users.controller';
import { PlatformPromosController } from './controllers/platform-promos.controller';
import { PlatformMerchantsService } from './services/platform-merchants.service';
import { PlatformPlansService } from './services/platform-plans.service';
import { PlatformBillingService } from './services/platform-billing.service';
import { PlatformUsersService } from './services/platform-users.service';
import { PlatformPromosService } from './services/platform-promos.service';

@Module({
  controllers: [
    PlatformMerchantsController,
    PlatformPlansController,
    PlatformBillingController,
    PlatformUsersController,
    PlatformPromosController,
  ],
  providers: [
    PlatformMerchantsService,
    PlatformPlansService,
    PlatformBillingService,
    PlatformUsersService,
    PlatformPromosService,
  ],
  exports: [
    PlatformMerchantsService,
    PlatformPlansService,
    PlatformBillingService,
    PlatformUsersService,
    PlatformPromosService,
  ],
})
export class PlatformModule {}
