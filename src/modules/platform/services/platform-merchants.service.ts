import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';
import {
  ListMerchantsQueryDto,
  SuspendMerchantDto,
  AdminCreateMerchantDto,
  AdminUpdateMerchantDto,
  AdminCreateBranchDto,
  AdminUpdateBranchDto,
  UpdateMerchantSubscriptionDto,
  AdminRenewBankTransferDto,
  GrantGracePeriodDto,
} from '../dto/platform-merchants.dto';
import {
  MerchantStatus,
  MerchantUserRole,
  SubscriptionStatus,
  InvoiceStatus,
  OutboxStatus,
  AuditAction,
  BillingCycle,
  PaymentGateway,
  PaymentVerificationStatus,
} from '@/common/types';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../../accounting/default-coa';

@Injectable()
export class PlatformMerchantsService {
  private readonly logger = new Logger(PlatformMerchantsService.name);

  constructor(
    private db: DatabaseService,
    private redis: RedisService,
  ) {}

  private generateMerchantCode(): string {
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `MCH-${randomHex}`;
  }

  private generateInvoiceNumber(merchantCode: string): string {
    const timestamp = Date.now().toString().slice(-6);
    return `INV-${merchantCode}-${timestamp}`;
  }

  async listMerchants(query: ListMerchantsQueryDto) {
    const { status, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, merchants] = await Promise.all([
      this.db.merchant.count({ where }),
      this.db.merchant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { plan: true },
          },
          users: {
            where: { isOwner: true },
            take: 1,
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          _count: {
            select: {
              branches: true,
              warehouses: true,
              users: true,
            },
          },
        },
      }),
    ]);

    const items = merchants.map((m) => {
      const activeSub = m.subscriptions[0];
      const owner = m.users[0];
      return {
        id: m.id,
        code: m.code,
        businessName: m.businessName,
        tradeName: m.tradeName,
        taxNumber: m.taxNumber,
        contactEmail: m.contactEmail,
        contactPhone: m.contactPhone,
        status: m.status,
        currency: m.currency,
        timezone: m.timezone,
        createdAt: m.createdAt,
        approvedAt: m.approvedAt,
        plan: activeSub
          ? {
              id: activeSub.plan.id,
              name: activeSub.plan.name,
              tier: activeSub.plan.tier,
              status: activeSub.status,
              billingCycle: activeSub.billingCycle,
            }
          : null,
        owner: owner ? { email: owner.email, name: `${owner.firstName} ${owner.lastName}` } : null,
        counts: {
          branches: m._count.branches,
          warehouses: m._count.warehouses,
          users: m._count.users,
        },
      };
    });

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getMerchantById(id: string) {
    const merchant = await this.db.merchant.findUnique({
      where: { id },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          include: { plan: true },
        },
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            isActive: true,
            isOwner: true,
            lastLoginAt: true,
            createdAt: true,
            branchAccess: {
              include: {
                branch: {
                  select: { id: true, code: true, name: true },
                },
              },
            },
          },
          orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }],
        },
        branches: {
          include: {
            defaultWarehouse: {
              select: { id: true, code: true, name: true },
            },
            _count: {
              select: { posTerminals: true, sales: true },
            },
          },
          orderBy: [{ isMain: 'desc' }, { code: 'asc' }],
        },
        warehouses: {
          select: { id: true, code: true, name: true, isMain: true, isActive: true },
        },
        subscriptionInvoices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            subscription: {
              select: {
                plan: {
                  select: { name: true, code: true },
                },
              },
            },
          },
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found.`);
    }

    return merchant;
  }

  async createMerchant(dto: AdminCreateMerchantDto, adminUserId: string) {
    const contactEmail = dto.contactEmail.toLowerCase().trim();
    const ownerEmail = (dto.ownerEmail || dto.contactEmail).toLowerCase().trim();

    // 1. Uniqueness check
    const existingMerchant = await this.db.merchant.findFirst({
      where: { contactEmail },
    });
    if (existingMerchant) {
      throw new ConflictException('A merchant with this contact email already exists.');
    }

    const existingUser = await this.db.merchantUser.findFirst({
      where: { email: ownerEmail },
    });
    if (existingUser) {
      throw new ConflictException('A user account with this owner email already exists.');
    }

    // 2. Validate Subscription Plan
    const plan = await this.db.subscriptionPlan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Selected subscription plan is invalid or inactive.');
    }

    // 3. Billing cycle & duration
    const billingCycle = dto.billingCycle || BillingCycle.MONTHLY;
    let invoiceAmount = plan.priceMonthly;
    let durationDays = 30;

    if (billingCycle === BillingCycle.QUARTERLY) {
      invoiceAmount = plan.priceQuarterly;
      durationDays = 90;
    } else if (billingCycle === BillingCycle.ANNUALLY) {
      invoiceAmount = plan.priceAnnually;
      durationDays = 365;
    }

    // 4. Hash Owner Password
    const passwordHash = await bcrypt.hash(dto.ownerPassword, 10);
    const merchantCode = this.generateMerchantCode();
    const invoiceNumber = this.generateInvoiceNumber(merchantCode);

    const now = new Date();
    const subscriptionEndDate = new Date(now.getTime() + durationDays * 24 * 3600 * 1000);
    const merchantStatus = dto.status || MerchantStatus.ACTIVE;

    return this.db.$transaction(async (tx) => {
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
          status: merchantStatus as any,
          approvedAt: merchantStatus === MerchantStatus.ACTIVE ? now : null,
          approvedById: merchantStatus === MerchantStatus.ACTIVE ? adminUserId : null,
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

      // 5.3 Create Default Main Branch / Shop
      const branch = await tx.branch.create({
        data: {
          merchantId: merchant.id,
          code: dto.branchCode?.trim() || 'BR-001',
          name: dto.branchName?.trim() || 'Head Office & Main Store',
          address: dto.branchAddress?.trim(),
          phone: dto.branchPhone?.trim() || dto.contactPhone.trim(),
          defaultWarehouseId: warehouse.id,
          isMain: true,
          isActive: true,
        },
      });

      // 5.4 Create Merchant Owner User
      const owner = await tx.merchantUser.create({
        data: {
          merchantId: merchant.id,
          email: ownerEmail,
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
          billingCycle: billingCycle as any,
          status: SubscriptionStatus.ACTIVE as any,
          startDate: now,
          endDate: subscriptionEndDate,
        },
      });

      // 5.7 Create Subscription Invoice
      await tx.subscriptionInvoice.create({
        data: {
          merchantId: merchant.id,
          subscriptionId: subscription.id,
          invoiceNumber,
          amount: invoiceAmount,
          currency: merchant.currency,
          status: InvoiceStatus.PAID as any,
          paidAt: now,
          dueDate: now,
        },
      });

      // 5.8 Initialize Standard Chart of Accounts
      for (const acc of DEFAULT_CHART_OF_ACCOUNTS) {
        await tx.chartOfAccounts.create({
          data: {
            merchantId: merchant.id,
            accountCode: acc.accountCode,
            accountName: acc.accountName,
            category: acc.category as any,
            isSystemAccount: acc.isSystemAccount,
          },
        });
      }

      // 5.9 Audit Log
      await tx.auditLog.create({
        data: {
          merchantId: merchant.id,
          actorId: adminUserId,
          actorType: 'PLATFORM_USER',
          action: AuditAction.CREATE as any,
          entityType: 'Merchant',
          entityId: merchant.id,
          newValues: {
            code: merchant.code,
            businessName: merchant.businessName,
            status: merchant.status,
            ownerEmail,
            branchCode: branch.code,
          },
        },
      });

      return {
        ...merchant,
        branch,
        warehouse,
        owner: {
          id: owner.id,
          email: owner.email,
          name: `${owner.firstName} ${owner.lastName}`,
        },
        subscription: {
          id: subscription.id,
          planName: plan.name,
          status: subscription.status,
        },
      };
    });
  }

  async updateMerchant(id: string, dto: AdminUpdateMerchantDto, adminUserId: string) {
    const merchant = await this.db.merchant.findUnique({
      where: { id },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        users: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found.`);
    }

    if (dto.contactEmail && dto.contactEmail.toLowerCase().trim() !== merchant.contactEmail) {
      const existing = await this.db.merchant.findFirst({
        where: { contactEmail: dto.contactEmail.toLowerCase().trim(), id: { not: id } },
      });
      if (existing) {
        throw new ConflictException('Another merchant is already registered with this contact email.');
      }
    }

    return this.db.$transaction(async (tx) => {
      // 1. Update Merchant entity
      const updated = await tx.merchant.update({
        where: { id },
        data: {
          ...(dto.businessName && { businessName: dto.businessName.trim() }),
          ...(dto.tradeName !== undefined && { tradeName: dto.tradeName?.trim() || null }),
          ...(dto.taxNumber !== undefined && { taxNumber: dto.taxNumber?.trim() || null }),
          ...(dto.contactEmail && { contactEmail: dto.contactEmail.toLowerCase().trim() }),
          ...(dto.contactPhone && { contactPhone: dto.contactPhone.trim() }),
          ...(dto.currency && { currency: dto.currency.trim() }),
          ...(dto.timezone && { timezone: dto.timezone.trim() }),
          ...(dto.status && { status: dto.status as any }),
        },
      });

      // 2. If planId, billingCycle, or subscriptionStatus is provided, update or create subscription
      if (dto.planId || dto.billingCycle || dto.subscriptionStatus) {
        if (dto.planId) {
          const plan = await tx.subscriptionPlan.findUnique({
            where: { id: dto.planId },
          });
          if (!plan) {
            throw new NotFoundException('Subscription plan not found.');
          }
        }

        const currentSub = merchant.subscriptions[0];
        if (currentSub) {
          const newCycle = dto.billingCycle || currentSub.billingCycle;
          let newEndDate = currentSub.endDate;
          if (dto.billingCycle && dto.billingCycle !== currentSub.billingCycle) {
            const durationDays =
              newCycle === BillingCycle.ANNUALLY
                ? 365
                : newCycle === BillingCycle.QUARTERLY
                ? 90
                : 30;
            newEndDate = new Date(Date.now() + durationDays * 24 * 3600 * 1000);
          }

          const newStatus = dto.subscriptionStatus || currentSub.status;
          const cancelledAt =
            newStatus === SubscriptionStatus.CANCELLED
              ? currentSub.cancelledAt || new Date()
              : null;

          await tx.merchantSubscription.update({
            where: { id: currentSub.id },
            data: {
              ...(dto.planId && { planId: dto.planId }),
              ...(dto.billingCycle && { billingCycle: dto.billingCycle as any }),
              ...(dto.subscriptionStatus && { status: dto.subscriptionStatus as any }),
              endDate: newEndDate,
              cancelledAt,
            },
          });
        } else {
          const now = new Date();
          const cycle = dto.billingCycle || BillingCycle.MONTHLY;
          const durationDays =
            cycle === BillingCycle.ANNUALLY ? 365 : cycle === BillingCycle.QUARTERLY ? 90 : 30;
          const targetPlanId =
            dto.planId || (await tx.subscriptionPlan.findFirst({ where: { isActive: true } }))?.id;

          if (targetPlanId) {
            await tx.merchantSubscription.create({
              data: {
                merchantId: id,
                planId: targetPlanId,
                billingCycle: cycle as any,
                status: (dto.subscriptionStatus || SubscriptionStatus.ACTIVE) as any,
                startDate: now,
                endDate: new Date(now.getTime() + durationDays * 24 * 3600 * 1000),
              },
            });
          }
        }
      }

      // 3. If suspended, revoke active user sessions
      if (dto.status === MerchantStatus.SUSPENDED) {
        for (const u of merchant.users) {
          await this.redis.revokeAllUserSessions(u.id);
        }
      }

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          merchantId: id,
          actorId: adminUserId,
          actorType: 'PLATFORM_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'Merchant',
          entityId: id,
          newValues: dto as any,
        },
      });

      return updated;
    });
  }

  async updateMerchantSubscription(
    merchantId: string,
    dto: UpdateMerchantSubscriptionDto,
    adminUserId: string,
  ) {
    const merchant = await this.db.merchant.findUnique({
      where: { id: merchantId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${merchantId} not found.`);
    }

    let plan: any = null;
    if (dto.planId) {
      plan = await this.db.subscriptionPlan.findUnique({
        where: { id: dto.planId },
      });
      if (!plan) {
        throw new NotFoundException('Subscription plan not found.');
      }
    }

    const currentSub = merchant.subscriptions[0];
    const targetPlanId = dto.planId || currentSub?.planId;
    if (!targetPlanId) {
      throw new BadRequestException('A subscription plan must be specified.');
    }

    if (!plan) {
      plan = await this.db.subscriptionPlan.findUnique({
        where: { id: targetPlanId },
      });
    }

    const targetBillingCycle = dto.billingCycle || currentSub?.billingCycle || BillingCycle.MONTHLY;
    const targetStatus = dto.status || currentSub?.status || SubscriptionStatus.ACTIVE;

    let targetEndDate: Date;
    if (dto.endDate) {
      targetEndDate = new Date(dto.endDate);
    } else if (dto.billingCycle && (!currentSub || dto.billingCycle !== currentSub.billingCycle)) {
      const durationDays =
        targetBillingCycle === BillingCycle.ANNUALLY
          ? 365
          : targetBillingCycle === BillingCycle.QUARTERLY
          ? 90
          : 30;
      targetEndDate = new Date(Date.now() + durationDays * 24 * 3600 * 1000);
    } else if (currentSub) {
      targetEndDate = currentSub.endDate;
    } else {
      targetEndDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    }

    return this.db.$transaction(async (tx) => {
      let updatedSub: any;
      if (currentSub) {
        const cancelledAt =
          targetStatus === SubscriptionStatus.CANCELLED
            ? currentSub.cancelledAt || new Date()
            : null;

        updatedSub = await tx.merchantSubscription.update({
          where: { id: currentSub.id },
          data: {
            planId: targetPlanId,
            billingCycle: targetBillingCycle as any,
            status: targetStatus as any,
            endDate: targetEndDate,
            cancelledAt,
          },
          include: { plan: true },
        });
      } else {
        const now = new Date();
        updatedSub = await tx.merchantSubscription.create({
          data: {
            merchantId,
            planId: targetPlanId,
            billingCycle: targetBillingCycle as any,
            status: targetStatus as any,
            startDate: now,
            endDate: targetEndDate,
          },
          include: { plan: true },
        });
      }

      // Generate Invoice if requested
      if (dto.generateInvoice && plan) {
        let invoiceAmount = plan.priceMonthly;
        if (targetBillingCycle === BillingCycle.QUARTERLY) {
          invoiceAmount = plan.priceQuarterly;
        } else if (targetBillingCycle === BillingCycle.ANNUALLY) {
          invoiceAmount = plan.priceAnnually;
        }

        const invoiceNumber = this.generateInvoiceNumber(merchant.code);
        await tx.subscriptionInvoice.create({
          data: {
            merchantId,
            subscriptionId: updatedSub.id,
            invoiceNumber,
            amount: invoiceAmount,
            currency: merchant.currency || 'LKR',
            status: InvoiceStatus.ISSUED as any,
            dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000), // Due in 7 days
          },
        });
      }

      // Audit Log
      await tx.auditLog.create({
        data: {
          merchantId,
          actorId: adminUserId,
          actorType: 'PLATFORM_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'MerchantSubscription',
          entityId: updatedSub.id,
          newValues: {
            planId: targetPlanId,
            planName: plan?.name,
            billingCycle: targetBillingCycle,
            status: targetStatus,
            endDate: targetEndDate,
            generateInvoice: dto.generateInvoice,
          } as any,
        },
      });

      return updatedSub;
    });
  }

  async renewSubscriptionViaBankTransfer(
    merchantId: string,
    dto: AdminRenewBankTransferDto,
    adminUserId: string,
  ) {
    const merchant = await this.db.merchant.findUnique({
      where: { id: merchantId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${merchantId} not found.`);
    }

    const currentSub = merchant.subscriptions[0];
    const targetPlanId = dto.planId || currentSub?.planId;
    if (!targetPlanId) {
      throw new BadRequestException('A subscription plan must be specified.');
    }

    const plan = await this.db.subscriptionPlan.findUnique({
      where: { id: targetPlanId },
    });
    if (!plan) {
      throw new NotFoundException('Subscription plan not found.');
    }

    const targetBillingCycle = dto.billingCycle || BillingCycle.MONTHLY;
    const durationDays =
      targetBillingCycle === BillingCycle.ANNUALLY
        ? 365
        : targetBillingCycle === BillingCycle.QUARTERLY
        ? 90
        : 30;

    const now = new Date();
    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : now;

    // Calculate renewal dates
    let newStartDate: Date;
    let newEndDate: Date;

    if (currentSub && currentSub.endDate > now && currentSub.status === SubscriptionStatus.ACTIVE) {
      // Smooth renewal starting from current expiration date
      newStartDate = currentSub.startDate;
      newEndDate = new Date(currentSub.endDate.getTime() + durationDays * 24 * 3600 * 1000);
    } else {
      // Starting fresh or extending expired subscription
      newStartDate = paymentDate;
      newEndDate = new Date(paymentDate.getTime() + durationDays * 24 * 3600 * 1000);
    }

    return this.db.$transaction(async (tx) => {
      // 1. Update or create subscription
      let sub: any;
      if (currentSub) {
        sub = await tx.merchantSubscription.update({
          where: { id: currentSub.id },
          data: {
            planId: targetPlanId,
            billingCycle: targetBillingCycle as any,
            status: SubscriptionStatus.ACTIVE as any,
            startDate: newStartDate,
            endDate: newEndDate,
            cancelledAt: null,
          },
          include: { plan: true },
        });
      } else {
        sub = await tx.merchantSubscription.create({
          data: {
            merchantId,
            planId: targetPlanId,
            billingCycle: targetBillingCycle as any,
            status: SubscriptionStatus.ACTIVE as any,
            startDate: newStartDate,
            endDate: newEndDate,
          },
          include: { plan: true },
        });
      }

      // Ensure merchant account is ACTIVE so staff can log in
      if (merchant.status !== MerchantStatus.ACTIVE) {
        await tx.merchant.update({
          where: { id: merchantId },
          data: { status: MerchantStatus.ACTIVE as any },
        });
      }

      // 2. Generate and mark PAID Invoice
      const invoiceNumber = this.generateInvoiceNumber(merchant.code);
      const invoice = await tx.subscriptionInvoice.create({
        data: {
          merchantId,
          subscriptionId: sub.id,
          invoiceNumber,
          amount: dto.amountPaid,
          currency: merchant.currency || 'LKR',
          status: InvoiceStatus.PAID as any,
          dueDate: paymentDate,
          paidAt: paymentDate,
        },
      });

      // 3. Create verified platform payment verification record
      let verifiedAdminId: string | null = null;
      if (adminUserId) {
        const adminUser = await tx.platformUser.findUnique({
          where: { id: adminUserId },
          select: { id: true },
        });
        if (adminUser) {
          verifiedAdminId = adminUser.id;
        }
      }

      const notesFormatted = `[Bank Transfer: ${dto.bankName || 'Direct Deposit'}] Ref: ${
        dto.transferReference
      }. ${dto.notes || 'Verified by admin via WhatsApp slip'}`;

      const verification = await tx.platformPaymentVerification.create({
        data: {
          invoiceId: invoice.id,
          merchantId,
          gateway: PaymentGateway.MANUAL_BANK_TRANSFER as any,
          transactionReference: dto.transferReference.trim(),
          bankSlipUrl: dto.bankSlipUrl?.trim() || null,
          amountSubmitted: dto.amountPaid,
          status: PaymentVerificationStatus.VERIFIED as any,
          notes: notesFormatted,
          reviewedById: verifiedAdminId,
          reviewedAt: now,
        },
      });

      // 4. Outbox event for payment verification
      await tx.outboxEvent.create({
        data: {
          eventType: 'SUBSCRIPTION_PAYMENT_VERIFIED',
          aggregateType: 'SubscriptionInvoice',
          aggregateId: invoice.id,
          status: OutboxStatus.PENDING as any,
          payload: {
            verificationId: verification.id,
            invoiceNumber: invoice.invoiceNumber,
            merchantId,
            merchantCode: merchant.code,
            amount: dto.amountPaid,
            newEndDate,
          },
        },
      });

      // 5. Audit log
      await tx.auditLog.create({
        data: {
          merchantId,
          actorId: adminUserId,
          actorType: 'PLATFORM_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'MerchantSubscription',
          entityId: sub.id,
          newValues: {
            action: 'RENEW_BANK_TRANSFER',
            planId: targetPlanId,
            planName: plan.name,
            billingCycle: targetBillingCycle,
            amountPaid: dto.amountPaid,
            transferReference: dto.transferReference,
            bankName: dto.bankName,
            startDate: newStartDate,
            endDate: newEndDate,
            invoiceNumber: invoice.invoiceNumber,
          } as any,
        },
      });

      return {
        subscription: sub,
        invoice,
        verification,
      };
    });
  }

  async grantGracePeriod(
    merchantId: string,
    dto: GrantGracePeriodDto,
    adminUserId: string,
  ) {
    const merchant = await this.db.merchant.findUnique({
      where: { id: merchantId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${merchantId} not found.`);
    }

    const currentSub = merchant.subscriptions[0];
    if (!currentSub) {
      throw new BadRequestException('Merchant has no subscription to extend grace period.');
    }

    const days = dto.days || 7;
    const now = new Date();

    // If current sub end date is in the future, add to it; otherwise add 7 days from now
    const baseDate = currentSub.endDate > now ? currentSub.endDate : now;
    const newEndDate = new Date(baseDate.getTime() + days * 24 * 3600 * 1000);

    return this.db.$transaction(async (tx) => {
      const updatedSub = await tx.merchantSubscription.update({
        where: { id: currentSub.id },
        data: {
          status: SubscriptionStatus.ACTIVE as any,
          endDate: newEndDate,
          cancelledAt: null,
        },
        include: { plan: true },
      });

      // Ensure merchant account is ACTIVE so users can log in
      if (merchant.status !== MerchantStatus.ACTIVE) {
        await tx.merchant.update({
          where: { id: merchantId },
          data: { status: MerchantStatus.ACTIVE as any },
        });
      }

      // Audit Log
      await tx.auditLog.create({
        data: {
          merchantId,
          actorId: adminUserId,
          actorType: 'PLATFORM_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'MerchantSubscription',
          entityId: currentSub.id,
          newValues: {
            action: 'GRANT_GRACE_PERIOD',
            daysGranted: days,
            reason: dto.reason || 'Admin granted 1-week grace period',
            previousEndDate: currentSub.endDate,
            newEndDate,
          } as any,
        },
      });

      return updatedSub;
    });
  }

  async approveMerchant(id: string, adminUserId: string) {
    const merchant = await this.db.merchant.findUnique({
      where: { id },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found.`);
    }

    if (merchant.status === MerchantStatus.ACTIVE) {
      throw new BadRequestException('Merchant is already approved and active.');
    }

    const updated = await this.db.$transaction(async (tx) => {
      const m = await tx.merchant.update({
        where: { id },
        data: {
          status: MerchantStatus.ACTIVE as any,
          approvedAt: new Date(),
          approvedById: adminUserId,
          suspendedReason: null,
        },
      });

      // Activate active subscription if in trialing or pending
      const activeSub = merchant.subscriptions[0];
      if (activeSub) {
        await tx.merchantSubscription.update({
          where: { id: activeSub.id },
          data: { status: SubscriptionStatus.ACTIVE as any },
        });
      }

      // Outbox event
      await tx.outboxEvent.create({
        data: {
          eventType: 'MERCHANT_APPROVED',
          aggregateType: 'Merchant',
          aggregateId: m.id,
          status: OutboxStatus.PENDING as any,
          payload: {
            merchantId: m.id,
            code: m.code,
            businessName: m.businessName,
            approvedById: adminUserId,
          },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          merchantId: m.id,
          actorId: adminUserId,
          actorType: 'PLATFORM_USER',
          action: AuditAction.APPROVE as any,
          entityType: 'Merchant',
          entityId: m.id,
          newValues: { status: 'ACTIVE' },
        },
      });

      return m;
    });

    this.logger.log(`Merchant approved: ${updated.businessName} (${updated.code}) by admin ${adminUserId}`);
    return updated;
  }

  async suspendMerchant(id: string, dto: SuspendMerchantDto, adminUserId: string) {
    const merchant = await this.db.merchant.findUnique({
      where: { id },
      include: { users: true },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found.`);
    }

    if (merchant.status === MerchantStatus.SUSPENDED) {
      throw new BadRequestException('Merchant is already suspended.');
    }

    const updated = await this.db.$transaction(async (tx) => {
      const m = await tx.merchant.update({
        where: { id },
        data: {
          status: MerchantStatus.SUSPENDED as any,
          suspendedReason: dto.reason,
        },
      });

      // Outbox event
      await tx.outboxEvent.create({
        data: {
          eventType: 'MERCHANT_SUSPENDED',
          aggregateType: 'Merchant',
          aggregateId: m.id,
          status: OutboxStatus.PENDING as any,
          payload: {
            merchantId: m.id,
            reason: dto.reason,
            suspendedById: adminUserId,
          },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          merchantId: m.id,
          actorId: adminUserId,
          actorType: 'PLATFORM_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'Merchant',
          entityId: m.id,
          newValues: { status: 'SUSPENDED', reason: dto.reason },
        },
      });

      return m;
    });

    // Invalidate all active Redis sessions for every user in this merchant tenant
    for (const u of merchant.users) {
      await this.redis.revokeAllUserSessions(u.id);
    }

    this.logger.warn(`Merchant suspended: ${merchant.businessName} (${merchant.code}). Active sessions revoked.`);
    return updated;
  }

  async reactivateMerchant(id: string, adminUserId: string) {
    const merchant = await this.db.merchant.findUnique({ where: { id } });
    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found.`);
    }

    const updated = await this.db.$transaction(async (tx) => {
      const m = await tx.merchant.update({
        where: { id },
        data: {
          status: MerchantStatus.ACTIVE as any,
          suspendedReason: null,
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId: m.id,
          actorId: adminUserId,
          actorType: 'PLATFORM_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'Merchant',
          entityId: m.id,
          newValues: { status: 'ACTIVE' },
        },
      });

      return m;
    });

    return updated;
  }

  // --- BRANCHES / SHOPS MANAGEMENT ---

  async listMerchantBranches(merchantId: string) {
    const merchant = await this.db.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${merchantId} not found.`);
    }

    return this.db.branch.findMany({
      where: { merchantId },
      include: {
        defaultWarehouse: {
          select: { id: true, code: true, name: true },
        },
        _count: {
          select: {
            posTerminals: true,
            sales: true,
            userAccess: true,
          },
        },
      },
      orderBy: [{ isMain: 'desc' }, { code: 'asc' }],
    });
  }

  async createMerchantBranch(merchantId: string, dto: AdminCreateBranchDto, adminUserId: string) {
    const merchant = await this.db.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${merchantId} not found.`);
    }

    const code = dto.code.trim().toUpperCase();
    const existing = await this.db.branch.findFirst({
      where: { merchantId, code },
    });
    if (existing) {
      throw new ConflictException(`A branch/shop with code "${code}" already exists for this merchant.`);
    }

    let defaultWarehouseId = dto.defaultWarehouseId;
    if (!defaultWarehouseId) {
      const mainWarehouse = await this.db.warehouse.findFirst({
        where: { merchantId, isMain: true },
      });
      defaultWarehouseId = mainWarehouse?.id;
    }

    return this.db.$transaction(async (tx) => {
      // If marking as main, reset other branches
      if (dto.isMain) {
        await tx.branch.updateMany({
          where: { merchantId },
          data: { isMain: false },
        });
      }

      const branch = await tx.branch.create({
        data: {
          merchantId,
          code,
          name: dto.name.trim(),
          address: dto.address?.trim(),
          phone: dto.phone?.trim(),
          isMain: dto.isMain ?? false,
          isActive: dto.isActive ?? true,
          defaultWarehouseId,
        },
        include: {
          defaultWarehouse: { select: { id: true, code: true, name: true } },
          _count: { select: { posTerminals: true, sales: true } },
        },
      });

      // Automatically grant branch access to merchant owner(s)
      const owners = await tx.merchantUser.findMany({
        where: { merchantId, isOwner: true },
      });
      for (const owner of owners) {
        await tx.merchantUserBranchAccess.upsert({
          where: {
            merchantUserId_branchId: {
              merchantUserId: owner.id,
              branchId: branch.id,
            },
          },
          update: {},
          create: {
            merchantUserId: owner.id,
            branchId: branch.id,
          },
        });
      }

      // Audit Log
      await tx.auditLog.create({
        data: {
          merchantId,
          actorId: adminUserId,
          actorType: 'PLATFORM_USER',
          action: AuditAction.CREATE as any,
          entityType: 'Branch',
          entityId: branch.id,
          newValues: { code: branch.code, name: branch.name, isMain: branch.isMain },
        },
      });

      return branch;
    });
  }

  async updateMerchantBranch(
    merchantId: string,
    branchId: string,
    dto: AdminUpdateBranchDto,
    adminUserId: string,
  ) {
    const branch = await this.db.branch.findFirst({
      where: { id: branchId, merchantId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${branchId} not found for this merchant.`);
    }

    if (dto.code && dto.code.trim().toUpperCase() !== branch.code) {
      const code = dto.code.trim().toUpperCase();
      const existing = await this.db.branch.findFirst({
        where: { merchantId, code, id: { not: branchId } },
      });
      if (existing) {
        throw new ConflictException(`Another branch with code "${code}" already exists for this merchant.`);
      }
    }

    return this.db.$transaction(async (tx) => {
      if (dto.isMain) {
        await tx.branch.updateMany({
          where: { merchantId, id: { not: branchId } },
          data: { isMain: false },
        });
      }

      const updated = await tx.branch.update({
        where: { id: branchId },
        data: {
          ...(dto.code && { code: dto.code.trim().toUpperCase() }),
          ...(dto.name && { name: dto.name.trim() }),
          ...(dto.address !== undefined && { address: dto.address?.trim() || null }),
          ...(dto.phone !== undefined && { phone: dto.phone?.trim() || null }),
          ...(dto.isMain !== undefined && { isMain: dto.isMain }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.defaultWarehouseId !== undefined && { defaultWarehouseId: dto.defaultWarehouseId }),
        },
        include: {
          defaultWarehouse: { select: { id: true, code: true, name: true } },
          _count: { select: { posTerminals: true, sales: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          actorId: adminUserId,
          actorType: 'PLATFORM_USER',
          action: AuditAction.UPDATE as any,
          entityType: 'Branch',
          entityId: branchId,
          newValues: dto as any,
        },
      });

      return updated;
    });
  }
}
