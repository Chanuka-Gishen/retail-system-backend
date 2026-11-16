import { AccountCategory } from '@/common/types';

export interface DefaultAccountDefinition {
  accountCode: string;
  accountName: string;
  category: AccountCategory;
  isSystemAccount: boolean;
}

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccountDefinition[] = [
  // ASSETS (1000 - 1999)
  { accountCode: '1010', accountName: 'Cash on Hand / Till Cash', category: AccountCategory.ASSET, isSystemAccount: true },
  { accountCode: '1020', accountName: 'Operating Bank Account', category: AccountCategory.ASSET, isSystemAccount: true },
  { accountCode: '1030', accountName: 'Accounts Receivable (Customer Credit)', category: AccountCategory.ASSET, isSystemAccount: true },
  { accountCode: '1040', accountName: 'Merchandise Inventory Asset', category: AccountCategory.ASSET, isSystemAccount: true },

  // LIABILITIES (2000 - 2999)
  { accountCode: '2010', accountName: 'Accounts Payable (Suppliers)', category: AccountCategory.LIABILITY, isSystemAccount: true },
  { accountCode: '2020', accountName: 'Sales Tax Payable', category: AccountCategory.LIABILITY, isSystemAccount: true },

  // EQUITY (3000 - 3999)
  { accountCode: '3010', accountName: "Owner's Equity / Initial Capital", category: AccountCategory.EQUITY, isSystemAccount: true },
  { accountCode: '3020', accountName: 'Retained Earnings', category: AccountCategory.EQUITY, isSystemAccount: true },

  // REVENUE (4000 - 4999)
  { accountCode: '4010', accountName: 'Gross Sales Revenue', category: AccountCategory.REVENUE, isSystemAccount: true },
  { accountCode: '4020', accountName: 'Sales Discounts Given', category: AccountCategory.REVENUE, isSystemAccount: true },
  { accountCode: '4030', accountName: 'Sales Returns & Refunds', category: AccountCategory.REVENUE, isSystemAccount: true },

  // COST OF GOODS SOLD (5000 - 5999)
  { accountCode: '5010', accountName: 'Cost of Goods Sold (COGS)', category: AccountCategory.EXPENSE, isSystemAccount: true },
  { accountCode: '5020', accountName: 'Inventory Damage & Discrepancies', category: AccountCategory.EXPENSE, isSystemAccount: true },

  // EXPENSES (6000 - 6999)
  { accountCode: '6010', accountName: 'Operating Rent & Utilities', category: AccountCategory.EXPENSE, isSystemAccount: false },
  { accountCode: '6020', accountName: 'Salaries & Staff Wages', category: AccountCategory.EXPENSE, isSystemAccount: false },
  { accountCode: '6030', accountName: 'Payment Processing Fees', category: AccountCategory.EXPENSE, isSystemAccount: false },
];
