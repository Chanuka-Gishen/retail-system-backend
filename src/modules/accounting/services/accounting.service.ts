import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import {
  CreateAccountDto,
  UpdateAccountDto,
  CreateJournalEntryDto,
  ListJournalEntriesQueryDto,
  FinancialReportQueryDto,
} from '../dto/accounting.dto';
import {
  AccountCategory,
  EntryType,
  Prisma,
} from '@prisma/client';

export const DEFAULT_ACCOUNTS = [
  { code: '1010', name: 'Cash on Hand', category: AccountCategory.ASSET },
  { code: '1020', name: 'Bank Clearing Account', category: AccountCategory.ASSET },
  { code: '1030', name: 'Accounts Receivable', category: AccountCategory.ASSET },
  { code: '1040', name: 'Merchandise Inventory', category: AccountCategory.ASSET },
  { code: '2010', name: 'Accounts Payable', category: AccountCategory.LIABILITY },
  { code: '2020', name: 'Sales Tax / VAT Payable', category: AccountCategory.LIABILITY },
  { code: '3010', name: 'Merchant Retained Equity', category: AccountCategory.EQUITY },
  { code: '4010', name: 'Sales Revenue', category: AccountCategory.REVENUE },
  { code: '4020', name: 'Cash Drawer Overage Gain', category: AccountCategory.REVENUE },
  { code: '5010', name: 'Cost of Goods Sold (COGS)', category: AccountCategory.EXPENSE },
  { code: '5020', name: 'Inventory Shrinkage & Disposal Loss', category: AccountCategory.EXPENSE },
  { code: '5030', name: 'Cash Drawer Shortage Expense', category: AccountCategory.EXPENSE },
];

@Injectable()
export class AccountingService {
  constructor(private db: DatabaseService) {}

  async seedDefaultChartOfAccounts(merchantId: string) {
    const existingCount = await this.db.chartOfAccounts.count({ where: { merchantId } });
    if (existingCount > 0) {
      return this.listAccounts(merchantId);
    }

    await this.db.chartOfAccounts.createMany({
      data: DEFAULT_ACCOUNTS.map((acc) => ({
        merchantId,
        accountCode: acc.code,
        accountName: acc.name,
        category: acc.category,
        isSystemAccount: true,
        isActive: true,
        currentBalance: 0,
      })),
    });

    return this.listAccounts(merchantId);
  }

  async listAccounts(merchantId: string) {
    // Auto-seed standard accounts if empty
    const count = await this.db.chartOfAccounts.count({ where: { merchantId } });
    if (count === 0) {
      await this.seedDefaultChartOfAccounts(merchantId);
    }

    return this.db.chartOfAccounts.findMany({
      where: { merchantId },
      orderBy: { accountCode: 'asc' },
    });
  }

