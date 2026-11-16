import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './modules/database/database.module';
import { RedisModule } from './modules/redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { PlatformModule } from './modules/platform/platform.module';
import { MerchantOrganizationModule } from './modules/merchant-organization/merchant-organization.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { PosModule } from './modules/pos/pos.module';
import { CustomerModule } from './modules/customer/customer.module';
import { AccountingModule } from './modules/accounting/accounting.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthModule,
    OnboardingModule,
    PlatformModule,
    MerchantOrganizationModule,
    CatalogModule,
    InventoryModule,
    PurchasingModule,
    PosModule,
    CustomerModule,
    AccountingModule,
  ],
})
export class AppModule {}
