import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { SubmitMerchantSlipDto } from '../dto/billing.dto';
import { PaymentGateway, PaymentVerificationStatus, InvoiceStatus } from '@/common/types';

@Injectable()
export class MerchantBillingService {
  private readonly logger = new Logger(MerchantBillingService.name);

  constructor(private db: DatabaseService) {}

  async getBillingOverview(merchantId: string) {
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
      throw new NotFoundException('Merchant organization not found.');
    }

    const latestSubscription = merchant.subscriptions[0] || null;
    const plan = latestSubscription?.plan || null;

    // Real-time counts for quota evaluation
    const [branchesCount, warehousesCount, usersCount, posTerminalsCount, productsCount] =
      await Promise.all([
        this.db.branch.count({ where: { merchantId } }),
        this.db.warehouse.count({ where: { merchantId } }),
        this.db.merchantUser.count({ where: { merchantId, isActive: true } }),
        this.db.posTerminal.count({ where: { merchantId } }),
        this.db.product.count({ where: { merchantId, isActive: true } }),
      ]);

    // Fetch invoices with verification history
    const invoices = await this.db.subscriptionInvoice.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        verifications: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Fetch active plans available for upgrade
    const availablePlans = await this.db.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    });

    // Calculate remaining days
    const now = new Date();
    let daysRemaining = 0;
    if (latestSubscription) {
      const targetDate =
        latestSubscription.status === 'TRIALING' && latestSubscription.trialEndsAt
          ? new Date(latestSubscription.trialEndsAt)
          : new Date(latestSubscription.endDate);
      const diffMs = targetDate.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    const maxBranches = plan?.maxBranches ?? 1;
    const maxWarehouses = plan?.maxWarehouses ?? 1;
    const maxUsers = plan?.maxUsers ?? 1;
    const maxProducts = plan?.maxProducts ?? 500;
    const maxTerminals = maxBranches * 3;

    return {
      merchant: {
        id: merchant.id,
        code: merchant.code,
        businessName: merchant.businessName,
        tradeName: merchant.tradeName,
        currency: merchant.currency,
        status: merchant.status,
      },
      subscription: latestSubscription
        ? {
            id: latestSubscription.id,
            status: latestSubscription.status,
            billingCycle: latestSubscription.billingCycle,
            startDate: latestSubscription.startDate,
            endDate: latestSubscription.endDate,
            trialEndsAt: latestSubscription.trialEndsAt,
            daysRemaining,
            plan: plan
              ? {
                  id: plan.id,
                  name: plan.name,
                  code: plan.code,
                  tier: plan.tier,
                  description: plan.description,
                  priceMonthly: Number(plan.priceMonthly),
                  priceQuarterly: Number(plan.priceQuarterly),
                  priceAnnually: Number(plan.priceAnnually),
                  hasOfflinePos: plan.hasOfflinePos,
                  hasAdvancedAccounting: plan.hasAdvancedAccounting,
                }
              : null,
          }
        : null,
      quotas: {
        branches: {
          current: branchesCount,
          max: maxBranches,
          percentage: Math.min(100, Math.round((branchesCount / maxBranches) * 100)),
        },
        warehouses: {
          current: warehousesCount,
          max: maxWarehouses,
          percentage: Math.min(100, Math.round((warehousesCount / maxWarehouses) * 100)),
        },
        users: {
          current: usersCount,
          max: maxUsers,
          percentage: Math.min(100, Math.round((usersCount / maxUsers) * 100)),
        },
        posTerminals: {
          current: posTerminalsCount,
          max: maxTerminals,
          percentage: Math.min(100, Math.round((posTerminalsCount / maxTerminals) * 100)),
        },
        products: {
          current: productsCount,
          max: maxProducts,
          percentage: Math.min(100, Math.round((productsCount / maxProducts) * 100)),
        },
      },
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: Number(inv.amount),
        currency: inv.currency,
        status: inv.status,
        dueDate: inv.dueDate,
        paidAt: inv.paidAt,
        createdAt: inv.createdAt,
        verifications: inv.verifications.map((v) => ({
          id: v.id,
          gateway: v.gateway,
          transactionReference: v.transactionReference,
          bankSlipUrl: v.bankSlipUrl,
          amountSubmitted: Number(v.amountSubmitted),
          status: v.status,
          notes: v.notes,
          createdAt: v.createdAt,
          reviewedAt: v.reviewedAt,
        })),
      })),
      availablePlans: availablePlans.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        tier: p.tier,
        description: p.description,
        priceMonthly: Number(p.priceMonthly),
        priceQuarterly: Number(p.priceQuarterly),
        priceAnnually: Number(p.priceAnnually),
        maxBranches: p.maxBranches,
        maxWarehouses: p.maxWarehouses,
        maxUsers: p.maxUsers,
        maxProducts: p.maxProducts,
        hasOfflinePos: p.hasOfflinePos,
        hasAdvancedAccounting: p.hasAdvancedAccounting,
      })),
      bankTransferInstructions: {
        bankName: 'Commercial Bank of Ceylon PLC',
        accountName: 'RetailCloud Technologies (Pvt) Ltd',
        accountNumber: '1000 2345 6789',
        branch: 'Colombo City Office (Branch Code 001)',
        swiftCode: 'CCEYLKLX',
        whatsappSupport: '+94 77 123 4567',
        supportEmail: 'billing@retailcloudpos.lk',
      },
    };
  }

  async submitDepositSlip(merchantId: string, dto: SubmitMerchantSlipDto) {
    const invoice = await this.db.subscriptionInvoice.findFirst({
      where: { id: dto.invoiceId, merchantId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${dto.invoiceId} not found for this merchant.`);
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('This invoice has already been settled and marked PAID.');
    }

    const verification = await this.db.platformPaymentVerification.create({
      data: {
        invoiceId: invoice.id,
        merchantId,
        gateway: PaymentGateway.MANUAL_BANK_TRANSFER as any,
        transactionReference: dto.transactionReference,
        bankSlipUrl: dto.bankSlipUrl,
        amountSubmitted: dto.amountSubmitted,
        status: PaymentVerificationStatus.PENDING_VERIFICATION as any,
        notes: dto.notes,
      },
    });

    this.logger.log(
      `Deposit slip submitted by merchant ${merchantId} for invoice ${invoice.invoiceNumber}`,
    );

    return verification;
  }
}
