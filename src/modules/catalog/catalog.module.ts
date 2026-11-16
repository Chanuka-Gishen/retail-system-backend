import { Module } from '@nestjs/common';
import { CategoryController } from './controllers/category.controller';
import { BrandController } from './controllers/brand.controller';
import { TaxProfileController } from './controllers/tax-profile.controller';
import { ProductController } from './controllers/product.controller';
import { PosCatalogController } from './controllers/pos-catalog.controller';
import { CategoryService } from './services/category.service';
import { BrandService } from './services/brand.service';
import { TaxProfileService } from './services/tax-profile.service';
import { ProductService } from './services/product.service';

@Module({
  controllers: [
    CategoryController,
    BrandController,
    TaxProfileController,
    ProductController,
    PosCatalogController,
  ],
  providers: [
    CategoryService,
    BrandService,
    TaxProfileService,
    ProductService,
  ],
  exports: [
    CategoryService,
    BrandService,
    TaxProfileService,
    ProductService,
  ],
})
export class CatalogModule {}
