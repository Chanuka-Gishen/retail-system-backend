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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ProductService } from '../services/product.service';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateVariantItemDto,
  UpdateVariantDto,
} from '../dto/product.dto';
import { ListProductsQueryDto } from '../dto/catalog-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Catalog - Products')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('catalog')
export class ProductController {
  constructor(private productService: ProductService) {}

  @Get('products')
  @ApiOperation({ summary: 'List and filter catalog products' })
  @ApiResponse({ status: 200, description: 'Paginated list of products' })
  async listProducts(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListProductsQueryDto,
  ) {
    return this.productService.listProducts(user.merchantId!, query);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get full product details including variants and stock balances' })
  async getProductById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.productService.getProductById(user.merchantId!, id);
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new catalog product and variants (verifies plan maxProducts limit)' })
  async createProduct(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.productService.createProduct(user.merchantId!, dto, user.userId);
  }

  @Put('products/:id')
  @ApiOperation({ summary: 'Update catalog product master details' })
  async updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.productService.updateProduct(user.merchantId!, id, dto, user.userId);
  }

  @Post('products/:id/variants')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a new variant to an existing product' })
  async addVariant(
    @Param('id') productId: string,
    @Body() dto: CreateVariantItemDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.productService.addVariant(user.merchantId!, productId, dto, user.userId);
  }

  @Put('variants/:variantId')
  @ApiOperation({ summary: 'Update product variant pricing and barcode' })
  async updateVariant(
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.productService.updateVariant(user.merchantId!, variantId, dto, user.userId);
  }
}
