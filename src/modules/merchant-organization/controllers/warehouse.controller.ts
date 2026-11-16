import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WarehouseService } from '../services/warehouse.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from '../dto/warehouse.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Merchant - Warehouses')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('merchant/warehouses')
export class WarehouseController {
  constructor(private warehouseService: WarehouseService) {}

  @Get()
  @ApiOperation({ summary: 'List all physical inventory warehouses for current merchant' })
  async listWarehouses(@CurrentUser() user: AuthenticatedUserContext) {
    return this.warehouseService.listWarehouses(user.merchantId!);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get warehouse details by ID' })
  async getWarehouseById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.warehouseService.getWarehouseById(user.merchantId!, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new inventory warehouse (verifies plan maxWarehouses limit)' })
  async createWarehouse(
    @Body() dto: CreateWarehouseDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.warehouseService.createWarehouse(user.merchantId!, dto, user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update warehouse information' })
  async updateWarehouse(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.warehouseService.updateWarehouse(user.merchantId!, id, dto, user.userId);
  }
}
