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
import { StockTransferService } from '../services/stock-transfer.service';
import {
  CreateStockTransferDto,
  ReceiveStockTransferDto,
} from '../dto/stock-transfer.dto';
import { ListTransfersQueryDto } from '../dto/inventory-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Inventory - Inter-Warehouse Transfers')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('inventory/transfers')
export class StockTransferController {
  constructor(private transferService: StockTransferService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter inter-warehouse stock transfers' })
  @ApiResponse({ status: 200, description: 'Paginated stock transfers' })
  async listTransfers(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListTransfersQueryDto,
  ) {
    return this.transferService.listTransfers(user.merchantId!, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transfer details by ID' })
  @ApiResponse({ status: 200, description: 'Transfer details with items and warehouses' })
  async getTransferById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.transferService.getTransferById(user.merchantId!, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a draft inter-warehouse stock transfer' })
  @ApiResponse({ status: 201, description: 'Draft transfer created' })
  async createTransfer(
    @Body() dto: CreateStockTransferDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.transferService.createTransfer(user.merchantId!, dto, user.userId);
  }

  @Post(':id/dispatch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dispatch transfer: Deducts stock from source warehouse and sets status to IN_TRANSIT',
  })
  @ApiResponse({ status: 200, description: 'Transfer dispatched' })
  async dispatchTransfer(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.transferService.dispatchTransfer(user.merchantId!, id, user.userId);
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive transfer: Adds stock to destination warehouse and sets status to RECEIVED',
  })
  @ApiResponse({ status: 200, description: 'Transfer received' })
  async receiveTransfer(
    @Param('id') id: string,
    @Body() dto: ReceiveStockTransferDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.transferService.receiveTransfer(user.merchantId!, id, dto, user.userId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel transfer: Reverses source stock deduction if IN_TRANSIT and marks CANCELLED',
  })
  @ApiResponse({ status: 200, description: 'Transfer cancelled' })
  async cancelTransfer(
    @Param('id') id: string,
    @Body('notes') notes: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.transferService.cancelTransfer(user.merchantId!, id, user.userId, notes);
  }
}
