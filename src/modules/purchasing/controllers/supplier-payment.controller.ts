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
import { SupplierPaymentService } from '../services/supplier-payment.service';
import {
  CreateSupplierPaymentDto,
  ListSupplierPaymentsQueryDto,
} from '../dto/supplier-payment.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Purchasing - Supplier Payments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('purchasing/payments')
export class SupplierPaymentController {
  constructor(private paymentService: SupplierPaymentService) {}

  @Get()
  @ApiOperation({ summary: 'List and search supplier payments' })
  async listPayments(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListSupplierPaymentsQueryDto,
  ) {
    return this.paymentService.listPayments(user.merchantId!, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get supplier payment details with invoice allocations and cheque' })
  async getPaymentById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.paymentService.getPaymentById(user.merchantId!, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record supplier payment with invoice allocation & auto-cheque registration' })
  async recordPayment(
    @Body() dto: CreateSupplierPaymentDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.paymentService.recordPayment(user.merchantId!, dto, user.userId);
  }
}