  async createAccount(merchantId: string, dto: CreateAccountDto) {
    const existing = await this.db.chartOfAccounts.findUnique({
      where: {
        merchantId_accountCode: {
          merchantId,
          accountCode: dto.accountCode.trim(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Account code "${dto.accountCode}" already exists in chart of accounts.`);
    }

    return this.db.chartOfAccounts.create({
      data: {
        merchantId,
        accountCode: dto.accountCode.trim(),
        accountName: dto.accountName.trim(),
        category: dto.category,
        parentId: dto.parentId || null,
        isSystemAccount: false,
        isActive: true,
        currentBalance: 0,
      },
    });
  }

  async getAccountById(merchantId: string, id: string) {
    const account = await this.db.chartOfAccounts.findFirst({
      where: { id, merchantId },
      include: {
        parent: true,
        children: true,
        journalLines: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            journalEntry: { select: { entryNumber: true, entryDate: true, description: true } },
          },
        },
      },
    });

    if (!account) {
      throw new NotFoundException(`Chart of account ${id} not found.`);
    }

    return account;
  }

  async updateAccount(merchantId: string, id: string, dto: UpdateAccountDto) {
    await this.getAccountById(merchantId, id);

    return this.db.chartOfAccounts.update({
      where: { id },
      data: {
        ...(dto.accountName && { accountName: dto.accountName.trim() }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async createJournalEntry(
    merchantId: string,
    dto: CreateJournalEntryDto,
    createdById?: string,
  ) {
    // Auto-seed COA if needed
    const count = await this.db.chartOfAccounts.count({ where: { merchantId } });
    if (count === 0) {
      await this.seedDefaultChartOfAccounts(merchantId);
    }

    // 1. Double-Entry Invariant Validation: Sum(Debits) == Sum(Credits)
    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of dto.lines) {
      const amt = Number(line.amount);
      if (line.entryType === EntryType.DEBIT) {
        totalDebit += amt;
      } else if (line.entryType === EntryType.CREDIT) {
        totalCredit += amt;
      }
    }

    totalDebit = Math.round(totalDebit * 100) / 100;
    totalCredit = Math.round(totalCredit * 100) / 100;

    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.009) {
      throw new BadRequestException(
        `Double-entry imbalance detected: Total debits (LKR ${totalDebit.toFixed(2)}) must equal total credits (LKR ${totalCredit.toFixed(2)}). Difference is LKR ${diff.toFixed(2)}.`,
      );
    }

    // 2. Resolve Accounts
    const accountIdentifiers = dto.lines.map((l) => l.accountCode.trim());
    const isUuid = (val: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
    const codeList = accountIdentifiers.filter((id) => !isUuid(id));
    const uuidList = accountIdentifiers.filter((id) => isUuid(id));

    const orClauses: Prisma.ChartOfAccountsWhereInput[] = [];
    if (codeList.length > 0) orClauses.push({ accountCode: { in: codeList } });
    if (uuidList.length > 0) orClauses.push({ id: { in: uuidList } });

    const accounts = await this.db.chartOfAccounts.findMany({
      where: {
        merchantId,
        OR: orClauses.length > 0 ? orClauses : undefined,
      },
    });

    const accountMap = new Map<string, typeof accounts[0]>();
    for (const acc of accounts) {
      accountMap.set(acc.accountCode, acc);
      accountMap.set(acc.id, acc);
    }

    for (const line of dto.lines) {
      const key = line.accountCode.trim();
      if (!accountMap.has(key)) {
        throw new BadRequestException(`Account "${key}" not found in merchant's chart of accounts.`);
      }
    }

    // 3. Generate Entry Number & UUID
    const entryId = randomUUID();
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const entryNumber = `JE-${todayStr}-${randomDigits}`;

    // 4. Atomic Double-Entry Transaction
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const journalEntry = await tx.journalEntry.create({
        data: {
          id: entryId,
          merchantId,
          entryNumber,
          entryDate: new Date(dto.entryDate),
          referenceType: dto.referenceType.trim().toUpperCase(),
          referenceId: dto.referenceId || null,
          description: dto.description.trim(),
          isReversed: false,
          createdById: createdById || null,
          lines: {
            create: dto.lines.map((l) => {
              const acc = accountMap.get(l.accountCode.trim())!;
              return {
                merchantId,
                accountId: acc.id,
                entryType: l.entryType,
                amount: l.amount,
                description: l.description?.trim() || dto.description.trim(),
              };
            }),
          },
        },
        include: {
          lines: {
            include: {
              account: { select: { id: true, accountCode: true, accountName: true, category: true } },
            },
          },
        },
      });

      // Update Account Current Balances according to accounting equation
      for (const line of dto.lines) {
        const acc = accountMap.get(line.accountCode.trim())!;
        const amt = Number(line.amount);

        // Assets & Expenses: Debit increases (+), Credit decreases (-)
        // Liabilities, Equity, Revenue: Credit increases (+), Debit decreases (-)
        let balanceDelta = 0;
        if (acc.category === AccountCategory.ASSET || acc.category === AccountCategory.EXPENSE) {
          balanceDelta = line.entryType === EntryType.DEBIT ? amt : -amt;
        } else {
          balanceDelta = line.entryType === EntryType.CREDIT ? amt : -amt;
        }

        await tx.chartOfAccounts.update({
          where: { id: acc.id },
          data: {
            currentBalance: { increment: balanceDelta },
          },
        });
      }

      return journalEntry;
    });
  }

  async reverseJournalEntry(merchantId: string, id: string, reason: string, cashierId?: string) {
    const entry = await this.db.journalEntry.findFirst({
      where: { id, merchantId },
      include: {
        lines: {
          include: { account: true },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException(`Journal entry ${id} not found.`);
    }

    if (entry.isReversed) {
      throw new BadRequestException(`Journal entry ${entry.entryNumber} has already been reversed.`);
    }

    // Invert debits and credits
    const invertedLines = entry.lines.map((line) => ({
      accountCode: line.account.accountCode,
      entryType: line.entryType === EntryType.DEBIT ? EntryType.CREDIT : EntryType.DEBIT,
      amount: Number(line.amount),
      description: `Reversal of ${entry.entryNumber}: ${reason}`,
    }));

    const reversalEntry = await this.createJournalEntry(
      merchantId,
      {
        entryDate: new Date().toISOString(),
        referenceType: 'REVERSAL',
        referenceId: entry.id,
        description: `Reversal: ${entry.entryNumber} - ${reason}`,
        lines: invertedLines,
      },
      cashierId,
    );

    // Link reversal entry
    await this.db.journalEntry.update({
      where: { id: entry.id },
      data: {
        isReversed: true,
        reversalEntryId: reversalEntry.id,
      },
    });

    return reversalEntry;
  }

  async listJournalEntries(merchantId: string, query: ListJournalEntriesQueryDto) {
    const { referenceType, startDate, endDate, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.JournalEntryWhereInput = {
      merchantId,
      ...(referenceType && { referenceType: referenceType.toUpperCase() }),
      ...((startDate || endDate) && {
        entryDate: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
    };

    const [total, items] = await Promise.all([
      this.db.journalEntry.count({ where }),
      this.db.journalEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { entryDate: 'desc' },
        include: {
          lines: {
            include: {
              account: { select: { accountCode: true, accountName: true, category: true } },
            },
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

  async getTrialBalance(merchantId: string, query?: FinancialReportQueryDto) {
    const accounts = await this.listAccounts(merchantId);

    let totalDebits = 0;
    let totalCredits = 0;

    const rows = accounts.map((acc) => {
      const balance = Number(acc.currentBalance);
      let debit = 0;
      let credit = 0;

      if (acc.category === AccountCategory.ASSET || acc.category === AccountCategory.EXPENSE) {
        if (balance >= 0) debit = balance;
        else credit = Math.abs(balance);
      } else {
        if (balance >= 0) credit = balance;
        else debit = Math.abs(balance);
      }

      totalDebits += debit;
      totalCredits += credit;

      return {
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        category: acc.category,
        debit: Math.round(debit * 100) / 100,
        credit: Math.round(credit * 100) / 100,
      };
    });

    totalDebits = Math.round(totalDebits * 100) / 100;
    totalCredits = Math.round(totalCredits * 100) / 100;
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

    return {
      asOfDate: query?.asOfDate || new Date().toISOString(),
      isBalanced,
      totalDebits,
      totalCredits,
      difference: Math.round(Math.abs(totalDebits - totalCredits) * 100) / 100,
      accounts: rows,
    };
  }

  async getProfitAndLoss(merchantId: string, query?: FinancialReportQueryDto) {
    const accounts = await this.listAccounts(merchantId);

    const revenues = accounts
      .filter((a) => a.category === AccountCategory.REVENUE)
      .map((a) => ({
        code: a.accountCode,
        name: a.accountName,
        amount: Number(a.currentBalance),
      }));

    const expenses = accounts
      .filter((a) => a.category === AccountCategory.EXPENSE)
      .map((a) => ({
        code: a.accountCode,
        name: a.accountName,
        amount: Number(a.currentBalance),
      }));

    const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const netIncome = Math.round((totalRevenue - totalExpenses) * 100) / 100;

    return {
      period: {
        startDate: query?.startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
        endDate: query?.endDate || new Date().toISOString(),
      },
      revenues,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      expenses,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      netIncome,
    };
  }

  async getBalanceSheet(merchantId: string, query?: FinancialReportQueryDto) {
    const accounts = await this.listAccounts(merchantId);
    const pnl = await this.getProfitAndLoss(merchantId, query);

    const assets = accounts
      .filter((a) => a.category === AccountCategory.ASSET)
      .map((a) => ({
        code: a.accountCode,
        name: a.accountName,
        amount: Number(a.currentBalance),
      }));

    const liabilities = accounts
      .filter((a) => a.category === AccountCategory.LIABILITY)
      .map((a) => ({
        code: a.accountCode,
        name: a.accountName,
        amount: Number(a.currentBalance),
      }));

    const equities = accounts
      .filter((a) => a.category === AccountCategory.EQUITY)
      .map((a) => ({
        code: a.accountCode,
        name: a.accountName,
        amount: Number(a.currentBalance),
      }));

    // Add current period net income to equity
    equities.push({
      code: 'NET_INCOME',
      name: 'Current Period Earnings (P&L)',
      amount: pnl.netIncome,
    });

    const totalAssets = Math.round(assets.reduce((s, a) => s + a.amount, 0) * 100) / 100;
    const totalLiabilities = Math.round(liabilities.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    const totalEquity = Math.round(equities.reduce((s, e) => s + e.amount, 0) * 100) / 100;
    const totalLiabilitiesAndEquity = Math.round((totalLiabilities + totalEquity) * 100) / 100;
    const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;

    return {
      asOfDate: query?.asOfDate || new Date().toISOString(),
      isBalanced,
      assets: {
        items: assets,
        totalAssets,
      },
      liabilities: {
        items: liabilities,
        totalLiabilities,
      },
      equity: {
        items: equities,
        totalEquity,
      },
      totalLiabilitiesAndEquity,
    };
  }
}
