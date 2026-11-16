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
import { SupplierInvoiceService } from '../services/supplier-invoice.service';
import {
  CreateSupplierInvoiceDto,
  VerifySupplierInvoiceDto,
  ListSupplierInvoicesQueryDto,
} from '../dto/supplier-invoice.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Purchasing - Supplier Invoices')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('purchasing/invoices')
export class SupplierInvoiceController {
  constructor(private invoiceService: SupplierInvoiceService) {}

  @Get()
  @ApiOperation({ summary: 'List and search supplier invoices' })
  async listInvoices(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListSupplierInvoicesQueryDto,
  ) {
    return this.invoiceService.listInvoices(user.merchantId!, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get supplier invoice details' })
  async getInvoiceById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.invoiceService.getInvoiceById(user.merchantId!, id);
  }

  @Get(':id/three-way-match')
  @ApiOperation({ summary: 'Get 3-Way Match comparison matrix (PO vs GRN vs Invoice)' })
  async getThreeWayMatch(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.invoiceService.getThreeWayMatch(user.merchantId!, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new supplier invoice with 3-Way Match validation' })
  async createInvoice(
    @Body() dto: CreateSupplierInvoiceDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.invoiceService.createInvoice(user.merchantId!, dto, user.userId);
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Verify and approve supplier invoice, posting liability to ledger' })
  async verifyInvoice(
    @Param('id') id: string,
    @Body() dto: VerifySupplierInvoiceDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.invoiceService.verifyInvoice(user.merchantId!, id, dto, user.userId);
  }
}
