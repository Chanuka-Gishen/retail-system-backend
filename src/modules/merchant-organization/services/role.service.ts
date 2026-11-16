import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateCustomRoleDto, UpdateCustomRoleDto } from '../dto/role.dto';
import { MerchantUserRole } from '@/common/types';

export interface PermissionDefinition {
  category: string;
  code: string;
  name: string;
  description: string;
}

export const SYSTEM_PERMISSIONS: PermissionDefinition[] = [
  // POS & Sales
  {
    category: 'POS & Sales',
    code: 'pos.sale.create',
    name: 'Process Sales & Checkout',
    description: 'Process barcode scans, register checkout, and issue receipts',
  },
  {
    category: 'POS & Sales',
    code: 'pos.sale.view',
    name: 'View Sales Invoices & Slips',
    description: 'Browse past sales records, reprint customer bills, and view transaction history',
  },
  {
    category: 'POS & Sales',
    code: 'pos.sale.void',
    name: 'Void & Cancel Sales',
    description: 'Void active orders or cancel completed sales with audit log',
  },
  {
    category: 'POS & Sales',
    code: 'pos.discount.apply',
    name: 'Apply Custom Discounts',
    description: 'Apply custom price overrides, percentage or line-item discounts at checkout',
  },
  {
    category: 'POS & Sales',
    code: 'pos.return.process',
    name: 'Process Customer Returns',
    description: 'Accept customer merchandise returns, issue credit or refunds',
  },
  {
    category: 'POS & Sales',
    code: 'pos.session.open',
    name: 'Open Cash Session',
    description: 'Start daily cashier cash drawer sessions with opening float',
  },
  {
    category: 'POS & Sales',
    code: 'pos.session.close',
    name: 'Close Cash Session & Drawer',
    description: 'Perform end-of-shift reconciliation, cash drawer count, and shift closing',
  },

  // Catalog & Inventory
  {
    category: 'Catalog & Products',
    code: 'catalog.product.view',
    name: 'View Product Catalog',
    description: 'Browse SKU catalog, categories, barcodes, and master pricing',
  },
  {
    category: 'Catalog & Products',
    code: 'catalog.product.manage',
    name: 'Create & Edit Products',
    description: 'Add new SKUs, modify product descriptions, unit barcodes, and categories',
  },
  {
    category: 'Catalog & Products',
    code: 'catalog.pricing.manage',
    name: 'Manage Selling Prices & Tax',
    description: 'Change selling prices, cost prices, and tax profiles',
  },
  {
    category: 'Inventory & Warehouses',
    code: 'inventory.balance.view',
    name: 'View Stock Balances',
    description: 'Check stock on hand across all branches and warehouses',
  },
  {
    category: 'Inventory & Warehouses',
    code: 'inventory.movement.view',
    name: 'View Stock Ledger',
    description: 'Audit stock movement ledger, batch history, and cardex reports',
  },
  {
    category: 'Inventory & Warehouses',
    code: 'inventory.adjustment.create',
    name: 'Physical Stock Adjustments',
    description: 'Reconcile shrinkage, stock takes, and manual inventory adjustments',
  },
  {
    category: 'Inventory & Warehouses',
    code: 'inventory.transfer.create',
    name: 'Initiate Stock Transfers',
    description: 'Create outbound stock transfer shipments between stores and warehouses',
  },
  {
    category: 'Inventory & Warehouses',
    code: 'inventory.transfer.receive',
    name: 'Receive Stock Transfers',
    description: 'Acknowledge and accept incoming stock transfer shipments',
  },

  // Procurement & Suppliers
  {
    category: 'Procurement & Suppliers',
    code: 'purchasing.supplier.manage',
    name: 'Manage Suppliers',
    description: 'Create and update supplier profiles, contacts, and bank details',
  },
  {
    category: 'Procurement & Suppliers',
    code: 'purchasing.order.manage',
    name: 'Purchase Orders & Requisitions',
    description: 'Issue procurement purchase orders and purchase requisitions',
  },
  {
    category: 'Procurement & Suppliers',
    code: 'purchasing.grn.create',
    name: 'Goods Received Notes (GRN)',
    description: 'Receive goods from vendors, record batch numbers and expiry dates',
  },
  {
    category: 'Procurement & Suppliers',
    code: 'purchasing.invoice.manage',
    name: 'Supplier Invoices & Bills',
    description: 'Perform 3-way matching and record supplier bills',
  },
  {
    category: 'Procurement & Suppliers',
    code: 'purchasing.payments.manage',
    name: 'Supplier Settlements & Cheques',
    description: 'Issue vendor settlements, cheque register management, and vouchers',
  },
  {
    category: 'Procurement & Suppliers',
    code: 'purchasing.reports.view',
    name: 'Procurement Analytics & Ageing',
    description: 'View supplier ageing reports, outstanding payables, and spend analytics',
  },

  // Customers & CRM
  {
    category: 'Customers & CRM',
    code: 'customer.view',
    name: 'View Customers',
    description: 'Search customer accounts, credit balances, and transaction history',
  },
  {
    category: 'Customers & CRM',
    code: 'customer.create',
    name: 'Register Customers',
    description: 'Add new retail or wholesale customer profiles at POS or back-office',
  },
  {
    category: 'Customers & CRM',
    code: 'customer.manage',
    name: 'Manage Customer Credit & Profiles',
    description: 'Edit customer credit limits, payment terms, and loyalty accounts',
  },

  // Financials & Accounting
  {
    category: 'Financials & Accounting',
    code: 'accounting.view',
    name: 'View Accounting Dashboard',
    description: 'Browse chart of accounts, bank balances, and journal entries',
  },
  {
    category: 'Financials & Accounting',
    code: 'accounting.journal.manage',
    name: 'Post Journal Entries',
    description: 'Create manual double-entry journals and ledger adjustments',
  },
  {
    category: 'Financials & Accounting',
    code: 'accounting.reports.view',
    name: 'Financial Statements (P&L & BS)',
    description: 'Generate Trial Balance, Profit & Loss statement, and Balance Sheet',
  },

  // Administration & Team
  {
    category: 'Administration & Team',
    code: 'merchant.users.manage',
    name: 'Manage Staff Users',
    description: 'Create staff accounts, reset credentials, and assign roles & store access',
  },
  {
    category: 'Administration & Team',
    code: 'merchant.roles.manage',
    name: 'Manage Custom Roles & Permissions',
    description: 'Create custom security roles and customize granular permission sets',
  },
  {
    category: 'Administration & Team',
    code: 'merchant.branches.manage',
    name: 'Manage Branches & Registers',
    description: 'Create new store branches and register POS terminals',
  },
  {
    category: 'Administration & Team',
    code: 'merchant.settings.view',
    name: 'View Organization Profile',
    description: 'View merchant business profile, subscription tier, and currency',
  },
  {
    category: 'Administration & Team',
    code: 'merchant.settings.edit',
    name: 'Edit Organization Profile',
    description: 'Update business tax numbers, contact details, and organization settings',
  },
];

