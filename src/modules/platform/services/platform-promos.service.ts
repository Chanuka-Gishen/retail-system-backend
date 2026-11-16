import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreatePromoCodeDto,
  UpdatePromoCodeDto,
  ListPromosQueryDto,
} from '../dto/platform-promos.dto';
import {
  PromoDiscountType,
  AuditAction,
  MerchantStatus,
  BillingCycle,
} from '@/common/types';

@Injectable()
export class PlatformPromosService {
  private readonly logger = new Logger(PlatformPromosService.name);

  constructor(private db: DatabaseService) {}

  /**
   * List promo codes with aggregate metrics
   */
  async listPromos(query: ListPromosQueryDto) {
    const { search, discountType, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { affiliatePartnerName: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (discountType) {
      where.discountType = discountType;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [total, promoCodes] = await Promise.all([
      this.db.platformPromoCode.count({ where }),
      this.db.platformPromoCode.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          redemptions: {
            select: {
              id: true,
              discountAmount: true,
              invoiceAmountAfterDiscount: true,
              commissionEarned: true,
              merchant: {
                select: {
                  id: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const items = promoCodes.map((promo) => {
      let totalDiscountGiven = 0;
      let totalRealizedRevenue = 0;
      let totalCommissionEarned = 0;
      let activeMerchantsAcquired = 0;

      promo.redemptions.forEach((redemption) => {
        totalDiscountGiven += Number(redemption.discountAmount || 0);
        totalRealizedRevenue += Number(redemption.invoiceAmountAfterDiscount || 0);
        totalCommissionEarned += Number(redemption.commissionEarned || 0);
        if (redemption.merchant?.status === MerchantStatus.ACTIVE) {
          activeMerchantsAcquired += 1;
        }
      });

      const isExpired = promo.validUntil ? new Date() > promo.validUntil : false;
      const isExhausted = promo.maxUses ? promo.usedCount >= promo.maxUses : false;

      return {
        id: promo.id,
        code: promo.code,
        description: promo.description,
        discountType: promo.discountType,
        discountValue: Number(promo.discountValue),
        maxUses: promo.maxUses,
        usedCount: promo.usedCount,
        validFrom: promo.validFrom,
        validUntil: promo.validUntil,
        isActive: promo.isActive,
        isExpired,
        isExhausted,
        affiliatePartnerName: promo.affiliatePartnerName,
        commissionRatePercent: promo.commissionRatePercent
          ? Number(promo.commissionRatePercent)
          : null,
        createdAt: promo.createdAt,
        updatedAt: promo.updatedAt,
        stats: {
          totalRedemptions: promo.usedCount,
          activeMerchantsAcquired,
          totalDiscountGiven,
          totalRealizedRevenue,
          totalCommissionEarned,
        },
      };
    });

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Top-level summary statistics across all promo codes and acquired merchants
   */
  async getPromoSummaryStats() {
    const now = new Date();

    const [totalPromos, activePromos, redemptions] = await Promise.all([
      this.db.platformPromoCode.count(),
      this.db.platformPromoCode.count({
        where: {
          isActive: true,
          OR: [{ validUntil: null }, { validUntil: { gte: now } }],
        },
      }),
      this.db.platformPromoRedemption.findMany({
        include: {
          merchant: {
            select: {
              id: true,
              status: true,
              subscriptions: {
                where: { status: 'ACTIVE' },
                take: 1,
                include: {
                  plan: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const distinctMerchantIds = new Set<string>();
    let totalDiscountsGranted = 0;
    let totalRealizedRevenue = 0;
    let totalCommissionsEarned = 0;
    let estimatedMonthlyGains = 0;

    for (const r of redemptions) {
      distinctMerchantIds.add(r.merchantId);
      totalDiscountsGranted += Number(r.discountAmount || 0);
      totalRealizedRevenue += Number(r.invoiceAmountAfterDiscount || 0);
      totalCommissionsEarned += Number(r.commissionEarned || 0);

      // If the acquired merchant has an active subscription, add to monthly run-rate (MRR)
      const activeSub = r.merchant?.subscriptions?.[0];
      if (r.merchant?.status === MerchantStatus.ACTIVE && activeSub?.plan) {
        const plan = activeSub.plan;
        if (activeSub.billingCycle === BillingCycle.MONTHLY) {
          estimatedMonthlyGains += Number(plan.priceMonthly || 0);
        } else if (activeSub.billingCycle === BillingCycle.QUARTERLY) {
          estimatedMonthlyGains += Number(plan.priceQuarterly || 0) / 3;
        } else if (activeSub.billingCycle === BillingCycle.ANNUALLY) {
          estimatedMonthlyGains += Number(plan.priceAnnually || 0) / 12;
        }
      }
    }

    return {
      totalPromos,
      activePromos,
      totalRedemptions: redemptions.length,
      totalMerchantsAcquired: distinctMerchantIds.size,
      totalDiscountsGranted: Math.round(totalDiscountsGranted * 100) / 100,
      totalRealizedRevenue: Math.round(totalRealizedRevenue * 100) / 100,
      estimatedMonthlyGains: Math.round(estimatedMonthlyGains * 100) / 100,
      totalCommissionsEarned: Math.round(totalCommissionsEarned * 100) / 100,
    };
  }

  /**
   * Get single promo code by ID with redemptions overview
   */
  async getPromoById(id: string) {
    const promo = await this.db.platformPromoCode.findUnique({
      where: { id },
      include: {
        redemptions: {
          orderBy: { redeemedAt: 'desc' },
          take: 50,
          include: {
            merchant: {
              select: {
                id: true,
                code: true,
                businessName: true,
                contactEmail: true,
                contactPhone: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!promo) {
      throw new NotFoundException(`Promo code with ID ${id} was not found.`);
    }

    let totalDiscountGiven = 0;
    let totalRealizedRevenue = 0;
    let totalCommissionEarned = 0;

    promo.redemptions.forEach((r) => {
      totalDiscountGiven += Number(r.discountAmount || 0);
      totalRealizedRevenue += Number(r.invoiceAmountAfterDiscount || 0);
      totalCommissionEarned += Number(r.commissionEarned || 0);
    });

    return {
      ...promo,
      discountValue: Number(promo.discountValue),
      commissionRatePercent: promo.commissionRatePercent
        ? Number(promo.commissionRatePercent)
        : null,
      stats: {
        totalRedemptions: promo.usedCount,
        totalDiscountGiven,
        totalRealizedRevenue,
        totalCommissionEarned,
      },
    };
  }

  /**
   * Get all merchants who redeemed a promo code with customer tracking info
   */
  async getPromoRedemptions(promoId: string, page = 1, limit = 20) {
    const promo = await this.db.platformPromoCode.findUnique({
      where: { id: promoId },
      select: { id: true, code: true, description: true },
    });

    if (!promo) {
      throw new NotFoundException(`Promo code with ID ${promoId} was not found.`);
    }

    const skip = (page - 1) * limit;

    const [total, redemptions] = await Promise.all([
      this.db.platformPromoRedemption.count({ where: { promoCodeId: promoId } }),
      this.db.platformPromoRedemption.findMany({
        where: { promoCodeId: promoId },
        skip,
        take: limit,
        orderBy: { redeemedAt: 'desc' },
        include: {
          merchant: {
            select: {
              id: true,
              code: true,
              businessName: true,
              tradeName: true,
              contactEmail: true,
              contactPhone: true,
              status: true,
              createdAt: true,
              subscriptions: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                include: {
                  plan: {
                    select: {
                      id: true,
                      code: true,
                      name: true,
                      tier: true,
                      priceMonthly: true,
                    },
                  },
                },
              },
              subscriptionInvoices: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                select: {
                  id: true,
                  invoiceNumber: true,
                  status: true,
                  amount: true,
                  currency: true,
                  paidAt: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const formattedRedemptions = redemptions.map((r) => {
      const activeSubscription = r.merchant?.subscriptions?.[0];
      const initialInvoice = r.merchant?.subscriptionInvoices?.[0];

      return {
        id: r.id,
        redeemedAt: r.redeemedAt,
        discountAmount: Number(r.discountAmount),
        invoiceAmountBeforeDiscount: Number(r.invoiceAmountBeforeDiscount),
        invoiceAmountAfterDiscount: Number(r.invoiceAmountAfterDiscount),
        extraTrialDaysApplied: r.extraTrialDaysApplied,
        commissionEarned: r.commissionEarned ? Number(r.commissionEarned) : 0,
        merchant: {
          id: r.merchant.id,
          code: r.merchant.code,
          businessName: r.merchant.businessName,
          tradeName: r.merchant.tradeName,
          contactEmail: r.merchant.contactEmail,
          contactPhone: r.merchant.contactPhone,
          status: r.merchant.status,
          joinedAt: r.merchant.createdAt,
        },
        plan: activeSubscription?.plan
          ? {
              code: activeSubscription.plan.code,
              name: activeSubscription.plan.name,
              tier: activeSubscription.plan.tier,
              billingCycle: activeSubscription.billingCycle,
              status: activeSubscription.status,
            }
          : null,
        invoice: initialInvoice
          ? {
              invoiceNumber: initialInvoice.invoiceNumber,
              status: initialInvoice.status,
              amount: Number(initialInvoice.amount),
              currency: initialInvoice.currency,
              paidAt: initialInvoice.paidAt,
            }
          : null,
      };
    });

    return {
      promoCode: promo,
      data: formattedRedemptions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Create a new platform promo code
   */
  async createPromo(dto: CreatePromoCodeDto, adminUserId: string) {
    const code = dto.code.trim().toUpperCase();

    // Check unique code
    const existing = await this.db.platformPromoCode.findUnique({
      where: { code },
    });
    if (existing) {
      throw new ConflictException(`Promo code '${code}' already exists.`);
    }

    if (dto.discountType === PromoDiscountType.PERCENTAGE && dto.discountValue > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100%.');
    }

    if (dto.validFrom && dto.validUntil) {
      if (new Date(dto.validUntil) <= new Date(dto.validFrom)) {
        throw new BadRequestException('validUntil date must be strictly after validFrom date.');
      }
    }

    const created = await this.db.platformPromoCode.create({
      data: {
        code,
        description: dto.description?.trim(),
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        maxUses: dto.maxUses,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        affiliatePartnerName: dto.affiliatePartnerName?.trim(),
        commissionRatePercent: dto.commissionRatePercent,
      },
    });

    // Record audit log
    await this.db.auditLog.create({
      data: {
        actorId: adminUserId,
        actorType: 'PLATFORM_USER',
        action: AuditAction.CREATE as any,
        entityType: 'PlatformPromoCode',
        entityId: created.id,
        newValues: created,
      },
    });

    this.logger.log(`Promo code '${created.code}' created by platform user ${adminUserId}`);
    return created;
  }

  /**
   * Update existing promo code
   */
  async updatePromo(id: string, dto: UpdatePromoCodeDto, adminUserId: string) {
    const existing = await this.db.platformPromoCode.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Promo code with ID ${id} was not found.`);
    }

    if (dto.code && dto.code.trim().toUpperCase() !== existing.code) {
      const codeCheck = await this.db.platformPromoCode.findUnique({
        where: { code: dto.code.trim().toUpperCase() },
      });
      if (codeCheck) {
        throw new ConflictException(`Promo code '${dto.code}' already exists.`);
      }
    }

    const discountType = dto.discountType || existing.discountType;
    const discountValue =
      dto.discountValue !== undefined ? dto.discountValue : Number(existing.discountValue);

    if (discountType === PromoDiscountType.PERCENTAGE && discountValue > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100%.');
    }

    const validFrom = dto.validFrom ? new Date(dto.validFrom) : existing.validFrom;
    const validUntil =
      dto.validUntil !== undefined
        ? dto.validUntil
          ? new Date(dto.validUntil)
          : null
        : existing.validUntil;

    if (validFrom && validUntil && validUntil <= validFrom) {
      throw new BadRequestException('validUntil date must be strictly after validFrom date.');
    }

    const updated = await this.db.platformPromoCode.update({
      where: { id },
      data: {
        code: dto.code ? dto.code.trim().toUpperCase() : undefined,
        description: dto.description !== undefined ? dto.description?.trim() : undefined,
        discountType: dto.discountType,
        discountValue: dto.discountValue !== undefined ? dto.discountValue : undefined,
        maxUses: dto.maxUses !== undefined ? dto.maxUses : undefined,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil !== undefined ? (dto.validUntil ? new Date(dto.validUntil) : null) : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
        affiliatePartnerName:
          dto.affiliatePartnerName !== undefined ? dto.affiliatePartnerName?.trim() : undefined,
        commissionRatePercent:
          dto.commissionRatePercent !== undefined ? dto.commissionRatePercent : undefined,
      },
    });

    await this.db.auditLog.create({
      data: {
        actorId: adminUserId,
        actorType: 'PLATFORM_USER',
        action: AuditAction.UPDATE as any,
        entityType: 'PlatformPromoCode',
        entityId: id,
        oldValues: existing,
        newValues: updated,
      },
    });

    return updated;
  }

  /**
   * Toggle promo active/inactive status
   */
  async togglePromoStatus(id: string, adminUserId: string) {
    const existing = await this.db.platformPromoCode.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Promo code with ID ${id} was not found.`);
    }

    const updated = await this.db.platformPromoCode.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });

    await this.db.auditLog.create({
      data: {
        actorId: adminUserId,
        actorType: 'PLATFORM_USER',
        action: AuditAction.UPDATE as any,
        entityType: 'PlatformPromoCode',
        entityId: id,
        newValues: { isActive: updated.isActive },
      },
    });

    return updated;
  }

  /**
   * Delete promo code (only if zero redemptions have occurred)
   */
  async deletePromo(id: string, adminUserId: string) {
    const existing = await this.db.platformPromoCode.findUnique({
      where: { id },
      include: {
        _count: {
          select: { redemptions: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Promo code with ID ${id} was not found.`);
    }

    if (existing._count.redemptions > 0 || existing.usedCount > 0) {
      throw new BadRequestException(
        `Cannot delete promo code '${existing.code}' because it has ${existing.usedCount} existing redemptions. Please deactivate it instead to preserve financial records.`,
      );
    }

    await this.db.platformPromoCode.delete({
      where: { id },
    });

    await this.db.auditLog.create({
      data: {
        actorId: adminUserId,
        actorType: 'PLATFORM_USER',
        action: AuditAction.DELETE as any,
        entityType: 'PlatformPromoCode',
        entityId: id,
        oldValues: existing,
      },
    });

    return { success: true, message: `Promo code '${existing.code}' successfully deleted.` };
  }
}
