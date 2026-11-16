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
import { GoodsReceivedNoteService } from '../services/grn.service';
import {
  CreateGoodsReceivedNoteDto,
  ListGRNQueryDto,
} from '../dto/grn.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Purchasing - Goods Received Notes (GRN)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('purchasing/grn')
export class GoodsReceivedNoteController {
  constructor(private grnService: GoodsReceivedNoteService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter goods received notes' })
  @ApiResponse({ status: 200, description: 'Paginated list of GRNs' })
  async listGRNs(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListGRNQueryDto,
  ) {
    return this.grnService.listGRNs(user.merchantId!, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get GRN details by ID' })
  @ApiResponse({ status: 200, description: 'GRN details with items and PO matching' })
  async getGRNById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.grnService.getGRNById(user.merchantId!, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create draft Goods Received Note (optionally linked to a Purchase Order)' })
  @ApiResponse({ status: 201, description: 'Draft GRN created' })
  async createGRN(
    @Body() dto: CreateGoodsReceivedNoteDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.grnService.createGRN(user.merchantId!, dto, user.userId);
  }

  @Post(':id/post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Post GRN: Atomically performs 3-way PO matching, landed cost allocation, AVCO inventory costing, and updates stock balances and movements',
  })
  @ApiResponse({ status: 200, description: 'GRN posted successfully' })
  async postGRN(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.grnService.postGRN(user.merchantId!, id, user.userId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel draft Goods Received Note' })
  @ApiResponse({ status: 200, description: 'GRN cancelled' })
  async cancelGRN(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.grnService.cancelGRN(user.merchantId!, id, user.userId);
  }
}
