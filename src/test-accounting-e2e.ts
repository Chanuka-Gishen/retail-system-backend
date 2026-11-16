import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

interface HttpResponse<T = any> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

async function fetchHttp<T = any>(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {},
): Promise<HttpResponse<T>> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const rawText = await res.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = rawText;
  }

  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });

  return {
    status: res.status,
    data,
    headers: responseHeaders,
  };
}

function assert(condition: boolean, message: string, extra?: any) {
  if (!condition) {
    console.error(`❌ FAILED ASSERTION: ${message}`);
    if (extra) {
      console.error('  Details:', JSON.stringify(extra, null, 2));
    }
    throw new Error(message);
  }
  console.log(`  ✔ PASSED: ${message}`);
}

async function runAccountingE2ETests() {
  console.log('================================================================');
  console.log('🚀 STARTING DOUBLE-ENTRY ACCOUNTING (PHASE 13 - WP-12) E2E');
  console.log('================================================================\n');

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });

  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new TransformResponseInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  const testPort = 4104;
  await app.listen(testPort);
  const baseUrl = `http://localhost:${testPort}/api/v1`;

  try {
    // -----------------------------------------------------------------
    // STEP 1: Merchant Owner Authentication
    // -----------------------------------------------------------------
    console.log('👉 [Step 1] Merchant Owner Authentication');
    const loginRes = await fetchHttp(`${baseUrl}/auth/merchant/login`, {
      method: 'POST',
      body: { email: 'owner@urbanmart.com', password: 'UrbanOwner123!' },
    });
    assert(loginRes.status === 200, 'Merchant Owner login succeeds');
    const token = loginRes.data.response.accessToken;
    const authHeaders = { Authorization: `Bearer ${token}` };

    // -----------------------------------------------------------------
    // STEP 2: Chart of Accounts Auto-Seeding & Listing
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 2] Chart of Accounts Auto-Seeding & Verification');
    const accountsRes = await fetchHttp(`${baseUrl}/accounting/accounts`, {
      headers: authHeaders,
    });
    assert(accountsRes.status === 200, 'Accounts retrieved');
    const accounts = accountsRes.data.response;
    assert(Array.isArray(accounts), 'Returns array of accounts');
    assert(accounts.length >= 12, 'At least 12 standard accounts seeded');

    const acc1010 = accounts.find((a: any) => a.accountCode === '1010');
    const acc3010 = accounts.find((a: any) => a.accountCode === '3010');
    const acc4010 = accounts.find((a: any) => a.accountCode === '4010');
    assert(acc1010 && acc1010.accountName === 'Cash on Hand', 'Account 1010 Cash on Hand exists');
    assert(acc3010 && acc3010.category === 'EQUITY', 'Account 3010 Equity exists');
    assert(acc4010 && acc4010.category === 'REVENUE', 'Account 4010 Revenue exists');

    // -----------------------------------------------------------------
    // STEP 3: Create Custom Account
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 3] Create Custom Account');
    const customCode = `9${Date.now().toString().slice(-4)}`;
    const createAccRes = await fetchHttp(`${baseUrl}/accounting/accounts`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        accountCode: customCode,
        accountName: 'Petty Cash Branch Float',
        category: 'ASSET',
      },
    });
    assert(createAccRes.status === 201, 'Custom account created', createAccRes.data);
    const customAcc = createAccRes.data.response;
    assert(customAcc.accountCode === customCode, 'Account code preserved');
    assert(customAcc.isSystemAccount === false, 'isSystemAccount is false for custom account');

    // Duplicate account code rejected
    const dupAccRes = await fetchHttp(`${baseUrl}/accounting/accounts`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        accountCode: customCode,
        accountName: 'Duplicate Float',
        category: 'ASSET',
      },
    });
    assert(dupAccRes.status === 409, 'Duplicate account code rejected with 409 Conflict');

    // -----------------------------------------------------------------
    // STEP 4: Post Balanced Double-Entry Journal Entry
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 4] Balanced Double-Entry Journal Entry Posting');
    const bal1010Before = Number((await fetchHttp(`${baseUrl}/accounting/accounts/${acc1010.id}`, { headers: authHeaders })).data.response.currentBalance);
    const bal3010Before = Number((await fetchHttp(`${baseUrl}/accounting/accounts/${acc3010.id}`, { headers: authHeaders })).data.response.currentBalance);

    const postEntryRes = await fetchHttp(`${baseUrl}/accounting/journal-entries`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        entryDate: new Date().toISOString(),
        referenceType: 'MANUAL',
        description: 'Owner initial capital cash contribution',
        lines: [
          {
            accountCode: '1010',
            entryType: 'DEBIT',
            amount: 100000.0,
            description: 'Debit Cash on Hand for equity injected',
          },
          {
            accountCode: '3010',
            entryType: 'CREDIT',
            amount: 100000.0,
            description: 'Credit Retained Equity',
          },
        ],
      },
    });
    assert(postEntryRes.status === 201, 'Journal entry posted successfully', postEntryRes.data);
    const entry1 = postEntryRes.data.response;
    assert(entry1.entryNumber.startsWith('JE-'), 'Generated entry number starts with JE-');
    assert(entry1.lines.length === 2, '2 journal lines persisted');

    // Verify account balances updated
    const bal1010After = Number((await fetchHttp(`${baseUrl}/accounting/accounts/${acc1010.id}`, { headers: authHeaders })).data.response.currentBalance);
    const bal3010After = Number((await fetchHttp(`${baseUrl}/accounting/accounts/${acc3010.id}`, { headers: authHeaders })).data.response.currentBalance);
    assert(
      bal1010After === bal1010Before + 100000.0,
      `Cash on Hand (ASSET) increased by 100,000 (${bal1010Before} -> ${bal1010After})`,
    );
    assert(
      bal3010After === bal3010Before + 100000.0,
      `Equity (EQUITY) increased by 100,000 (${bal3010Before} -> ${bal3010After})`,
    );

    // -----------------------------------------------------------------
    // STEP 5: Double-Entry Imbalance Invariant Check
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 5] Double-Entry Imbalance Invariant (Debits != Credits)');
    const imbalancedRes = await fetchHttp(`${baseUrl}/accounting/journal-entries`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        entryDate: new Date().toISOString(),
        referenceType: 'MANUAL',
        description: 'Imbalanced entry test',
        lines: [
          {
            accountCode: '1010',
            entryType: 'DEBIT',
            amount: 50000.0,
          },
          {
            accountCode: '3010',
            entryType: 'CREDIT',
            amount: 45000.0, // 5,000 difference!
          },
        ],
      },
    });
    assert(imbalancedRes.status === 400, 'Imbalanced entry rejected with 400 Bad Request');
    assert(
      imbalancedRes.data.responseMessage.includes('Double-entry imbalance detected'),
      'Informative imbalance error message returned',
    );

    // -----------------------------------------------------------------
    // STEP 6: Multi-Line Compound Journal Voucher
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 6] Compound Journal Entry (4 Lines)');
    const compoundRes = await fetchHttp(`${baseUrl}/accounting/journal-entries`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        entryDate: new Date().toISOString(),
        referenceType: 'SALE',
        description: 'Daily cash and card sales summary with VAT output',
        lines: [
          { accountCode: '1010', entryType: 'DEBIT', amount: 12000.0, description: 'Cash collected' },
          { accountCode: '1020', entryType: 'DEBIT', amount: 8000.0, description: 'Card merchant clearing' },
          { accountCode: '4010', entryType: 'CREDIT', amount: 18000.0, description: 'Net sales revenue' },
          { accountCode: '2020', entryType: 'CREDIT', amount: 2000.0, description: 'VAT payable output tax' },
        ],
      },
    });
    assert(compoundRes.status === 201, 'Compound entry posted successfully');
    const compoundEntry = compoundRes.data.response;
    assert(compoundEntry.lines.length === 4, '4 compound lines recorded');

    // -----------------------------------------------------------------
    // STEP 7: Journal Entry Reversal
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 7] Reversing Journal Entry');
    const reverseRes = await fetchHttp(
      `${baseUrl}/accounting/journal-entries/${compoundEntry.id}/reverse`,
      {
        method: 'POST',
        headers: authHeaders,
        body: { reason: 'Accounting date correction required' },
      },
    );
    assert(reverseRes.status === 200, 'Reversing voucher created successfully');
    const reversal = reverseRes.data.response;
    assert(reversal.referenceType === 'REVERSAL', 'Reversal entry marked with referenceType REVERSAL');

    // Verify original entry marked reversed
    const entryCheck = await fetchHttp(`${baseUrl}/accounting/journal-entries?referenceType=SALE`, {
      headers: authHeaders,
    });
    const foundSaleEntry = entryCheck.data.response.find((e: any) => e.id === compoundEntry.id);
    assert(foundSaleEntry.isReversed === true, 'Original entry isReversed is now true');

    // Attempting duplicate reversal rejected
    const dupReverseRes = await fetchHttp(
      `${baseUrl}/accounting/journal-entries/${compoundEntry.id}/reverse`,
      {
        method: 'POST',
        headers: authHeaders,
        body: { reason: 'Second reversal attempt' },
      },
    );
    assert(dupReverseRes.status === 400, 'Duplicate reversal rejected with 400 Bad Request');

    // -----------------------------------------------------------------
    // STEP 8: Financial Report - Trial Balance
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 8] Trial Balance Report');
    const tbRes = await fetchHttp(`${baseUrl}/accounting/reports/trial-balance`, {
      headers: authHeaders,
    });
    assert(tbRes.status === 200, 'Trial balance generated');
    const tb = tbRes.data.response;
    assert(tb.isBalanced === true, 'Trial balance is balanced (Debits == Credits)');
    assert(tb.totalDebits === tb.totalCredits, 'Total debits exactly equals total credits');
    assert(tb.difference === 0, 'Difference is 0');
    assert(tb.accounts.length >= 12, 'All accounts reflected on trial balance');

    // -----------------------------------------------------------------
    // STEP 9: Financial Report - Profit & Loss (Income Statement)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 9] Profit & Loss (Income Statement) Report');
    const pnlRes = await fetchHttp(`${baseUrl}/accounting/reports/profit-and-loss`, {
      headers: authHeaders,
    });
    assert(pnlRes.status === 200, 'P&L generated');
    const pnl = pnlRes.data.response;
    assert(typeof pnl.totalRevenue === 'number', 'Total revenue calculated');
    assert(typeof pnl.totalExpenses === 'number', 'Total expenses calculated');
    assert(
      pnl.netIncome === Math.round((pnl.totalRevenue - pnl.totalExpenses) * 100) / 100,
      'Net income correctly computed as Revenue - Expenses',
    );

    // -----------------------------------------------------------------
    // STEP 10: Financial Report - Balance Sheet
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 10] Balance Sheet Report (Assets = Liabilities + Equity)');
    const bsRes = await fetchHttp(`${baseUrl}/accounting/reports/balance-sheet`, {
      headers: authHeaders,
    });
    assert(bsRes.status === 200, 'Balance sheet generated');
    const bs = bsRes.data.response;
    assert(bs.isBalanced === true, 'Balance sheet is strictly balanced');
    assert(
      Math.abs(bs.assets.totalAssets - bs.totalLiabilitiesAndEquity) < 0.01,
      'Fundamental equation satisfied: Assets == Liabilities + Equity',
    );

    // -----------------------------------------------------------------
    // STEP 11: Journal Entries Query & Filter
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 11] Journal Entries Query & Pagination');
    const listJeRes = await fetchHttp(`${baseUrl}/accounting/journal-entries?referenceType=MANUAL&limit=5`, {
      headers: authHeaders,
    });
    assert(listJeRes.status === 200, 'Journal entries queried');
    const jeList = listJeRes.data.response.items || listJeRes.data.response;
    assert(jeList.length >= 1, 'Manual journal entries returned');
    assert(listJeRes.data.meta.total >= 1, 'Meta tracks total count');

    // -----------------------------------------------------------------
    // STEP 12: Multi-Tenant Cross-Merchant Isolation
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 12] Multi-Tenant Isolation');
    const platformLoginRes = await fetchHttp(`${baseUrl}/auth/platform/login`, {
      method: 'POST',
      body: { email: 'superadmin@retailpos.com', password: 'SuperAdminPassword123!' },
    });
    const platformHeaders = { Authorization: `Bearer ${platformLoginRes.data.response.accessToken}` };

    const plansRes = await fetchHttp(`${baseUrl}/onboarding/plans`);
    const basicPlan = plansRes.data.response.find((p: any) => p.code === 'PLAN_BASIC') || plansRes.data.response[0];

    const tenantEmail = `tenant_acc_${Date.now()}@testmart.com`;
    const regRes = await fetchHttp(`${baseUrl}/onboarding/register`, {
      method: 'POST',
      body: {
        businessName: `Accounting Isolated Mart ${Date.now()}`,
        tradeName: 'Acc Mart',
        contactEmail: tenantEmail,
        contactPhone: '+94779998888',
        ownerFirstName: 'TenantE',
        ownerLastName: 'Owner',
        password: 'TenantEPassword123!',
        planId: basicPlan.id,
        billingCycle: 'MONTHLY',
      },
    });
    assert(regRes.status === 201, 'Secondary merchant registered');
    const tenantEMerchantId = regRes.data.response.merchantId;

    await fetchHttp(`${baseUrl}/platform/merchants/${tenantEMerchantId}/approve`, {
      method: 'POST',
      headers: platformHeaders,
    });

    const tenantELogin = await fetchHttp(`${baseUrl}/auth/merchant/login`, {
      method: 'POST',
      body: { email: tenantEmail, password: 'TenantEPassword123!' },
    });
    assert(tenantELogin.status === 200, 'Tenant E logged in');
    const tenantEHeaders = { Authorization: `Bearer ${tenantELogin.data.response.accessToken}` };

    // Tenant E attempts to view Tenant A's custom account
    const crossRes = await fetchHttp(`${baseUrl}/accounting/accounts/${customAcc.id}`, {
      headers: tenantEHeaders,
    });
    assert(crossRes.status === 404, 'Cross-tenant account access rejected with 404 Not Found');

    console.log('\n================================================================');
    console.log('🎉 ALL PHASE 13 (WP-12) DOUBLE-ENTRY ACCOUNTING TESTS PASSED!');
    console.log('================================================================\n');
  } finally {
    await app.close();
  }
}

runAccountingE2ETests().catch((err) => {
  console.error('E2E TEST FAILURE:', err);
  process.exit(1);
});
