import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { MerchantBillingService } from '../services/merchant-billing.service';
import { SubmitMerchantSlipDto } from '../dto/billing.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Merchant - Billing & Subscription')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('merchant/billing')
export class MerchantBillingController {
  constructor(private billingService: MerchantBillingService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get current merchant subscription, quota usage, invoices, and plans' })
  @ApiResponse({ status: 200, description: 'Merchant billing and quota overview' })
  async getOverview(@CurrentUser() user: AuthenticatedUserContext) {
    return this.billingService.getBillingOverview(user.merchantId!);
  }

  @Post('submit-slip')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit manual bank deposit slip for invoice settlement' })
  @ApiResponse({ status: 201, description: 'Bank slip submitted for review' })
  async submitSlip(
    @Body() dto: SubmitMerchantSlipDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.billingService.submitDepositSlip(user.merchantId!, dto);
  }
}
