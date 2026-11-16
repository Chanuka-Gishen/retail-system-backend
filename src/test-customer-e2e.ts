import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { DatabaseService } from './modules/database/database.service';
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

async function runCustomerE2ETests() {
  console.log('================================================================');
  console.log('🚀 STARTING CUSTOMER & LOYALTY ENGINE (PHASE 11 - WP-10) E2E');
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

  const testPort = 4102;
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
    // STEP 2: Create Customer Profile with Explicit Code & Credit Limit
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 2] Create Customer Profile');
    const cust1Code = `CUST-${Date.now().toString().slice(-5)}`;
    const cust1Phone = `077${Math.floor(1000000 + Math.random() * 9000000)}`;

    const createCustRes = await fetchHttp(`${baseUrl}/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: cust1Code,
        name: 'Sunil Wickramasinghe',
        phone: cust1Phone,
        email: `sunil_${Date.now()}@example.com`,
        taxNumber: 'VAT-99881122',
        creditLimit: 75000.0,
      },
    });
    assert(createCustRes.status === 201, 'Customer created successfully', createCustRes.data);
    const customer1 = createCustRes.data.response;
    assert(customer1.code === cust1Code, 'Customer code preserved');
    assert(customer1.name === 'Sunil Wickramasinghe', 'Customer name set');
    assert(Number(customer1.creditLimit) === 75000.0, 'Credit limit initialized to LKR 75,000');
    assert(Number(customer1.outstandingBalance) === 0, 'Outstanding balance is 0');
    assert(customer1.loyaltyPoints === 0, 'Loyalty points initialized to 0');
    assert(customer1.isActive === true, 'Customer is active');

    // -----------------------------------------------------------------
    // STEP 3: Auto-Generated Customer Code
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 3] Auto-Generated Customer Code');
    const createAutoRes = await fetchHttp(`${baseUrl}/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        name: 'Nimal Jayawardena',
        phone: `071${Math.floor(1000000 + Math.random() * 9000000)}`,
      },
    });
    assert(createAutoRes.status === 201, 'Auto-coded customer created');
    assert(createAutoRes.data.response.code.startsWith('CUST-'), 'Generated code starts with CUST-');

    // -----------------------------------------------------------------
    // STEP 4: Duplicate Code Invariant
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 4] Duplicate Customer Code Rejection');
    const dupRes = await fetchHttp(`${baseUrl}/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: cust1Code,
        name: 'Duplicate Sunil',
      },
    });
    assert(dupRes.status === 409, 'Duplicate customer code rejected with 409 Conflict');

    // -----------------------------------------------------------------
    // STEP 5: Customer Search & Listing (POS Cashier Lookup)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 5] Customer Search & POS Phone Lookup');
    // Search by exact phone
    const phoneSearchRes = await fetchHttp(`${baseUrl}/customers?phone=${cust1Phone}`, {
      headers: authHeaders,
    });
    assert(phoneSearchRes.status === 200, 'Search by phone succeeded');
    const phoneMatches = phoneSearchRes.data.response.items || phoneSearchRes.data.response;
    assert(phoneMatches.length >= 1, 'Found customer by phone');
    assert(phoneMatches[0].id === customer1.id, 'Target customer returned by phone lookup');

    // Search by query string (name substring)
    const querySearchRes = await fetchHttp(`${baseUrl}/customers?search=Wickramasinghe`, {
      headers: authHeaders,
    });
    assert(querySearchRes.status === 200, 'Search by text substring succeeded');
    const queryMatches = querySearchRes.data.response.items || querySearchRes.data.response;
    assert(queryMatches.some((c: any) => c.id === customer1.id), 'Matched by surname substring');

    // -----------------------------------------------------------------
    // STEP 6: Customer Details Inspection
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 6] Customer Details & Counts');
    const detailRes = await fetchHttp(`${baseUrl}/customers/${customer1.id}`, {
      headers: authHeaders,
    });
    assert(detailRes.status === 200, 'Customer details fetched');
    assert(detailRes.data.response.id === customer1.id, 'Customer ID verified');
    assert(typeof detailRes.data.response._count.sales === 'number', 'Sales count tracked');
    assert(typeof detailRes.data.response._count.returns === 'number', 'Returns count tracked');

    // -----------------------------------------------------------------
    // STEP 7: Update Customer Details & Credit Limit
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 7] Update Customer Details & Limit');
    const updatedEmail = `sunil_vip_${Date.now()}@example.com`;
    const updateRes = await fetchHttp(`${baseUrl}/customers/${customer1.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: {
        email: updatedEmail,
        creditLimit: 120000.0,
      },
    });
    assert(updateRes.status === 200, 'Customer updated successfully');
    assert(updateRes.data.response.email === updatedEmail, 'Email successfully updated');
    assert(Number(updateRes.data.response.creditLimit) === 120000.0, 'Credit limit upgraded to LKR 120,000');

    // -----------------------------------------------------------------
    // STEP 8: Promotional Loyalty Points Grant & Manual Redemption
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 8] Loyalty Points Management (Grant & Redeem)');
    // Grant 250 bonus points
    const grantRes = await fetchHttp(`${baseUrl}/customers/${customer1.id}/loyalty-adjust`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        points: 250,
        reason: 'VIP Onboarding Bonus Points',
      },
    });
    assert(grantRes.status === 200, 'Bonus loyalty points granted successfully');
    assert(grantRes.data.response.newPoints === 250, 'Points increased from 0 to 250');

    // Redeem 75 points
    const redeemRes = await fetchHttp(`${baseUrl}/customers/${customer1.id}/loyalty-adjust`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        points: -75,
        reason: 'Redeemed for voucher discount',
      },
    });
    assert(redeemRes.status === 200, 'Loyalty points redeemed');
    assert(redeemRes.data.response.newPoints === 175, 'Points reduced from 250 to 175 (250 - 75)');

    // -----------------------------------------------------------------
    // STEP 9: Overdraft Prevention on Loyalty Points
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 9] Loyalty Points Overdraft Prevention');
    const overdraftRes = await fetchHttp(`${baseUrl}/customers/${customer1.id}/loyalty-adjust`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        points: -500, // Exceeds 175 current points
        reason: 'Attempted excessive redemption',
      },
    });
    assert(overdraftRes.status === 400, 'Points deduction exceeding balance rejected with 400 Bad Request');

    // -----------------------------------------------------------------
    // STEP 10: Credit Balance Settlement
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 10] Credit Balance Settlement');
    const db = app.get(DatabaseService);
    // Simulate outstanding balance on customer profile
    await db.customer.update({
      where: { id: customer1.id },
      data: { outstandingBalance: 25000.0 },
    });

    const settleRes = await fetchHttp(`${baseUrl}/customers/${customer1.id}/settle-balance`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        amount: 10000.0,
        tenderType: 'CASH',
        notes: 'Partial settlement via cash payment',
      },
    });
    assert(settleRes.status === 200, 'Balance settled successfully');
    assert(settleRes.data.response.previousBalance === 25000.0, 'Previous balance captured');
    assert(settleRes.data.response.settledAmount === 10000.0, 'Settled amount captured');
    assert(settleRes.data.response.remainingBalance === 15000.0, 'Remaining balance accurately updated to 15,000');

    // -----------------------------------------------------------------
    // STEP 11: Statement of Account Generation
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 11] Customer Statement of Account');
    const statementRes = await fetchHttp(`${baseUrl}/customers/${customer1.id}/statement`, {
      headers: authHeaders,
    });
    assert(statementRes.status === 200, 'Account statement generated');
    const statement = statementRes.data.response;
    assert(statement.customer.id === customer1.id, 'Statement reflects correct customer');
    assert(statement.customer.creditLimit === 120000.0, 'Statement shows updated credit limit');
    assert(statement.customer.outstandingBalance === 15000.0, 'Statement shows current outstanding balance');
    assert(
      statement.customer.availableCredit === 105000.0,
      'Statement calculates available credit (120,000 - 15,000 = 105,000)',
    );
    assert(statement.customer.loyaltyPoints === 175, 'Statement confirms 175 loyalty points');

    // -----------------------------------------------------------------
    // STEP 12: Multi-Tenant Cross-Merchant Isolation
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 12] Multi-Tenant Cross-Merchant Isolation');
    const platformLoginRes = await fetchHttp(`${baseUrl}/auth/platform/login`, {
      method: 'POST',
      body: { email: 'superadmin@retailpos.com', password: 'SuperAdminPassword123!' },
    });
    assert(platformLoginRes.status === 200, 'SuperAdmin login succeeded');
    const platformHeaders = { Authorization: `Bearer ${platformLoginRes.data.response.accessToken}` };

    const plansRes = await fetchHttp(`${baseUrl}/onboarding/plans`);
    const basicPlan = plansRes.data.response.find((p: any) => p.code === 'PLAN_BASIC') || plansRes.data.response[0];

    const tenantEmail = `tenant_cust_${Date.now()}@testmart.com`;
    const regRes = await fetchHttp(`${baseUrl}/onboarding/register`, {
      method: 'POST',
      body: {
        businessName: `Customer Isolated Mart ${Date.now()}`,
        tradeName: 'Iso Mart',
        contactEmail: tenantEmail,
        contactPhone: '+94779998888',
        ownerFirstName: 'TenantC',
        ownerLastName: 'Owner',
        password: 'TenantCPassword123!',
        planId: basicPlan.id,
        billingCycle: 'MONTHLY',
      },
    });
    assert(regRes.status === 201, 'Secondary merchant registered');
    const tenantCMerchantId = regRes.data.response.merchantId;

    await fetchHttp(`${baseUrl}/platform/merchants/${tenantCMerchantId}/approve`, {
      method: 'POST',
      headers: platformHeaders,
    });

    const tenantCLogin = await fetchHttp(`${baseUrl}/auth/merchant/login`, {
      method: 'POST',
      body: { email: tenantEmail, password: 'TenantCPassword123!' },
    });
    assert(tenantCLogin.status === 200, 'Tenant C logged in');
    const tenantCHeaders = { Authorization: `Bearer ${tenantCLogin.data.response.accessToken}` };

    // Tenant C attempts to view Tenant A's customer
    const crossRes = await fetchHttp(`${baseUrl}/customers/${customer1.id}`, {
      headers: tenantCHeaders,
    });
    assert(crossRes.status === 404, 'Cross-tenant customer access rejected with 404 Not Found');

    console.log('\n================================================================');
    console.log('🎉 ALL PHASE 11 (WP-10) CUSTOMER & LOYALTY TESTS PASSED!');
    console.log('================================================================\n');
  } finally {
    await app.close();
  }
}

runCustomerE2ETests().catch((err) => {
  console.error('E2E TEST FAILURE:', err);
  process.exit(1);
});
