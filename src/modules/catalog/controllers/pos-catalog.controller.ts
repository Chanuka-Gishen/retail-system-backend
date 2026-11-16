import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProductService } from '../services/product.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('POS - Offline Catalog Snapshot')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('pos')
export class PosCatalogController {
  constructor(private productService: ProductService) {}

  @Get('catalog-snapshot')
  @ApiOperation({ summary: 'Get optimized catalog snapshot for POS offline caching' })
  async getCatalogSnapshot(@CurrentUser() user: AuthenticatedUserContext) {
    return this.productService.getCatalogSnapshot(user.merchantId!);
  }
}
