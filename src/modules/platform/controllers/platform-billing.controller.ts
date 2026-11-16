import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformBillingService } from '../services/platform-billing.service';
import {
  SubmitBankSlipDto,
  ReviewPaymentVerificationDto,
  RejectPaymentVerificationDto,
  PayHereIpnDto,
} from '../dto/platform-billing.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext, PaymentVerificationStatus } from '@/common/types';

@ApiTags('Platform - Billing & Payments')
@Controller('platform/payments')
export class PlatformBillingController {
  constructor(private billingService: PlatformBillingService) {}

  @Post('submit-slip')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit manual bank deposit slip for invoice settlement' })
  async submitBankSlip(@Body() dto: SubmitBankSlipDto) {
    return this.billingService.submitBankSlip(dto);
  }

  @Get('verifications')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiOperation({ summary: 'List submitted payment verifications for review' })
  async listVerifications(
    @Query('status') status?: PaymentVerificationStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.billingService.listVerifications({ status, page, limit });
  }

  @Post('verifications/:id/approve')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve submitted bank slip and mark invoice PAID' })
  async approveVerification(
    @Param('id') id: string,
    @Body() dto: ReviewPaymentVerificationDto,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.billingService.approveVerification(id, admin.userId, dto);
  }

  @Post('verifications/:id/reject')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject submitted bank slip with reason' })
  async rejectVerification(
    @Param('id') id: string,
    @Body() dto: RejectPaymentVerificationDto,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.billingService.rejectVerification(id, admin.userId, dto);
  }

  @Post('payhere/ipn')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PayHere IPN webhook callback' })
  async handlePayHereIpn(@Body() ipnDto: PayHereIpnDto) {
    return this.billingService.handlePayHereIpn(ipnDto);
  }
}
