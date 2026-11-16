import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformPromosService } from '../services/platform-promos.service';
import {
  CreatePromoCodeDto,
  UpdatePromoCodeDto,
  ListPromosQueryDto,
} from '../dto/platform-promos.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Platform - Promo Codes & Affiliates')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('platform/promos')
export class PlatformPromosController {
  constructor(private promosService: PlatformPromosService) {}

  @Get()
  @ApiOperation({ summary: 'List platform promo codes with usage and revenue metrics' })
  async listPromos(@Query() query: ListPromosQueryDto) {
    return this.promosService.listPromos(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get aggregate platform promo statistics, customer acquisition and monthly gains' })
  async getSummaryStats() {
    return this.promosService.getPromoSummaryStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single promo code by ID with redemptions overview' })
  async getPromoById(@Param('id') id: string) {
    return this.promosService.getPromoById(id);
  }

  @Get(':id/redemptions')
  @ApiOperation({ summary: 'Get customer tracking list for all merchants who redeemed this promo' })
  async getPromoRedemptions(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.promosService.getPromoRedemptions(id, page ? Number(page) : 1, limit ? Number(limit) : 20);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new platform promotional code' })
  async createPromo(
    @Body() dto: CreatePromoCodeDto,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.promosService.createPromo(dto, admin.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update existing promo code settings' })
  async updatePromo(
    @Param('id') id: string,
    @Body() dto: UpdatePromoCodeDto,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.promosService.updatePromo(id, dto, admin.userId);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Toggle promo code active/inactive status' })
  async togglePromo(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.promosService.togglePromoStatus(id, admin.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete unused promotional code' })
  async deletePromo(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUserContext,
  ) {
    return this.promosService.deletePromo(id, admin.userId);
  }
}
