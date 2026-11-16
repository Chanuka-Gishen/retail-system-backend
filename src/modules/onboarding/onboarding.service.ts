import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../accounting/default-coa';
import {
  MerchantStatus,
  MerchantUserRole,
  SubscriptionStatus,
  InvoiceStatus,
  OutboxStatus,
  AuditAction,
  BillingCycle,
  PromoDiscountType,
} from '@/common/types';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private db: DatabaseService) {}

  private generateMerchantCode(): string {
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `MCH-${randomHex}`;
  }

  private generateInvoiceNumber(merchantCode: string): string {
    const timestamp = Date.now().toString().slice(-6);
    return `INV-${merchantCode}-${timestamp}`;
  }

  async register(dto: RegisterMerchantDto, clientIp?: string, userAgent?: string) {
    const contactEmail = dto.contactEmail.toLowerCase().trim();

    // 1. Uniqueness check
    const existingMerchant = await this.db.merchant.findFirst({
      where: { contactEmail },
    });
    if (existingMerchant) {
      throw new ConflictException('A merchant with this contact email already exists.');
    }

    const existingUser = await this.db.merchantUser.findFirst({
      where: { email: contactEmail },
    });
    if (existingUser) {
      throw new ConflictException('A user account with this email already exists.');
    }

    // 2. Validate Subscription Plan
    const plan = await this.db.subscriptionPlan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Selected subscription plan is invalid or inactive.');
    }

    // 3. Determine pricing and duration based on Billing Cycle
    let invoiceAmount = Number(plan.priceMonthly);
    let durationDays = 30;

    if (dto.billingCycle === BillingCycle.QUARTERLY) {
      invoiceAmount = Number(plan.priceQuarterly);
      durationDays = 90;
    } else if (dto.billingCycle === BillingCycle.ANNUALLY) {
      invoiceAmount = Number(plan.priceAnnually);
      durationDays = 365;
    }

    const baseInvoiceAmount = invoiceAmount;
    let discountAmount = 0;
    let extraTrialDays = 0;
    let appliedPromo: any = null;

    if (dto.promoCode && dto.promoCode.trim()) {
      const cleanCode = dto.promoCode.trim().toUpperCase();
      const promo = await this.db.platformPromoCode.findUnique({
        where: { code: cleanCode },
      });

      if (!promo) {
        throw new NotFoundException(`Promo code '${cleanCode}' is invalid.`);
      }

      if (!promo.isActive) {
        throw new BadRequestException(`Promo code '${cleanCode}' is inactive.`);
      }

      const nowCheck = new Date();
      if (promo.validFrom && nowCheck < promo.validFrom) {
        throw new BadRequestException(`Promo code '${cleanCode}' is not active yet.`);
      }

      if (promo.validUntil && nowCheck > promo.validUntil) {
        throw new BadRequestException(`Promo code '${cleanCode}' has expired.`);
      }

      if (promo.maxUses !== null && promo.maxUses !== undefined && promo.usedCount >= promo.maxUses) {
        throw new BadRequestException(
          `Promo code '${cleanCode}' has reached its maximum redemption limit.`,
        );
      }

      if (promo.discountType === PromoDiscountType.PERCENTAGE) {
        discountAmount = Math.round(baseInvoiceAmount * (Number(promo.discountValue) / 100) * 100) / 100;
      } else if (promo.discountType === PromoDiscountType.FIXED_AMOUNT) {
        discountAmount = Math.min(baseInvoiceAmount, Number(promo.discountValue));
      } else if (promo.discountType === PromoDiscountType.EXTRA_TRIAL_DAYS) {
        discountAmount = 0;
        extraTrialDays = Number(promo.discountValue);
      }

      appliedPromo = promo;
    }

    const finalInvoiceAmount = Math.max(0, baseInvoiceAmount - discountAmount);

    let commissionEarned = 0;
    if (appliedPromo && appliedPromo.commissionRatePercent) {
      commissionEarned =
        Math.round(((finalInvoiceAmount * Number(appliedPromo.commissionRatePercent)) / 100) * 100) /
        100;
    }

    // 4. Hash Owner Password
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const merchantCode = this.generateMerchantCode();
    const invoiceNumber = this.generateInvoiceNumber(merchantCode);

    const now = new Date();
    const totalTrialDays = 14 + extraTrialDays;
    const trialEndsAt = new Date(now.getTime() + totalTrialDays * 24 * 3600 * 1000);
    const subscriptionEndDate = new Date(now.getTime() + durationDays * 24 * 3600 * 1000);
    const invoiceDueDate = new Date(now.getTime() + totalTrialDays * 24 * 3600 * 1000);

    // 5. Execute Atomic Database Transaction
    const result = await this.db.$transaction(async (tx) => {
      // 5.1 Create Merchant
      const merchant = await tx.merchant.create({
        data: {
          code: merchantCode,
          businessName: dto.businessName.trim(),
          tradeName: dto.tradeName?.trim() || dto.businessName.trim(),
          taxNumber: dto.taxNumber?.trim(),
          contactEmail,
          contactPhone: dto.contactPhone.trim(),
          currency: dto.currency || 'LKR',
          timezone: dto.timezone || 'Asia/Colombo',
          status: MerchantStatus.PENDING_APPROVAL as any,
        },
      });

      // 5.2 Create Default Main Warehouse
      const warehouse = await tx.warehouse.create({
        data: {
          merchantId: merchant.id,
          code: 'WH-001',
          name: 'Central Warehouse',
          isMain: true,
          isActive: true,
        },
      });

      // 5.3 Create Default Main Branch
      const branch = await tx.branch.create({
        data: {
          merchantId: merchant.id,
          code: 'BR-001',
          name: 'Head Office & Main Store',
          defaultWarehouseId: warehouse.id,
          isMain: true,
          isActive: true,
        },
      });

      // 5.4 Create Merchant Owner User
      const owner = await tx.merchantUser.create({
        data: {
          merchantId: merchant.id,
          email: contactEmail,
          passwordHash,
          firstName: dto.ownerFirstName.trim(),
          lastName: dto.ownerLastName.trim(),
          phone: dto.contactPhone.trim(),
          role: MerchantUserRole.MERCHANT_OWNER as any,
          isOwner: true,
          isActive: true,
        },
      });

      // 5.5 Assign Owner Branch & Warehouse Scopes
      await tx.merchantUserBranchAccess.create({
        data: {
          merchantUserId: owner.id,
          branchId: branch.id,
        },
      });

      await tx.merchantUserWarehouseAccess.create({
        data: {
          merchantUserId: owner.id,
          warehouseId: warehouse.id,
        },
      });

      // 5.6 Create Merchant Subscription
      const subscription = await tx.merchantSubscription.create({
        data: {
          merchantId: merchant.id,
          planId: plan.id,
          billingCycle: dto.billingCycle as any,
          status: SubscriptionStatus.TRIALING as any,
          startDate: now,
          endDate: subscriptionEndDate,
          trialEndsAt,
        },
      });

      // 5.7 Create Initial Subscription Invoice
      const invoice = await tx.subscriptionInvoice.create({
        data: {
          merchantId: merchant.id,
          subscriptionId: subscription.id,
          invoiceNumber,
          amount: finalInvoiceAmount,
          currency: merchant.currency,
          status: (finalInvoiceAmount === 0 ? InvoiceStatus.PAID : InvoiceStatus.ISSUED) as any,
          paidAt: finalInvoiceAmount === 0 ? now : null,
          dueDate: invoiceDueDate,
        },
      });

      // 5.7.1 Record Promo Code Redemption if applied
      if (appliedPromo) {
        await tx.platformPromoRedemption.create({
          data: {
            promoCodeId: appliedPromo.id,
            merchantId: merchant.id,
            invoiceId: invoice.id,
            discountAmount,
            invoiceAmountBeforeDiscount: baseInvoiceAmount,
            invoiceAmountAfterDiscount: finalInvoiceAmount,
            extraTrialDaysApplied: extraTrialDays,
            commissionEarned,
            redeemedAt: now,
          },
        });

        await tx.platformPromoCode.update({
          where: { id: appliedPromo.id },
          data: {
            usedCount: { increment: 1 },
          },
        });
      }

      // 5.8 Initialize Standard Chart of Accounts
      const coaCreations = DEFAULT_CHART_OF_ACCOUNTS.map((acc) =>
        tx.chartOfAccounts.create({
          data: {
            merchantId: merchant.id,
            accountCode: acc.accountCode,
            accountName: acc.accountName,
            category: acc.category as any,
            isSystemAccount: acc.isSystemAccount,
            isActive: true,
          },
        }),
      );
      await Promise.all(coaCreations);

      // 5.9 Transactional Outbox Event
      await tx.outboxEvent.create({
        data: {
          eventType: 'MERCHANT_REGISTERED',
          aggregateType: 'Merchant',
          aggregateId: merchant.id,
          status: OutboxStatus.PENDING as any,
          payload: {
            merchantId: merchant.id,
            code: merchant.code,
            businessName: merchant.businessName,
            ownerEmail: owner.email,
            planCode: plan.code,
            invoiceNumber: invoice.invoiceNumber,
            invoiceAmount: Number(invoice.amount),
            promoCode: appliedPromo?.code || null,
            discountAmount,
            extraTrialDaysApplied: extraTrialDays,
          },
        },
      });

      // 5.10 Audit Log
      await tx.auditLog.create({
        data: {
          merchantId: merchant.id,
          actorId: owner.id,
          actorType: 'MERCHANT_USER',
          action: AuditAction.CREATE as any,
          entityType: 'Merchant',
          entityId: merchant.id,
          newValues: {
            code: merchant.code,
            businessName: merchant.businessName,
            planId: plan.id,
            promoCode: appliedPromo?.code || null,
          },
          ipAddress: clientIp,
          userAgent,
        },
      });

      return {
        merchant,
        branch,
        warehouse,
        owner,
        subscription,
        invoice,
        plan,
        promo: appliedPromo
          ? {
              code: appliedPromo.code,
              discountType: appliedPromo.discountType,
              discountAmount,
              extraTrialDaysApplied: extraTrialDays,
            }
          : null,
      };
    });

    this.logger.log(
      `New merchant registered: ${result.merchant.businessName} (${result.merchant.code}), Invoice: ${result.invoice.invoiceNumber}`,
    );

    return {
      merchantId: result.merchant.id,
      merchantCode: result.merchant.code,
      businessName: result.merchant.businessName,
      status: result.merchant.status,
      owner: {
        id: result.owner.id,
        email: result.owner.email,
        name: `${result.owner.firstName} ${result.owner.lastName}`,
      },
      branch: {
        id: result.branch.id,
        code: result.branch.code,
        name: result.branch.name,
      },
      warehouse: {
        id: result.warehouse.id,
        code: result.warehouse.code,
        name: result.warehouse.name,
      },
      subscription: {
        planName: result.plan.name,
        planTier: result.plan.tier,
        status: result.subscription.status,
        trialEndsAt: result.subscription.trialEndsAt,
      },
      invoice: {
        id: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
        amount: Number(result.invoice.amount),
        currency: result.invoice.currency,
        status: result.invoice.status,
        dueDate: result.invoice.dueDate,
      },
      promo: result.promo,
      message:
        'Registration successful! Your trial has started. Our team will review your account for final verification.',
    };
  }

  // Validate a promo code for merchant registration
  async validatePromoCode(code: string, planId?: string, billingCycle?: BillingCycle) {
    if (!code || !code.trim()) {
      throw new BadRequestException('Promo code is required');
    }

    const cleanCode = code.trim().toUpperCase();
    const promo = await this.db.platformPromoCode.findUnique({
      where: { code: cleanCode },
    });

    if (!promo) {
      throw new NotFoundException(`Promo code '${cleanCode}' is invalid.`);
    }

    if (!promo.isActive) {
      throw new BadRequestException(`Promo code '${cleanCode}' is inactive.`);
    }

    const now = new Date();
    if (promo.validFrom && now < promo.validFrom) {
      throw new BadRequestException(`Promo code '${cleanCode}' is not active yet.`);
    }

    if (promo.validUntil && now > promo.validUntil) {
      throw new BadRequestException(`Promo code '${cleanCode}' has expired.`);
    }

    if (promo.maxUses !== null && promo.maxUses !== undefined && promo.usedCount >= promo.maxUses) {
      throw new BadRequestException(
        `Promo code '${cleanCode}' has reached its maximum redemption limit.`,
      );
    }

    let originalPrice: number | null = null;
    let discountAmount: number | null = null;
    let finalPrice: number | null = null;
    let extraTrialDays = 0;

    if (planId) {
      const plan = await this.db.subscriptionPlan.findUnique({
        where: { id: planId },
      });

      if (plan) {
        let basePrice = Number(plan.priceMonthly);
        if (billingCycle === BillingCycle.QUARTERLY) {
          basePrice = Number(plan.priceQuarterly);
        } else if (billingCycle === BillingCycle.ANNUALLY) {
          basePrice = Number(plan.priceAnnually);
        }

        originalPrice = basePrice;

        if (promo.discountType === PromoDiscountType.PERCENTAGE) {
          discountAmount =
            Math.round(basePrice * (Number(promo.discountValue) / 100) * 100) / 100;
        } else if (promo.discountType === PromoDiscountType.FIXED_AMOUNT) {
          discountAmount = Math.min(basePrice, Number(promo.discountValue));
        } else if (promo.discountType === PromoDiscountType.EXTRA_TRIAL_DAYS) {
          discountAmount = 0;
          extraTrialDays = Number(promo.discountValue);
        }

        finalPrice = Math.max(0, basePrice - (discountAmount || 0));
      }
    } else if (promo.discountType === PromoDiscountType.EXTRA_TRIAL_DAYS) {
      extraTrialDays = Number(promo.discountValue);
    }

    return {
      valid: true,
      promoCodeId: promo.id,
      code: promo.code,
      description: promo.description,
      discountType: promo.discountType,
      discountValue: Number(promo.discountValue),
      affiliatePartnerName: promo.affiliatePartnerName,
      originalPrice,
      discountAmount,
      finalPrice,
      extraTrialDays,
    };
  }

  // Get public plans for registration page
  async getPublicPlans() {
    return this.db.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        tier: true,
        description: true,
        priceMonthly: true,
        priceQuarterly: true,
        priceAnnually: true,
        maxBranches: true,
        maxWarehouses: true,
        maxUsers: true,
        maxProducts: true,
        hasOfflinePos: true,
        hasAdvancedAccounting: true,
      },
    });
  }
}
