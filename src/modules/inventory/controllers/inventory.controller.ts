import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { InventoryService } from '../services/inventory.service';
import { ListStockBalancesQueryDto, ListMovementsQueryDto } from '../dto/inventory-query.dto';
import {
  ListBatchesQueryDto,
  CreateBatchDto,
  UpdateBatchDto,
} from '../dto/batch.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Inventory & Stock Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get('balances')
  @ApiOperation({ summary: 'List and filter warehouse stock balances with inventory valuation' })
  @ApiResponse({ status: 200, description: 'Paginated stock balances with valuation summaries' })
  async listBalances(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListStockBalancesQueryDto,
  ) {
    return this.inventoryService.listBalances(user.merchantId!, query);
  }

  @Get('balances/low-stock')
  @ApiOperation({ summary: 'Get variants whose stock is at or below the reorder point' })
  @ApiResponse({ status: 200, description: 'List of low stock alert items' })
  async getLowStockAlerts(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.inventoryService.getLowStockAlerts(user.merchantId!, warehouseId);
  }

  @Get('balances/:warehouseId/:variantId')
  @ApiOperation({ summary: 'Get real-time balance for a specific variant in a warehouse' })
  @ApiResponse({ status: 200, description: 'Single stock balance details' })
  async getBalance(
    @Param('warehouseId') warehouseId: string,
    @Param('variantId') variantId: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.inventoryService.getBalance(user.merchantId!, warehouseId, variantId);
  }

  @Get('items/:variantId')
  @ApiOperation({ summary: 'Get complete 360-degree item inventory details including balances across warehouses, batches, and movements' })
  @ApiResponse({ status: 200, description: 'Item 360-degree inventory view' })
  async getItemDetails(
    @Param('variantId') variantId: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.inventoryService.getItemDetails(user.merchantId!, variantId);
  }

  @Get('movements')
  @ApiOperation({ summary: 'Query strictly append-only inventory movement audit ledger' })
  @ApiResponse({ status: 200, description: 'Paginated inventory movement ledger records' })
  async listMovements(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListMovementsQueryDto,
  ) {
    return this.inventoryService.listMovements(user.merchantId!, query);
  }

  @Get('batches')
  @ApiOperation({ summary: 'List and filter product batches with FIFO/FEFO expiry tracking' })
  @ApiResponse({ status: 200, description: 'Paginated product batches with expiry alerts' })
  async listBatches(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListBatchesQueryDto,
  ) {
    return this.inventoryService.listBatches(user.merchantId!, query);
  }

  @Get('batches/:id')
  @ApiOperation({ summary: 'Get details of a single product batch' })
  @ApiResponse({ status: 200, description: 'Batch details' })
  async getBatchById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.inventoryService.getBatchById(user.merchantId!, id);
  }

  @Post('batches')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new product batch with opening inventory stock' })
  @ApiResponse({ status: 201, description: 'Product batch created' })
  async createBatch(
    @Body() dto: CreateBatchDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.inventoryService.createBatch(user.merchantId!, dto, user.userId);
  }

  @Patch('batches/:id')
  @ApiOperation({ summary: 'Update product batch selling price, cost price, or expiry date' })
  @ApiResponse({ status: 200, description: 'Product batch updated' })
  async updateBatch(
    @Param('id') id: string,
    @Body() dto: UpdateBatchDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.inventoryService.updateBatch(user.merchantId!, id, dto);
  }

  @Get('batches/variant/:variantId')
  @ApiOperation({ summary: 'Get active available batches for a variant in FIFO/FEFO order' })
  @ApiResponse({ status: 200, description: 'List of available batches' })
  async getBatchesForVariant(
    @Param('variantId') variantId: string,
    @Query('warehouseId') warehouseId: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.inventoryService.getBatchesForVariant(user.merchantId!, variantId, warehouseId);
  }
}
