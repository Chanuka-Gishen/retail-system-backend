import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PurchaseOrderService } from '../services/purchase-order.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  RejectPurchaseOrderDto,
  ListPurchaseOrdersQueryDto,
} from '../dto/purchase-order.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Purchasing - Purchase Orders')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('purchasing/orders')
export class PurchaseOrderController {
  constructor(private poService: PurchaseOrderService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter purchase orders' })
  async listPurchaseOrders(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListPurchaseOrdersQueryDto,
  ) {
    return this.poService.listPurchaseOrders(user.merchantId!, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get purchase order details' })
  async getPurchaseOrderById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.poService.getPurchaseOrderById(user.merchantId!, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create purchase order' })
  async createPurchaseOrder(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.poService.createPurchaseOrder(user.merchantId!, dto, user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update purchase order (while in DRAFT)' })
  async updatePurchaseOrder(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.poService.updatePurchaseOrder(user.merchantId!, id, dto);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve purchase order' })
  async approvePurchaseOrder(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.poService.approvePurchaseOrder(user.merchantId!, id, user.userId);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject purchase order' })
  async rejectPurchaseOrder(
    @Param('id') id: string,
    @Body() dto: RejectPurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.poService.rejectPurchaseOrder(user.merchantId!, id, dto, user.userId);
  }

  @Post(':id/issue')
  @ApiOperation({ summary: 'Issue/Send purchase order to supplier' })
  async issuePurchaseOrder(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.poService.issuePurchaseOrder(user.merchantId!, id, user.userId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel purchase order' })
  async cancelPurchaseOrder(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.poService.cancelPurchaseOrder(user.merchantId!, id, user.userId);
  }
}
