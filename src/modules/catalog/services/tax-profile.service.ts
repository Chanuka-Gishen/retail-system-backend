import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateTaxProfileDto, UpdateTaxProfileDto } from '../dto/tax-profile.dto';
import { AuditAction } from '@/common/types';

@Injectable()
export class TaxProfileService {
  private readonly logger = new Logger(TaxProfileService.name);

  constructor(private db: DatabaseService) {}

  async listTaxProfiles(merchantId: string) {
    return this.db.taxProfile.findMany({
      where: { merchantId },
      orderBy: { ratePercentage: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
  }

  async createTaxProfile(merchantId: string, dto: CreateTaxProfileDto, actorId: string) {
    const existing = await this.db.taxProfile.findUnique({
      where: {
        merchantId_code: {
          merchantId,
          code: dto.code.trim().toUpperCase(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Tax profile with code ${dto.code} already exists.`);
    }

    const taxProfile = await this.db.$transaction(async (tx) => {
      const tp = await tx.taxProfile.create({
        data: {
          merchantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          ratePercentage: dto.ratePercentage,
          isInclusive: dto.isInclusive ?? false,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.CREATE as any,
          entityType: 'TaxProfile',
          entityId: tp.id,
          newValues: { code: tp.code, ratePercentage: tp.ratePercentage },
        },
      });

      return tp;
    });

    this.logger.log(`Created tax profile ${taxProfile.name} (${taxProfile.code}) for merchant ${merchantId}`);
    return taxProfile;
  }

  async updateTaxProfile(
    merchantId: string,
    id: string,
    dto: UpdateTaxProfileDto,
    actorId: string,
  ) {
    const taxProfile = await this.db.taxProfile.findFirst({ where: { id, merchantId } });
    if (!taxProfile) {
      throw new NotFoundException(`Tax profile ${id} not found.`);
    }

    const updated = await this.db.$transaction(async (tx) => {
      const tp = await tx.taxProfile.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.ratePercentage !== undefined ? { ratePercentage: dto.ratePercentage } : {}),
          ...(dto.isInclusive !== undefined ? { isInclusive: dto.isInclusive } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId,
          actorType: 'MERCHANT_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'TaxProfile',
          entityId: tp.id,
          newValues: { ratePercentage: tp.ratePercentage, isActive: tp.isActive },
        },
      });

      return tp;
    });

    return updated;
  }
}
