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
import { PurchaseRequisitionService } from '../services/purchase-requisition.service';
import {
  CreatePurchaseRequisitionDto,
  ApproveRequisitionDto,
  RejectRequisitionDto,
  ConvertRequisitionToPODto,
  ListPurchaseRequisitionsQueryDto,
} from '../dto/purchase-requisition.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Purchasing - Requisitions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('purchasing/requisitions')
export class PurchaseRequisitionController {
  constructor(private requisitionService: PurchaseRequisitionService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter purchase requisitions' })
  async listRequisitions(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListPurchaseRequisitionsQueryDto,
  ) {
    return this.requisitionService.listRequisitions(user.merchantId!, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get purchase requisition details' })
  async getRequisitionById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.requisitionService.getRequisitionById(user.merchantId!, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create purchase requisition' })
  async createRequisition(
    @Body() dto: CreatePurchaseRequisitionDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.requisitionService.createRequisition(user.merchantId!, dto, user.userId);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve purchase requisition with optional item quantity adjustments' })
  async approveRequisition(
    @Param('id') id: string,
    @Body() dto: ApproveRequisitionDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.requisitionService.approveRequisition(user.merchantId!, id, dto, user.userId);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject purchase requisition' })
  async rejectRequisition(
    @Param('id') id: string,
    @Body() dto: RejectRequisitionDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.requisitionService.rejectRequisition(user.merchantId!, id, dto, user.userId);
  }

  @Post(':id/convert-to-po')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Convert approved requisition into Purchase Order' })
  async convertToPO(
    @Param('id') id: string,
    @Body() dto: ConvertRequisitionToPODto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.requisitionService.convertToPO(user.merchantId!, id, dto, user.userId);
  }
}
