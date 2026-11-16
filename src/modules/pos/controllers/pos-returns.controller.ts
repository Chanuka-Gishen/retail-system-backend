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
import { PosReturnsService } from '../services/pos-returns.service';
import {
  CreateCustomerReturnDto,
  ListCustomerReturnsQueryDto,
} from '../dto/return.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('POS - Returns & Refunds')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('pos/returns')
export class PosReturnsController {
  constructor(private returnsService: PosReturnsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Process customer product return, stock restock or damage disposal, and refund payout',
  })
  @ApiResponse({ status: 201, description: 'Return processed successfully' })
  @ApiResponse({ status: 400, description: 'Return quantity exceeds available purchased quantity' })
  async createReturn(
    @Body() dto: CreateCustomerReturnDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.returnsService.createReturn(user.merchantId!, dto, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List and filter customer returns history' })
  @ApiResponse({ status: 200, description: 'Paginated list of customer returns' })
  async listReturns(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListCustomerReturnsQueryDto,
  ) {
    return this.returnsService.listReturns(user.merchantId!, query);
  }

  @Get('vouchers/:code')
  @ApiOperation({ summary: 'Verify exchange credit voucher by code' })
  @ApiResponse({ status: 200, description: 'Voucher status, balance and remaining validity' })
  async verifyVoucher(
    @Param('code') code: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.returnsService.verifyVoucher(user.merchantId!, code);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer return details with itemized restock actions' })
  @ApiResponse({ status: 200, description: 'Return transaction details' })
  @ApiResponse({ status: 404, description: 'Return not found' })
  async getReturnById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.returnsService.getReturnById(user.merchantId!, id);
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Get formatted thermal receipt for customer refund voucher' })
  @ApiResponse({ status: 200, description: 'Refund receipt payload' })
  @ApiResponse({ status: 404, description: 'Return not found' })
  async getReturnReceipt(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.returnsService.getReturnReceipt(user.merchantId!, id);
  }
}
