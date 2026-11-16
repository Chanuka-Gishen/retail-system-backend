import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';
import { AuditAction } from '@/common/types';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(private db: DatabaseService) {}

  async listCategories(merchantId: string) {
    return this.db.category.findMany({
      where: { merchantId },
      orderBy: { name: 'asc' },
      include: {
        parent: {
          select: { id: true, code: true, name: true },
        },
        children: {
          select: { id: true, code: true, name: true, isActive: true },
        },
        _count: {
          select: { products: true },
        },
      },
    });
  }

  async getCategoryById(merchantId: string, id: string) {
    const category = await this.db.category.findFirst({
      where: { id, merchantId },
      include: {
        parent: true,
        children: true,
        products: {
          take: 10,
          select: { id: true, code: true, name: true, isActive: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category ${id} not found.`);
    }

    return category;
  }

  async createCategory(merchantId: string, dto: CreateCategoryDto, actorId: string) {
    const existing = await this.db.category.findUnique({
      where: {
        merchantId_code: {
          merchantId,
          code: dto.code.trim().toUpperCase(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Category with code ${dto.code} already exists.`);
    }

    if (dto.parentId) {
      const parent = await this.db.category.findFirst({
        where: { id: dto.parentId, merchantId },
      });
      if (!parent) {
        throw new NotFoundException(`Parent category ${dto.parentId} not found.`);
      }
    }

    const category = await this.db.$transaction(async (tx) => {
      const c = await tx.category.create({
        data: {
          merchantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim(),
          parentId: dto.parentId,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.CREATE as any,
          entityType: 'Category',
          entityId: c.id,
          newValues: { code: c.code, name: c.name },
        },
      });

      return c;
    });

    this.logger.log(`Created category ${category.name} (${category.code}) for merchant ${merchantId}`);
    return category;
  }

  async updateCategory(
    merchantId: string,
    id: string,
    dto: UpdateCategoryDto,
    actorId: string,
  ) {
    const category = await this.db.category.findFirst({ where: { id, merchantId } });
    if (!category) {
      throw new NotFoundException(`Category ${id} not found.`);
    }

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent.');
      }
      const parent = await this.db.category.findFirst({
        where: { id: dto.parentId, merchantId },
      });
      if (!parent) {
        throw new NotFoundException(`Parent category ${dto.parentId} not found.`);
      }
    }

    const updated = await this.db.$transaction(async (tx) => {
      const c = await tx.category.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() } : {}),
          ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'Category',
          entityId: c.id,
          newValues: { name: c.name, isActive: c.isActive },
        },
      });

      return c;
    });

    return updated;
  }
}
