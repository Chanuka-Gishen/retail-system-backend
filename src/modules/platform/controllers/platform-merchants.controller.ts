import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PlatformMerchantsService } from '../services/platform-merchants.service';
import {
  ListMerchantsQueryDto,
  SuspendMerchantDto,
  AdminCreateMerchantDto,
  AdminUpdateMerchantDto,
  AdminCreateBranchDto,
  AdminUpdateBranchDto,
  UpdateMerchantSubscriptionDto,
  AdminRenewBankTransferDto,
  GrantGracePeriodDto,
} from '../dto/platform-merchants.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Platform - Merchants')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('platform/merchants')
export class PlatformMerchantsController {
  constructor(private merchantsService: PlatformMerchantsService) {}

  @Get()
  @ApiOperation({ summary: 'List all registered merchants with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated list of merchants' })
  async listMerchants(@Query() query: ListMerchantsQueryDto) {
    return this.merchantsService.listMerchants(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new merchant organization with initial store and owner user' })
  async createMerchant(
    @Body() dto: AdminCreateMerchantDto,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.merchantsService.createMerchant(dto, admin.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get detailed merchant profile, branches, and subscriptions' })
  async getMerchantById(@Param('id') id: string) {
    return this.merchantsService.getMerchantById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update merchant profile, subscription plan, and contact information' })
  async updateMerchant(
    @Param('id') id: string,
    @Body() dto: AdminUpdateMerchantDto,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.merchantsService.updateMerchant(id, dto, admin.userId);
  }

  @Put(':id/subscription')
  @ApiOperation({ summary: 'Update merchant subscription plan, cycle, or lifecycle status' })
  async updateMerchantSubscription(
    @Param('id') id: string,
    @Body() dto: UpdateMerchantSubscriptionDto,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.merchantsService.updateMerchantSubscription(id, dto, admin.userId);
  }

  @Post(':id/subscription/renew-bank-transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renew or start merchant subscription via manual bank transfer receipt' })
  async renewSubscriptionViaBankTransfer(
    @Param('id') id: string,
    @Body() dto: AdminRenewBankTransferDto,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.merchantsService.renewSubscriptionViaBankTransfer(id, dto, admin.userId);
  }

  @Post(':id/subscription/grace-period')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grant a 1-week (7-day) grace period to allow merchant login access' })
  async grantGracePeriod(
    @Param('id') id: string,
    @Body() dto: GrantGracePeriodDto,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.merchantsService.grantGracePeriod(id, dto, admin.userId);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve pending merchant application' })
  async approveMerchant(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.merchantsService.approveMerchant(id, admin.userId);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend merchant and revoke all active sessions' })
  async suspendMerchant(
    @Param('id') id: string,
    @Body() dto: SuspendMerchantDto,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.merchantsService.suspendMerchant(id, dto, admin.userId);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate suspended merchant' })
  async reactivateMerchant(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.merchantsService.reactivateMerchant(id, admin.userId);
  }

  // --- BRANCHES / SHOPS MANAGEMENT ---

  @Get(':id/branches')
  @ApiOperation({ summary: 'List all shops/branches for a merchant' })
  async listMerchantBranches(@Param('id') id: string) {
    return this.merchantsService.listMerchantBranches(id);
  }

  @Post(':id/branches')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a new shop/branch to a merchant' })
  async createMerchantBranch(
    @Param('id') id: string,
    @Body() dto: AdminCreateBranchDto,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.merchantsService.createMerchantBranch(id, dto, admin.userId);
  }

  @Put(':id/branches/:branchId')
  @ApiOperation({ summary: 'Update an existing shop/branch for a merchant' })
  async updateMerchantBranch(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Body() dto: AdminUpdateBranchDto,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.merchantsService.updateMerchantBranch(id, branchId, dto, admin.userId);
  }
}
