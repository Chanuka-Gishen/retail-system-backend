import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  ListCustomersQueryDto,
  AdjustLoyaltyPointsDto,
  SettleBalanceDto,
} from '../dto/customer.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CustomerService {
  constructor(private db: DatabaseService) {}

  async createCustomer(merchantId: string, dto: CreateCustomerDto) {
    const code = dto.code?.trim() || `CUST-${Date.now().toString().slice(-6)}`;

    // Verify unique code within merchant
    const existing = await this.db.customer.findUnique({
      where: {
        merchantId_code: {
          merchantId,
          code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Customer with code "${code}" already exists for this merchant.`);
    }

    return this.db.customer.create({
      data: {
        merchantId,
        code,
        name: dto.name.trim(),
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        taxNumber: dto.taxNumber?.trim() || null,
        creditLimit: dto.creditLimit ?? 0,
        outstandingBalance: 0,
        loyaltyPoints: 0,
        isActive: true,
      },
    });
  }

  async listCustomers(merchantId: string, query: ListCustomersQueryDto) {
    const { search, phone, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = {
      merchantId,
      ...(isActive !== undefined && { isActive }),
      ...(phone && { phone: { contains: phone, mode: 'insensitive' } }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.db.customer.count({ where }),
      this.db.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { sales: true, returns: true },
          },
        },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getCustomerById(merchantId: string, id: string) {
    const customer = await this.db.customer.findFirst({
      where: { id, merchantId },
      include: {
        sales: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            paidAmount: true,
            status: true,
            createdAt: true,
            branch: { select: { id: true, name: true } },
          },
        },
        returns: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            returnNumber: true,
            refundAmount: true,
            refundTender: true,
            createdAt: true,
          },
        },
        _count: {
          select: { sales: true, returns: true },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found.`);
    }

    return customer;
  }

  async updateCustomer(merchantId: string, id: string, dto: UpdateCustomerDto) {
    await this.getCustomerById(merchantId, id);

    return this.db.customer.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.email !== undefined && { email: dto.email?.trim() || null }),
        ...(dto.phone !== undefined && { phone: dto.phone?.trim() || null }),
        ...(dto.taxNumber !== undefined && { taxNumber: dto.taxNumber?.trim() || null }),
        ...(dto.creditLimit !== undefined && { creditLimit: dto.creditLimit }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async adjustLoyaltyPoints(merchantId: string, id: string, dto: AdjustLoyaltyPointsDto) {
    const customer = await this.getCustomerById(merchantId, id);

    const newPoints = customer.loyaltyPoints + dto.points;
    if (newPoints < 0) {
      throw new BadRequestException(
        `Insufficient loyalty points. Customer currently has ${customer.loyaltyPoints} points, cannot deduct ${Math.abs(dto.points)} points.`,
      );
    }

    const updated = await this.db.customer.update({
      where: { id },
      data: {
        loyaltyPoints: newPoints,
      },
    });

    return {
      customerId: updated.id,
      customerName: updated.name,
      previousPoints: customer.loyaltyPoints,
      adjustedPoints: dto.points,
      newPoints: updated.loyaltyPoints,
      reason: dto.reason,
    };
  }

  async settleBalance(merchantId: string, id: string, dto: SettleBalanceDto) {
    const customer = await this.getCustomerById(merchantId, id);
    const currentBalance = Number(customer.outstandingBalance);

    if (currentBalance <= 0) {
      throw new BadRequestException(`Customer has no outstanding balance to settle.`);
    }

    const paymentAmount = Number(dto.amount);
    const newBalance = Math.max(0, Math.round((currentBalance - paymentAmount) * 100) / 100);

    const updated = await this.db.customer.update({
      where: { id },
      data: {
        outstandingBalance: newBalance,
      },
    });

    return {
      customerId: updated.id,
      customerName: updated.name,
      previousBalance: currentBalance,
      settledAmount: paymentAmount,
      remainingBalance: newBalance,
      tenderType: dto.tenderType,
      referenceNumber: dto.referenceNumber,
      notes: dto.notes,
    };
  }

  async getCustomerStatement(merchantId: string, id: string) {
    const customer = await this.getCustomerById(merchantId, id);

    const [sales, returns] = await Promise.all([
      this.db.sale.findMany({
        where: { customerId: id, merchantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
          createdAt: true,
          branch: { select: { id: true, code: true, name: true } },
          payments: { select: { tenderType: true, amount: true } },
        },
      }),
      this.db.customerReturn.findMany({
        where: { customerId: id, merchantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          returnNumber: true,
          refundAmount: true,
          refundTender: true,
          reason: true,
          createdAt: true,
        },
      }),
    ]);

    const totalSpent = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const totalRefunded = returns.reduce((sum, r) => sum + Number(r.refundAmount), 0);

    return {
      customer: {
        id: customer.id,
        code: customer.code,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        taxNumber: customer.taxNumber,
        creditLimit: Number(customer.creditLimit),
        outstandingBalance: Number(customer.outstandingBalance),
        availableCredit: Math.max(0, Number(customer.creditLimit) - Number(customer.outstandingBalance)),
        loyaltyPoints: customer.loyaltyPoints,
      },
      summary: {
        totalSalesCount: sales.length,
        totalSpent: Math.round(totalSpent * 100) / 100,
        totalReturnsCount: returns.length,
        totalRefunded: Math.round(totalRefunded * 100) / 100,
      },
      recentSales: sales.slice(0, 20),
      recentReturns: returns.slice(0, 20),
    };
  }
}
