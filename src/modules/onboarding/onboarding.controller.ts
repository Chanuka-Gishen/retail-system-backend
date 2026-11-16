import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { OnboardingService } from './onboarding.service';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { BillingCycle } from '@/common/types';

@ApiTags('Onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get active subscription plans for merchant registration' })
  @ApiResponse({ status: 200, description: 'List of available subscription plans' })
  async getPublicPlans() {
    return this.onboardingService.getPublicPlans();
  }

  @Get('validate-promo')
  @ApiOperation({ summary: 'Validate a promo code for merchant registration' })
  @ApiQuery({ name: 'code', required: true, description: 'Promo code to validate' })
  @ApiQuery({ name: 'planId', required: false, description: 'Selected plan ID' })
  @ApiQuery({ name: 'billingCycle', required: false, enum: BillingCycle })
  @ApiResponse({ status: 200, description: 'Promo details and computed discount' })
  async validatePromo(
    @Query('code') code: string,
    @Query('planId') planId?: string,
    @Query('billingCycle') billingCycle?: BillingCycle,
  ) {
    return this.onboardingService.validatePromoCode(code, planId, billingCycle);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Public self-registration for new retail merchants' })
  @ApiResponse({ status: 201, description: 'Merchant and owner registered successfully' })
  async register(@Body() dto: RegisterMerchantDto, @Req() req: Request) {
    const clientIp = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.onboardingService.register(dto, clientIp, userAgent);
  }
}
