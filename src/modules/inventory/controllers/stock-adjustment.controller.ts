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
import { StockAdjustmentService } from '../services/stock-adjustment.service';
import { CreateStockAdjustmentDto } from '../dto/stock-adjustment.dto';
import { ListAdjustmentsQueryDto } from '../dto/inventory-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Inventory - Stock Adjustments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('inventory/adjustments')
export class StockAdjustmentController {
  constructor(private adjustmentService: StockAdjustmentService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter stock adjustments' })
  @ApiResponse({ status: 200, description: 'Paginated stock adjustments' })
  async listAdjustments(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListAdjustmentsQueryDto,
  ) {
    return this.adjustmentService.listAdjustments(user.merchantId!, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get stock adjustment details by ID' })
  @ApiResponse({ status: 200, description: 'Stock adjustment details with items' })
  async getAdjustmentById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.adjustmentService.getAdjustmentById(user.merchantId!, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create and apply stock adjustment (atomically updates stock balances and ledger)',
  })
  @ApiResponse({ status: 201, description: 'Adjustment created and applied' })
  async createAdjustment(
    @Body() dto: CreateStockAdjustmentDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.adjustmentService.createAdjustment(user.merchantId!, dto, user.userId);
  }
}
