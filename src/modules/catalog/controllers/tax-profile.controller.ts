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
import { TaxProfileService } from '../services/tax-profile.service';
import { CreateTaxProfileDto, UpdateTaxProfileDto } from '../dto/tax-profile.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Catalog - Tax Profiles')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('catalog/tax-profiles')
export class TaxProfileController {
  constructor(private taxProfileService: TaxProfileService) {}

  @Get()
  @ApiOperation({ summary: 'List all tax profiles and rates for current merchant' })
  async listTaxProfiles(@CurrentUser() user: AuthenticatedUserContext) {
    return this.taxProfileService.listTaxProfiles(user.merchantId!);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new tax rate profile' })
  async createTaxProfile(
    @Body() dto: CreateTaxProfileDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.taxProfileService.createTaxProfile(user.merchantId!, dto, user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update tax rate profile' })
  async updateTaxProfile(
    @Param('id') id: string,
    @Body() dto: UpdateTaxProfileDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.taxProfileService.updateTaxProfile(user.merchantId!, id, dto, user.userId);
  }
}
