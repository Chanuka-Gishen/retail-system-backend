import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PosSyncService } from '../services/pos-sync.service';
import {
  BatchSyncDto,
  CatalogDeltaQueryDto,
} from '../dto/pos-sync.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('POS - Offline Synchronization')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('pos/sync')
export class PosSyncController {
  constructor(private syncService: PosSyncService) {}

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Batch reconcile and synchronize offline sales and cash movements from POS IndexedDB',
  })
  @ApiResponse({ status: 200, description: 'Batch synchronization results and status map' })
  async syncBatch(
    @Body() dto: BatchSyncDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.syncService.syncBatch(user.merchantId!, dto, user.userId);
  }

  @Get('catalog-delta')
  @ApiOperation({
    summary: 'Fetch incremental product, price, and tax profile delta changes for offline terminal cache',
  })
  @ApiResponse({ status: 200, description: 'Catalog delta payload with server sync watermark timestamp' })
  async getCatalogDelta(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: CatalogDeltaQueryDto,
  ) {
    return this.syncService.getCatalogDelta(user.merchantId!, query);
  }
}