@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name);

  constructor(private db: DatabaseService) {}

  getAvailablePermissions() {
    return SYSTEM_PERMISSIONS;
  }

  async listRoles(merchantId: string) {
    const customRoles = await this.db.merchantCustomRole.findMany({
      where: { merchantId },
      include: {
        _count: { select: { users: true } },
      },
    });

    const systemRoles = Object.values(MerchantUserRole)
      .filter((r) => r !== MerchantUserRole.CUSTOM)
      .map((role) => ({
        id: role,
        name: role.replace(/_/g, ' '),
        isSystem: true,
      }));

    return {
      systemRoles,
      customRoles: customRoles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: r.permissions,
        userCount: r._count.users,
        isSystem: false,
      })),
    };
  }

  async createCustomRole(merchantId: string, dto: CreateCustomRoleDto) {
    const existing = await this.db.merchantCustomRole.findUnique({
      where: {
        merchantId_name: {
          merchantId,
          name: dto.name.trim(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Role with name "${dto.name}" already exists.`);
    }

    const role = await this.db.merchantCustomRole.create({
      data: {
        merchantId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        permissions: dto.permissions,
      },
    });

    this.logger.log(`Created custom role "${role.name}" for merchant ${merchantId}`);
    return role;
  }

  async updateCustomRole(merchantId: string, id: string, dto: UpdateCustomRoleDto) {
    const role = await this.db.merchantCustomRole.findFirst({
      where: { id, merchantId },
    });
    if (!role) {
      throw new NotFoundException(`Custom role ${id} not found.`);
    }

    if (dto.name && dto.name.trim() !== role.name) {
      const existing = await this.db.merchantCustomRole.findUnique({
        where: {
          merchantId_name: {
            merchantId,
            name: dto.name.trim(),
          },
        },
      });
      if (existing) {
        throw new ConflictException(`Role with name "${dto.name}" already exists.`);
      }
    }

    const updated = await this.db.merchantCustomRole.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() } : {}),
        ...(dto.permissions ? { permissions: dto.permissions } : {}),
      },
    });

    this.logger.log(`Updated custom role "${updated.name}" (${id}) for merchant ${merchantId}`);
    return updated;
  }

  async deleteCustomRole(merchantId: string, id: string) {
    const role = await this.db.merchantCustomRole.findFirst({
      where: { id, merchantId },
      include: { _count: { select: { users: true } } },
    });
    if (!role) {
      throw new NotFoundException(`Custom role ${id} not found.`);
    }

    if (role._count.users > 0) {
      throw new ForbiddenException(
        `Cannot delete role "${role.name}" because ${role._count.users} staff member(s) are currently assigned to it. Please reassign them first.`,
      );
    }

    await this.db.merchantCustomRole.delete({ where: { id } });
    this.logger.log(`Deleted custom role "${role.name}" (${id}) for merchant ${merchantId}`);
    return { success: true, message: `Role "${role.name}" deleted successfully.` };
  }
}
