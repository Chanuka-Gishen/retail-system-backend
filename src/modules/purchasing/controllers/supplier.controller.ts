import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { SupplierService } from '../services/supplier.service';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  UpdateSupplierStatusDto,
  CreateSupplierContactDto,
  UpdateSupplierContactDto,
  CreateSupplierCategoryDto,
  UpdateSupplierCategoryDto,
  ListSuppliersQueryDto,
} from '../dto/supplier.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Purchasing - Suppliers')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('purchasing/suppliers')
export class SupplierController {
  constructor(private supplierService: SupplierService) {}

  @Get()
  @ApiOperation({ summary: 'List and search suppliers' })
  @ApiResponse({ status: 200, description: 'Paginated list of suppliers' })
  async listSuppliers(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListSuppliersQueryDto,
  ) {
    return this.supplierService.listSuppliers(user.merchantId!, query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List supplier categories' })
  async listCategories(@CurrentUser() user: AuthenticatedUserContext) {
    return this.supplierService.listCategories(user.merchantId!);
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create supplier category' })
  async createCategory(
    @Body() dto: CreateSupplierCategoryDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.supplierService.createCategory(user.merchantId!, dto);
  }

  @Put('categories/:id')
  @ApiOperation({ summary: 'Update supplier category' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierCategoryDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.supplierService.updateCategory(user.merchantId!, id, dto);
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Get live KPI dashboard for supplier' })
  @ApiResponse({ status: 200, description: 'Supplier dashboard metrics and history' })
  async getSupplierDashboard(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.supplierService.getSupplierDashboard(user.merchantId!, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get supplier details by ID with recent orders and GRNs' })
  @ApiResponse({ status: 200, description: 'Supplier profile' })
  async getSupplierById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.supplierService.getSupplierById(user.merchantId!, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new supplier profile' })
  @ApiResponse({ status: 201, description: 'Supplier created' })
  async createSupplier(
    @Body() dto: CreateSupplierDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.supplierService.createSupplier(user.merchantId!, dto, user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update supplier details' })
  @ApiResponse({ status: 200, description: 'Supplier updated' })
  async updateSupplier(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.supplierService.updateSupplier(user.merchantId!, id, dto);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update supplier status (Active, Inactive, Suspended, Blacklisted)' })
  async updateSupplierStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierStatusDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.supplierService.updateSupplierStatus(user.merchantId!, id, dto);
  }

  @Post(':id/contacts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add contact to supplier' })
  async addContact(
    @Param('id') supplierId: string,
    @Body() dto: CreateSupplierContactDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.supplierService.addContact(user.merchantId!, supplierId, dto);
  }

  @Put(':id/contacts/:contactId')
  @ApiOperation({ summary: 'Update supplier contact' })
  async updateContact(
    @Param('id') supplierId: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateSupplierContactDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.supplierService.updateContact(user.merchantId!, supplierId, contactId, dto);
  }

  @Delete(':id/contacts/:contactId')
  @ApiOperation({ summary: 'Remove contact from supplier' })
  async deleteContact(
    @Param('id') supplierId: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.supplierService.deleteContact(user.merchantId!, supplierId, contactId);
  }
}
