import { Module } from '@nestjs/common';
import { BranchController } from './controllers/branch.controller';
import { WarehouseController } from './controllers/warehouse.controller';
import { MerchantUserController } from './controllers/merchant-user.controller';
import { RoleController } from './controllers/role.controller';
import { MerchantBillingController } from './controllers/merchant-billing.controller';
import { BranchService } from './services/branch.service';
import { WarehouseService } from './services/warehouse.service';
import { MerchantUserService } from './services/merchant-user.service';
import { RoleService } from './services/role.service';
import { MerchantBillingService } from './services/merchant-billing.service';

@Module({
  controllers: [
    BranchController,
    WarehouseController,
    MerchantUserController,
    RoleController,
    MerchantBillingController,
  ],
  providers: [
    BranchService,
    WarehouseService,
    MerchantUserService,
    RoleService,
    MerchantBillingService,
  ],
  exports: [
    BranchService,
    WarehouseService,
    MerchantUserService,
    RoleService,
    MerchantBillingService,
  ],
})
export class MerchantOrganizationModule {}
