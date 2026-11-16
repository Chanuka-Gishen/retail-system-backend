import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  UpdateSupplierStatusDto,
  CreateSupplierContactDto,
  UpdateSupplierContactDto,
  CreateSupplierCategoryDto,
  UpdateSupplierCategoryDto,
  ListSuppliersQueryDto,
} from '../dto/supplier.dto';
import { Prisma, SupplierLedgerTransactionType, SupplierStatus } from '@prisma/client';

@Injectable()
export class SupplierService {
  constructor(private db: DatabaseService) {}

  async listSuppliers(merchantId: string, query: ListSuppliersQueryDto) {
    const { search, status, categoryId, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {
      merchantId,
      ...(status && { status }),
      ...(categoryId && { categoryId }),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { contactPerson: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.db.supplier.count({ where }),
      this.db.supplier.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: { select: { id: true, code: true, name: true } },
          contacts: { where: { isPrimary: true }, take: 1 },
          _count: {
            select: {
              purchaseOrders: true,
              grns: true,
              invoices: true,
              payments: true,
              cheques: true,
              returns: true,
            },
          },
        },
        orderBy: { name: 'asc' },
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

  async getSupplierById(merchantId: string, id: string) {
    const supplier = await this.db.supplier.findFirst({
      where: { id, merchantId },
      include: {
        category: true,
        contacts: { orderBy: { isPrimary: 'desc' } },
        purchaseOrders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            poNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
          },
        },
        grns: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            grnNumber: true,
            status: true,
            totalAmount: true,
            postedAt: true,
          },
        },
        invoices: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
            balanceAmount: true,
            dueDate: true,
          },
        },
        payments: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            paymentNumber: true,
            paymentMethod: true,
            amount: true,
            paymentDate: true,
          },
        },
        cheques: {
          take: 5,
          orderBy: { maturityDate: 'asc' },
          select: {
            id: true,
            chequeNumber: true,
            bankName: true,
            amount: true,
            maturityDate: true,
            status: true,
          },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier ${id} not found.`);
    }

    return supplier;
  }

  async getSupplierDashboard(merchantId: string, supplierId: string) {
    const supplier = await this.db.supplier.findFirst({
      where: { id: supplierId, merchantId },
      include: { category: true, contacts: true },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier ${supplierId} not found.`);
    }

    const now = new Date();

    const [
      invoicesAggregate,
      overdueAggregate,
      grnAggregate,
      returnsAggregate,
      paymentsAggregate,
      pendingPOsAggregate,
      pendingInvoicesAggregate,
      upcomingChequesAggregate,
      recentTransactions,
    ] = await Promise.all([
      // Total Purchases (Verified Invoices)
      this.db.supplierInvoice.aggregate({
        where: { merchantId, supplierId, status: { notIn: ['VOID'] } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      // Overdue Balance
      this.db.supplierInvoice.aggregate({
        where: {
          merchantId,
          supplierId,
          dueDate: { lt: now },
          balanceAmount: { gt: 0 },
          status: { notIn: ['FULLY_PAID', 'VOID'] },
        },
        _sum: { balanceAmount: true },
        _count: { id: true },
      }),
      // Total GRNs
      this.db.goodsReceivedNote.aggregate({
        where: { merchantId, supplierId, status: 'POSTED' },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      // Total Returns
      this.db.supplierReturn.aggregate({
        where: { merchantId, supplierId, status: { in: ['APPROVED', 'DISPATCHED', 'COMPLETED'] } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      // Total Paid
      this.db.supplierPayment.aggregate({
        where: { merchantId, supplierId, status: 'COMPLETED' },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Pending Purchase Orders
      this.db.purchaseOrder.aggregate({
        where: {
          merchantId,
          supplierId,
          status: { in: ['ISSUED', 'PARTIALLY_RECEIVED', 'PENDING_APPROVAL', 'APPROVED'] },
        },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      // Pending Invoices (Awaiting payment or verification)
      this.db.supplierInvoice.aggregate({
        where: {
          merchantId,
          supplierId,
          status: { in: ['PENDING_VERIFICATION', 'VERIFIED', 'PARTIALLY_PAID'] },
        },
        _sum: { balanceAmount: true },
        _count: { id: true },
      }),
      // Upcoming Cheques
      this.db.supplierCheque.aggregate({
        where: {
          merchantId,
          supplierId,
          status: { in: ['ISSUED', 'AWAITING_DEPOSIT', 'DEPOSITED'] },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Recent Ledger Transactions
      this.db.supplierLedgerEntry.findMany({
        where: { merchantId, supplierId },
        take: 10,
        orderBy: { entryDate: 'desc' },
      }),
    ]);

    const totalPurchases = Number(invoicesAggregate._sum.totalAmount || 0);
    const totalGRNs = Number(grnAggregate._sum.totalAmount || 0);
    const totalReturns = Number(returnsAggregate._sum.totalAmount || 0);
    const totalPaid = Number(paymentsAggregate._sum.amount || 0);
    const outstandingBalance = Number(supplier.outstandingPayables || 0);
    const overdueBalance = Number(overdueAggregate._sum.balanceAmount || 0);
    const creditLimit = Number(supplier.creditLimit || 0);
    const availableCredit = Math.max(0, creditLimit - outstandingBalance);

    return {
      supplier,
      metrics: {
        totalPurchases,
        totalPurchasesCount: invoicesAggregate._count.id,
        totalGRNs,
        totalGRNsCount: grnAggregate._count.id,
        totalReturns,
        totalReturnsCount: returnsAggregate._count.id,
        totalPaid,
        totalPaidCount: paymentsAggregate._count.id,
        outstandingBalance,
        overdueBalance,
        overdueInvoicesCount: overdueAggregate._count.id,
        creditLimit,
        availableCredit,
        pendingPOsCount: pendingPOsAggregate._count.id,
        pendingPOsAmount: Number(pendingPOsAggregate._sum.totalAmount || 0),
        pendingInvoicesCount: pendingInvoicesAggregate._count.id,
        pendingInvoicesAmount: Number(pendingInvoicesAggregate._sum.balanceAmount || 0),
        upcomingChequesCount: upcomingChequesAggregate._count.id,
        upcomingChequesAmount: Number(upcomingChequesAggregate._sum.amount || 0),
      },
      recentTransactions,
    };
  }

  async createSupplier(merchantId: string, dto: CreateSupplierDto, actorId?: string) {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.db.supplier.findUnique({
      where: {
        merchantId_code: {
          merchantId,
          code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Supplier with code "${code}" already exists.`);
    }

    const openingBalance = Number(dto.openingBalance || 0);

    return this.db.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: {
          merchantId,
          code,
          name: dto.name.trim(),
          businessRegNumber: dto.businessRegNumber?.trim(),
          supplierType: dto.supplierType || 'COMPANY',
          categoryId: dto.categoryId,
          status: dto.status || 'ACTIVE',
          contactPerson: dto.contactPerson?.trim(),
          email: dto.email?.trim().toLowerCase(),
          phone: dto.phone?.trim(),
          phoneSecondary: dto.phoneSecondary?.trim(),
          website: dto.website?.trim(),
          address: dto.address?.trim(),
          city: dto.city?.trim(),
          district: dto.district?.trim(),
          country: dto.country?.trim() || 'Sri Lanka',
          billingAddress: dto.billingAddress?.trim(),
          deliveryAddress: dto.deliveryAddress?.trim(),
          taxNumber: dto.taxNumber?.trim(),
          creditDays: dto.creditDays ?? 30,
          creditLimit: dto.creditLimit ?? 0,
          openingBalance,
          outstandingPayables: openingBalance,
          preferredPaymentMethod: dto.preferredPaymentMethod,
          defaultCurrency: dto.defaultCurrency || 'LKR',
          bankName: dto.bankName?.trim(),
          bankBranch: dto.bankBranch?.trim(),
          bankAccountName: dto.bankAccountName?.trim(),
          bankAccountNumber: dto.bankAccountNumber?.trim(),
          notes: dto.notes?.trim(),
          internalRemarks: dto.internalRemarks?.trim(),
          isActive: dto.status !== SupplierStatus.INACTIVE && dto.status !== SupplierStatus.SUSPENDED && dto.status !== SupplierStatus.BLACKLISTED,
        },
      });

      // Record opening balance in ledger if greater than zero
      if (openingBalance > 0 && actorId) {
        await tx.supplierLedgerEntry.create({
          data: {
            merchantId,
            supplierId: supplier.id,
            transactionType: SupplierLedgerTransactionType.OPENING_BALANCE,
            referenceNumber: 'OPENING',
            credit: openingBalance,
            debit: 0,
            runningBalance: openingBalance,
            description: 'Opening balance upon supplier registration',
            createdById: actorId,
          },
        });
      }

      return supplier;
    });
  }

  async updateSupplier(merchantId: string, id: string, dto: UpdateSupplierDto) {
    const existing = await this.db.supplier.findFirst({
      where: { id, merchantId },
    });

    if (!existing) {
      throw new NotFoundException(`Supplier ${id} not found.`);
    }

    return this.db.supplier.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.businessRegNumber !== undefined && { businessRegNumber: dto.businessRegNumber?.trim() }),
        ...(dto.supplierType && { supplierType: dto.supplierType }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.status && {
          status: dto.status,
          isActive: dto.status === SupplierStatus.ACTIVE,
        }),
        ...(dto.contactPerson !== undefined && { contactPerson: dto.contactPerson?.trim() }),
        ...(dto.email !== undefined && { email: dto.email?.trim().toLowerCase() }),
        ...(dto.phone !== undefined && { phone: dto.phone?.trim() }),
        ...(dto.phoneSecondary !== undefined && { phoneSecondary: dto.phoneSecondary?.trim() }),
        ...(dto.website !== undefined && { website: dto.website?.trim() }),
        ...(dto.address !== undefined && { address: dto.address?.trim() }),
        ...(dto.city !== undefined && { city: dto.city?.trim() }),
        ...(dto.district !== undefined && { district: dto.district?.trim() }),
        ...(dto.country !== undefined && { country: dto.country?.trim() }),
        ...(dto.billingAddress !== undefined && { billingAddress: dto.billingAddress?.trim() }),
        ...(dto.deliveryAddress !== undefined && { deliveryAddress: dto.deliveryAddress?.trim() }),
        ...(dto.taxNumber !== undefined && { taxNumber: dto.taxNumber?.trim() }),
        ...(dto.creditDays !== undefined && { creditDays: dto.creditDays }),
        ...(dto.creditLimit !== undefined && { creditLimit: dto.creditLimit }),
        ...(dto.preferredPaymentMethod !== undefined && { preferredPaymentMethod: dto.preferredPaymentMethod }),
        ...(dto.defaultCurrency !== undefined && { defaultCurrency: dto.defaultCurrency }),
        ...(dto.bankName !== undefined && { bankName: dto.bankName?.trim() }),
        ...(dto.bankBranch !== undefined && { bankBranch: dto.bankBranch?.trim() }),
        ...(dto.bankAccountName !== undefined && { bankAccountName: dto.bankAccountName?.trim() }),
        ...(dto.bankAccountNumber !== undefined && { bankAccountNumber: dto.bankAccountNumber?.trim() }),
        ...(dto.notes !== undefined && { notes: dto.notes?.trim() }),
        ...(dto.internalRemarks !== undefined && { internalRemarks: dto.internalRemarks?.trim() }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async updateSupplierStatus(merchantId: string, id: string, dto: UpdateSupplierStatusDto) {
    const existing = await this.db.supplier.findFirst({
      where: { id, merchantId },
    });

    if (!existing) {
      throw new NotFoundException(`Supplier ${id} not found.`);
    }

    return this.db.supplier.update({
      where: { id },
      data: {
        status: dto.status,
        isActive: dto.status === SupplierStatus.ACTIVE,
        internalRemarks: dto.remarks
          ? `${existing.internalRemarks ? existing.internalRemarks + '\n' : ''}[Status changed to ${dto.status}]: ${dto.remarks}`
          : existing.internalRemarks,
      },
    });
  }

  // --- Supplier Contacts ---
  async addContact(merchantId: string, supplierId: string, dto: CreateSupplierContactDto) {
    const supplier = await this.db.supplier.findFirst({
      where: { id: supplierId, merchantId },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier ${supplierId} not found.`);
    }

    if (dto.isPrimary) {
      // Set existing primary contacts to false
      await this.db.supplierContact.updateMany({
        where: { supplierId },
        data: { isPrimary: false },
      });
    }

    return this.db.supplierContact.create({
      data: {
        supplierId,
        name: dto.name.trim(),
        designation: dto.designation?.trim(),
        phone: dto.phone.trim(),
        email: dto.email?.trim().toLowerCase(),
        contactType: dto.contactType?.trim(),
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  async updateContact(
    merchantId: string,
    supplierId: string,
    contactId: string,
    dto: UpdateSupplierContactDto,
  ) {
    const contact = await this.db.supplierContact.findFirst({
      where: { id: contactId, supplierId, supplier: { merchantId } },
    });

    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found.`);
    }

    if (dto.isPrimary) {
      await this.db.supplierContact.updateMany({
        where: { supplierId, id: { not: contactId } },
        data: { isPrimary: false },
      });
    }

    return this.db.supplierContact.update({
      where: { id: contactId },
      data: {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.designation !== undefined && { designation: dto.designation?.trim() }),
        ...(dto.phone && { phone: dto.phone.trim() }),
        ...(dto.email !== undefined && { email: dto.email?.trim().toLowerCase() }),
        ...(dto.contactType !== undefined && { contactType: dto.contactType?.trim() }),
        ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
      },
    });
  }

  async deleteContact(merchantId: string, supplierId: string, contactId: string) {
    const contact = await this.db.supplierContact.findFirst({
      where: { id: contactId, supplierId, supplier: { merchantId } },
    });

    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found.`);
    }

    await this.db.supplierContact.delete({
      where: { id: contactId },
    });

    return { success: true, message: 'Contact removed successfully' };
  }

  // --- Supplier Categories ---
  async listCategories(merchantId: string) {
    return this.db.supplierCategory.findMany({
      where: { merchantId },
      include: { _count: { select: { suppliers: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(merchantId: string, dto: CreateSupplierCategoryDto) {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.db.supplierCategory.findUnique({
      where: {
        merchantId_code: {
          merchantId,
          code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Category with code "${code}" already exists.`);
    }

    return this.db.supplierCategory.create({
      data: {
        merchantId,
        code,
        name: dto.name.trim(),
        description: dto.description?.trim(),
      },
    });
  }

  async updateCategory(merchantId: string, id: string, dto: UpdateSupplierCategoryDto) {
    const existing = await this.db.supplierCategory.findFirst({
      where: { id, merchantId },
    });

    if (!existing) {
      throw new NotFoundException(`Supplier category ${id} not found.`);
    }

    return this.db.supplierCategory.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }
}
