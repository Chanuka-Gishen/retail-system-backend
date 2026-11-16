import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateBrandDto, UpdateBrandDto } from '../dto/brand.dto';
import { AuditAction } from '@/common/types';

@Injectable()
export class BrandService {
  private readonly logger = new Logger(BrandService.name);

  constructor(private db: DatabaseService) {}

  async listBrands(merchantId: string) {
    return this.db.brand.findMany({
      where: { merchantId },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
  }

  async createBrand(merchantId: string, dto: CreateBrandDto, actorId: string) {
    const existing = await this.db.brand.findUnique({
      where: {
        merchantId_code: {
          merchantId,
          code: dto.code.trim().toUpperCase(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Brand with code ${dto.code} already exists.`);
    }

    const brand = await this.db.$transaction(async (tx) => {
      const b = await tx.brand.create({
        data: {
          merchantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.CREATE as any,
          entityType: 'Brand',
          entityId: b.id,
          newValues: { code: b.code, name: b.name },
        },
      });

      return b;
    });

    this.logger.log(`Created brand ${brand.name} (${brand.code}) for merchant ${merchantId}`);
    return brand;
  }

  async updateBrand(
    merchantId: string,
    id: string,
    dto: UpdateBrandDto,
    actorId: string,
  ) {
    const brand = await this.db.brand.findFirst({ where: { id, merchantId } });
    if (!brand) {
      throw new NotFoundException(`Brand ${id} not found.`);
    }

    const updated = await this.db.$transaction(async (tx) => {
      const b = await tx.brand.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'Brand',
          entityId: b.id,
          newValues: { name: b.name, isActive: b.isActive },
        },
      });

      return b;
    });

    return updated;
  }
}
