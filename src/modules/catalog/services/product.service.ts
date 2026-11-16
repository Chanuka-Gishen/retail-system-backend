import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateVariantItemDto,
  UpdateVariantDto,
} from '../dto/product.dto';
import { ListProductsQueryDto } from '../dto/catalog-query.dto';
import { AuditAction, OutboxStatus } from '@/common/types';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(private db: DatabaseService) {}

  async listProducts(merchantId: string, query: ListProductsQueryDto) {
    const { categoryId, brandId, search, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = { merchantId };
    if (categoryId) where.categoryId = categoryId;
    if (brandId) where.brandId = brandId;
    if (isActive !== undefined) where.isActive = isActive;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { variants: { some: { barcode: { contains: search, mode: 'insensitive' } } } },
        { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [total, products] = await Promise.all([
      this.db.product.count({ where }),
      this.db.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, code: true, name: true } },
          brand: { select: { id: true, code: true, name: true } },
          taxProfile: { select: { id: true, code: true, name: true, ratePercentage: true, isInclusive: true } },
          variants: {
            where: { isActive: true },
            select: {
              id: true,
              sku: true,
              barcode: true,
              variantName: true,
              attributeValues: true,
              costPrice: true,
              sellingPrice: true,
              minSellingPrice: true,
              discountPercentage: true,
              discountAmount: true,
              batches: {
                where: { isActive: true, quantityOnHand: { gt: 0 } },
                select: {
                  id: true,
                  batchNumber: true,
                  costPrice: true,
                  sellingPrice: true,
                  quantityOnHand: true,
                  manufacturingDate: true,
                  expiryDate: true,
                  receivedDate: true,
                },
                orderBy: [
                  { expiryDate: 'asc' },
                  { receivedDate: 'asc' },
                ],
              },
              reorderPoint: true,
            },
          },
        },
      }),
    ]);

    return {
      items: products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getProductById(merchantId: string, id: string) {
    const product = await this.db.product.findFirst({
      where: { id, merchantId },
      include: {
        category: true,
        brand: true,
        taxProfile: true,
        variants: {
          include: {
            stockBalances: {
              include: {
                warehouse: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product ${id} not found.`);
    }

    return product;
  }

  async createProduct(merchantId: string, dto: CreateProductDto, actorId: string) {
    // 1. Check Subscription Plan maxProducts Limit
    const activeSub = await this.db.merchantSubscription.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    if (activeSub) {
      const productCount = await this.db.product.count({ where: { merchantId } });
      if (productCount >= activeSub.plan.maxProducts) {
        throw new ForbiddenException(
          `Product catalog limit reached (${activeSub.plan.maxProducts} products max for ${activeSub.plan.name}). Please upgrade your plan.`,
        );
      }
    }

    // 2. Validate Unique Product Code
    const existing = await this.db.product.findUnique({
      where: {
        merchantId_code: {
          merchantId,
          code: dto.code.trim().toUpperCase(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Product with code ${dto.code} already exists.`);
    }

    // 3. Find all active warehouses for this merchant (for initializing stock balance records)
    const warehouses = await this.db.warehouse.findMany({
      where: { merchantId, isActive: true },
      select: { id: true },
    });

    // 4. Atomic Creation Transaction
    const product = await this.db.$transaction(async (tx) => {
      // 4.1 Create Product Master
      const p = await tx.product.create({
        data: {
          merchantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim(),
          categoryId: dto.categoryId,
          brandId: dto.brandId,
          taxProfileId: dto.taxProfileId,
          unit: dto.unit || 'PCS',
          imageUrl: dto.imageUrl,
          hasVariants: dto.hasVariants ?? false,
          isActive: true,
        },
      });

      // 4.2 Create Variants
      const createdVariants: any[] = [];

      if (!dto.hasVariants) {
        // Single default variant
        const defaultSku = dto.code.trim().toUpperCase();
        const v = await tx.productVariant.create({
          data: {
            productId: p.id,
            merchantId,
            sku: defaultSku,
            barcode: dto.barcode?.trim(),
            variantName: dto.name.trim(),
            costPrice: dto.costPrice ?? 0,
            sellingPrice: dto.sellingPrice ?? 0,
            minSellingPrice: dto.minSellingPrice,
            discountPercentage: dto.discountPercentage ?? 0,
            discountAmount: dto.discountAmount ?? 0,
            reorderPoint: dto.reorderPoint ?? 10,
            isActive: true,
          },
        });
        createdVariants.push(v);
      } else {
        // Multi-variant matrix
        if (!dto.variants || dto.variants.length === 0) {
          throw new BadRequestException('At least one variant must be specified when hasVariants is true.');
        }

        for (const variantItem of dto.variants) {
          const v = await tx.productVariant.create({
            data: {
              productId: p.id,
              merchantId,
              sku: variantItem.sku.trim().toUpperCase(),
              barcode: variantItem.barcode?.trim(),
              variantName: variantItem.variantName.trim(),
              attributeValues: variantItem.attributeValues,
              costPrice: variantItem.costPrice,
              sellingPrice: variantItem.sellingPrice,
              minSellingPrice: variantItem.minSellingPrice,
              discountPercentage: variantItem.discountPercentage ?? 0,
              discountAmount: variantItem.discountAmount ?? 0,
              reorderPoint: variantItem.reorderPoint ?? 10,
              isActive: true,
            },
          });
          createdVariants.push(v);
        }
      }

      // 4.3 Initialize StockBalance for each warehouse and variant
      for (const variant of createdVariants) {
        for (const warehouse of warehouses) {
          await tx.stockBalance.create({
            data: {
              merchantId,
              warehouseId: warehouse.id,
              variantId: variant.id,
              quantityOnHand: 0,
              quantityAllocated: 0,
              quantityAvailable: 0,
            },
          });
        }
      }

      // 4.4 Transactional Outbox Event
      await tx.outboxEvent.create({
        data: {
          eventType: 'PRODUCT_CREATED',
          aggregateType: 'Product',
          aggregateId: p.id,
          status: OutboxStatus.PENDING as any,
          payload: {
            productId: p.id,
            code: p.code,
            name: p.name,
            variantCount: createdVariants.length,
          },
        },
      });

      // 4.5 Audit Log
      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.CREATE as any,
          entityType: 'Product',
          entityId: p.id,
          newValues: { code: p.code, name: p.name },
        },
      });

      return p;
    });

    this.logger.log(`Created product ${product.code} for merchant ${merchantId}`);
    return this.getProductById(merchantId, product.id);
  }

  async updateProduct(
    merchantId: string,
    id: string,
    dto: UpdateProductDto,
    actorId: string,
  ) {
    const product = await this.db.product.findFirst({ where: { id, merchantId } });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found.`);
    }

    const updated = await this.db.$transaction(async (tx) => {
      const p = await tx.product.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.brandId !== undefined ? { brandId: dto.brandId } : {}),
          ...(dto.taxProfileId !== undefined ? { taxProfileId: dto.taxProfileId } : {}),
          ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
          ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'Product',
          entityId: p.id,
          newValues: { name: p.name, isActive: p.isActive },
        },
      });

      return p;
    });

    return this.getProductById(merchantId, updated.id);
  }

  async addVariant(
    merchantId: string,
    productId: string,
    dto: CreateVariantItemDto,
    actorId: string,
  ) {
    const product = await this.db.product.findFirst({
      where: { id: productId, merchantId },
    });
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found.`);
    }

    const existingSku = await this.db.productVariant.findUnique({
      where: {
        merchantId_sku: {
          merchantId,
          sku: dto.sku.trim().toUpperCase(),
        },
      },
    });
    if (existingSku) {
      throw new ConflictException(`Variant SKU ${dto.sku} already exists.`);
    }

    const warehouses = await this.db.warehouse.findMany({
      where: { merchantId, isActive: true },
      select: { id: true },
    });

    const variant = await this.db.$transaction(async (tx) => {
      const v = await tx.productVariant.create({
        data: {
          productId,
          merchantId,
          sku: dto.sku.trim().toUpperCase(),
          barcode: dto.barcode?.trim(),
          variantName: dto.variantName.trim(),
          attributeValues: dto.attributeValues,
          costPrice: dto.costPrice,
          sellingPrice: dto.sellingPrice,
          minSellingPrice: dto.minSellingPrice,
          discountPercentage: dto.discountPercentage ?? 0,
          discountAmount: dto.discountAmount ?? 0,
          reorderPoint: dto.reorderPoint ?? 10,
          isActive: true,
        },
      });

      // Update product hasVariants flag if adding multiple
      if (!product.hasVariants) {
        await tx.product.update({
          where: { id: productId },
          data: { hasVariants: true },
        });
      }

      // Initialize StockBalances
      for (const warehouse of warehouses) {
        await tx.stockBalance.create({
          data: {
            merchantId,
            warehouseId: warehouse.id,
            variantId: v.id,
            quantityOnHand: 0,
            quantityAllocated: 0,
            quantityAvailable: 0,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.CREATE as any,
          entityType: 'ProductVariant',
          entityId: v.id,
          newValues: { sku: v.sku, variantName: v.variantName },
        },
      });

      return v;
    });

    return variant;
  }

  async updateVariant(
    merchantId: string,
    variantId: string,
    dto: UpdateVariantDto,
    actorId: string,
  ) {
    const variant = await this.db.productVariant.findFirst({
      where: { id: variantId, merchantId },
    });
    if (!variant) {
      throw new NotFoundException(`Variant ${variantId} not found.`);
    }

    const updated = await this.db.$transaction(async (tx) => {
      const v = await tx.productVariant.update({
        where: { id: variantId },
        data: {
          ...(dto.variantName ? { variantName: dto.variantName.trim() } : {}),
          ...(dto.barcode !== undefined ? { barcode: dto.barcode?.trim() } : {}),
          ...(dto.costPrice !== undefined ? { costPrice: dto.costPrice } : {}),
          ...(dto.sellingPrice !== undefined ? { sellingPrice: dto.sellingPrice } : {}),
          ...(dto.minSellingPrice !== undefined ? { minSellingPrice: dto.minSellingPrice } : {}),
          ...(dto.discountPercentage !== undefined ? { discountPercentage: dto.discountPercentage } : {}),
          ...(dto.discountAmount !== undefined ? { discountAmount: dto.discountAmount } : {}),
          ...(dto.reorderPoint !== undefined ? { reorderPoint: dto.reorderPoint } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'ProductVariant',
          entityId: v.id,
          newValues: { sellingPrice: v.sellingPrice, barcode: v.barcode },
        },
      });

      return v;
    });

    return updated;
  }

  // Optimized Catalog Snapshot for POS Offline Cache (IndexedDB)
  async getCatalogSnapshot(merchantId: string) {
    const [categories, taxProfiles, products] = await Promise.all([
      this.db.category.findMany({
        where: { merchantId, isActive: true },
        select: { id: true, code: true, name: true, parentId: true },
      }),
      this.db.taxProfile.findMany({
        where: { merchantId, isActive: true },
        select: { id: true, code: true, name: true, ratePercentage: true, isInclusive: true },
      }),
      this.db.product.findMany({
        where: { merchantId, isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          unit: true,
          categoryId: true,
          taxProfileId: true,
          variants: {
            where: { isActive: true },
            select: {
              id: true,
              sku: true,
              barcode: true,
              variantName: true,
              attributeValues: true,
              costPrice: true,
              sellingPrice: true,
              minSellingPrice: true,
              discountPercentage: true,
              discountAmount: true,
              batches: {
                where: { isActive: true, quantityOnHand: { gt: 0 } },
                select: {
                  id: true,
                  batchNumber: true,
                  costPrice: true,
                  sellingPrice: true,
                  quantityOnHand: true,
                  manufacturingDate: true,
                  expiryDate: true,
                  receivedDate: true,
                },
                orderBy: [
                  { expiryDate: 'asc' },
                  { receivedDate: 'asc' },
                ],
              },
            },
          },
        },
      }),
    ]);

    return {
      syncedAt: new Date().toISOString(),
      categories,
      taxProfiles,
      products,
    };
  }
}
