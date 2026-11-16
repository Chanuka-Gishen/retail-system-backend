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
import { BrandService } from '../services/brand.service';
import { CreateBrandDto, UpdateBrandDto } from '../dto/brand.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Catalog - Brands')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('catalog/brands')
export class BrandController {
  constructor(private brandService: BrandService) {}

  @Get()
  @ApiOperation({ summary: 'List all product brands for current merchant' })
  async listBrands(@CurrentUser() user: AuthenticatedUserContext) {
    return this.brandService.listBrands(user.merchantId!);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new product brand' })
  async createBrand(
    @Body() dto: CreateBrandDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.brandService.createBrand(user.merchantId!, dto, user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update product brand' })
  async updateBrand(
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.brandService.updateBrand(user.merchantId!, id, dto, user.userId);
  }
}
