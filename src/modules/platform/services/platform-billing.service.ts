import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import {
  SubmitBankSlipDto,
  ReviewPaymentVerificationDto,
  RejectPaymentVerificationDto,
  PayHereIpnDto,
} from '../dto/platform-billing.dto';
import {
  PaymentVerificationStatus,
  InvoiceStatus,
  PaymentGateway,
  SubscriptionStatus,
  OutboxStatus,
  AuditAction,
} from '@/common/types';

@Injectable()
export class PlatformBillingService {
  private readonly logger = new Logger(PlatformBillingService.name);
  private readonly payhereSecret: string;
  private readonly payhereMerchantId: string;

  constructor(
    private db: DatabaseService,
    private config: ConfigService,
  ) {
    this.payhereSecret = this.config.get<string>('PAYHERE_MERCHANT_SECRET', 'sandbox_merchant_secret');
    this.payhereMerchantId = this.config.get<string>('PAYHERE_MERCHANT_ID', 'sandbox_merchant_id');
  }

  // Merchant submits manual bank deposit slip
  async submitBankSlip(dto: SubmitBankSlipDto) {
    const invoice = await this.db.subscriptionInvoice.findUnique({
      where: { id: dto.invoiceId },
      include: { merchant: true },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${dto.invoiceId} not found.`);
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('This invoice is already paid.');
    }

    const verification = await this.db.platformPaymentVerification.create({
      data: {
        invoiceId: invoice.id,
        merchantId: invoice.merchantId,
        gateway: PaymentGateway.MANUAL_BANK_TRANSFER as any,
        transactionReference: dto.transactionReference,
        bankSlipUrl: dto.bankSlipUrl,
        amountSubmitted: dto.amountSubmitted,
        status: PaymentVerificationStatus.PENDING_VERIFICATION as any,
        notes: dto.notes,
      },
      include: {
        merchant: {
          select: { code: true, businessName: true },
        },
      },
    });

    this.logger.log(
      `Bank slip submitted for invoice ${invoice.invoiceNumber} by merchant ${invoice.merchant.code}`,
    );

    return verification;
  }

  // Admin lists verification requests
  async listVerifications(query: {
    status?: PaymentVerificationStatus;
    page?: number;
    limit?: number;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }

    const [total, verifications] = await Promise.all([
      this.db.platformPaymentVerification.count({ where }),
      this.db.platformPaymentVerification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          merchant: {
            select: { id: true, code: true, businessName: true, contactEmail: true },
          },
          invoice: {
            select: { id: true, invoiceNumber: true, amount: true, currency: true, status: true },
          },
          reviewedBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
    ]);

    return {
      items: verifications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  // Admin approves manual bank slip
  async approveVerification(
    id: string,
    adminUserId: string,
    dto: ReviewPaymentVerificationDto,
  ) {
    const verification = await this.db.platformPaymentVerification.findUnique({
      where: { id },
      include: {
        invoice: {
          include: { subscription: true },
        },
        merchant: true,
      },
    });

    if (!verification) {
      throw new NotFoundException(`Verification record ${id} not found.`);
    }

    if (verification.status === PaymentVerificationStatus.VERIFIED) {
      throw new BadRequestException('Payment verification is already approved.');
    }

    const updated = await this.db.$transaction(async (tx) => {
      // 1. Mark verification approved
      const v = await tx.platformPaymentVerification.update({
        where: { id },
        data: {
          status: PaymentVerificationStatus.VERIFIED as any,
          reviewedById: adminUserId,
          reviewedAt: new Date(),
          notes: dto.notes || verification.notes,
        },
      });

      // 2. Mark invoice PAID
      await tx.subscriptionInvoice.update({
        where: { id: verification.invoiceId },
        data: {
          status: InvoiceStatus.PAID as any,
          paidAt: new Date(),
        },
      });

      // 3. Activate / Extend subscription
      await tx.merchantSubscription.update({
        where: { id: verification.invoice.subscriptionId },
        data: {
          status: SubscriptionStatus.ACTIVE as any,
        },
      });

      // 4. Outbox event
      await tx.outboxEvent.create({
        data: {
          eventType: 'SUBSCRIPTION_PAYMENT_VERIFIED',
          aggregateType: 'SubscriptionInvoice',
          aggregateId: verification.invoiceId,
          status: OutboxStatus.PENDING as any,
          payload: {
            verificationId: v.id,
            invoiceNumber: verification.invoice.invoiceNumber,
            merchantId: verification.merchantId,
            merchantCode: verification.merchant.code,
            amount: Number(verification.amountSubmitted),
          },
        },
      });

      // 5. Audit log
      await tx.auditLog.create({
        data: {
          merchantId: verification.merchantId,
          actorId: adminUserId,
          actorType: 'PLATFORM_USER',
          action: AuditAction.APPROVE as any,
          entityType: 'PlatformPaymentVerification',
          entityId: v.id,
          newValues: { status: 'VERIFIED', invoiceId: verification.invoiceId },
        },
      });

      return v;
    });

    this.logger.log(`Payment verification approved for invoice ${verification.invoice.invoiceNumber}`);
    return updated;
  }

  // Admin rejects manual bank slip
  async rejectVerification(
    id: string,
    adminUserId: string,
    dto: RejectPaymentVerificationDto,
  ) {
    const verification = await this.db.platformPaymentVerification.findUnique({
      where: { id },
    });

    if (!verification) {
      throw new NotFoundException(`Verification record ${id} not found.`);
    }

    const updated = await this.db.platformPaymentVerification.update({
      where: { id },
      data: {
        status: PaymentVerificationStatus.REJECTED as any,
        reviewedById: adminUserId,
        reviewedAt: new Date(),
        notes: dto.reason,
      },
    });

    this.logger.warn(`Payment verification rejected for verification ID: ${id}`);
    return updated;
  }

  // PayHere Payment Gateway IPN Webhook
  async handlePayHereIpn(ipnDto: PayHereIpnDto) {
    const {
      merchant_id,
      order_id,
      payhere_amount,
      payhere_currency,
      status_code,
      md5sig,
    } = ipnDto;

    if (
      this.payhereMerchantId !== 'sandbox_merchant_id' &&
      merchant_id !== this.payhereMerchantId
    ) {
      this.logger.warn(
        `PayHere merchant_id mismatch: received ${merchant_id}, expected ${this.payhereMerchantId}`,
      );
    }
    // Format: strtoupper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + strtoupper(md5(merchant_secret))))
    const secretHash = crypto
      .createHash('md5')
      .update(this.payhereSecret)
      .digest('hex')
      .toUpperCase();

    const expectedHash = crypto
      .createHash('md5')
      .update(
        `${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${secretHash}`,
      )
      .digest('hex')
      .toUpperCase();

    if (md5sig.toUpperCase() !== expectedHash) {
      this.logger.error(`PayHere IPN checksum mismatch for order_id: ${order_id}`);
      throw new BadRequestException('Invalid checksum signature');
    }

    // Status 2 = Success in PayHere
    if (status_code === '2') {
      const invoice = await this.db.subscriptionInvoice.findUnique({
        where: { invoiceNumber: order_id },
        include: { subscription: true },
      });

      if (!invoice) {
        this.logger.error(`Invoice not found for PayHere order_id: ${order_id}`);
        return { status: 'INVOICE_NOT_FOUND' };
      }

      await this.db.$transaction(async (tx) => {
        await tx.subscriptionInvoice.update({
          where: { id: invoice.id },
          data: {
            status: InvoiceStatus.PAID as any,
            paidAt: new Date(),
          },
        });

        await tx.merchantSubscription.update({
          where: { id: invoice.subscriptionId },
          data: {
            status: SubscriptionStatus.ACTIVE as any,
          },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: 'PAYHERE_PAYMENT_SUCCESS',
            aggregateType: 'SubscriptionInvoice',
            aggregateId: invoice.id,
            status: OutboxStatus.PENDING as any,
            payload: {
              invoiceNumber: invoice.invoiceNumber,
              merchantId: invoice.merchantId,
              amount: payhere_amount,
              paymentId: ipnDto.payment_id,
            },
          },
        });
      });

      this.logger.log(`PayHere payment verified successfully for invoice: ${order_id}`);
    }

    return { status: 'OK' };
  }
}
