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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PosCheckoutService } from '../services/pos-checkout.service';
import {
  CreateCheckoutDto,
  ListSalesQueryDto,
} from '../dto/checkout.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('POS - Checkout & Sales')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('pos')
export class PosCheckoutController {
  constructor(private checkoutService: PosCheckoutService) {}

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Process atomic POS checkout sale with stock deduction and payment verification',
  })
  @ApiResponse({ status: 201, description: 'Sale processed successfully' })
  @ApiResponse({ status: 400, description: 'Insufficient stock or invalid tender payment' })
  async checkout(
    @Body() dto: CreateCheckoutDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.checkoutService.checkout(user.merchantId!, dto, user.userId);
  }

  @Get('sales')
  @ApiOperation({ summary: 'List and filter sales transactions' })
  @ApiResponse({ status: 200, description: 'Paginated list of sales' })
  async listSales(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListSalesQueryDto,
  ) {
    return this.checkoutService.listSales(user.merchantId!, query);
  }

  @Get('sales/:id')
  @ApiOperation({ summary: 'Get detailed sale transaction with items and payments' })
  @ApiResponse({ status: 200, description: 'Sale transaction details' })
  @ApiResponse({ status: 404, description: 'Sale not found' })
  async getSaleById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.checkoutService.getSaleById(user.merchantId!, id);
  }

  @Get('sales/:id/receipt')
  @ApiOperation({ summary: 'Get print-ready receipt object for POS thermal printer' })
  @ApiResponse({ status: 200, description: 'Receipt data structure' })
  @ApiResponse({ status: 404, description: 'Sale not found' })
  async getReceipt(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.checkoutService.getReceipt(user.merchantId!, id);
  }
}
