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
  cookies: Record<string, string>;
}

async function fetchHttp<T = any>(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    cookies?: Record<string, string>;
  } = {},
): Promise<HttpResponse<T>> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (options.cookies) {
    headers['Cookie'] = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

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

  const cookies: Record<string, string> = {};
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const parts = setCookie.split(';');
    const [name, ...val] = parts[0]!.split('=');
    if (name) {
      cookies[name.trim()] = val.join('=').trim();
    }
  }

  return {
    status: res.status,
    data,
    headers: responseHeaders,
    cookies,
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED ASSERTION: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✔ PASSED: ${message}`);
}

async function runE2ETests() {
  console.log('================================================================');
  console.log('🚀 STARTING PLATFORM ADMIN & ONBOARDING (PHASES 4 & 5) E2E TESTS');
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

  const testPort = 4098;
  await app.listen(testPort);
  const baseUrl = `http://localhost:${testPort}/api/v1`;

  try {
    // -----------------------------------------------------------------
    // STEP 1: Platform SuperAdmin Authentication
    // -----------------------------------------------------------------
    console.log('👉 [Step 1] Platform SuperAdmin Authentication');
    const adminLoginRes = await fetchHttp(`${baseUrl}/auth/platform/login`, {
      method: 'POST',
      body: { email: 'superadmin@retailpos.com', password: 'SuperAdminPassword123!' },
    });
    assert(adminLoginRes.status === 200, 'SuperAdmin login succeeds');
    const adminToken = adminLoginRes.data.response.accessToken;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    // -----------------------------------------------------------------
    // STEP 2: Query Public Subscription Plans
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 2] Query Public Subscription Plans');
    const plansRes = await fetchHttp(`${baseUrl}/onboarding/plans`);
    assert(plansRes.status === 200, 'Public plans endpoint returns 200');
    assert(Array.isArray(plansRes.data.response), 'Returns array of plans');
    const basicPlan = plansRes.data.response.find((p: any) => p.code === 'PLAN_BASIC');
    assert(basicPlan !== undefined, 'PLAN_BASIC is available in public plans');
    console.log(`  ℹ Selected Plan: ${basicPlan.name} (Max Branches: ${basicPlan.maxBranches})`);

    // -----------------------------------------------------------------
    // STEP 3: Public Merchant Self-Registration (Workflow WF-01)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 3] Merchant Self-Registration & Onboarding');
    const registerPayload = {
      businessName: 'Nova Supermarket Chain Ltd',
      tradeName: 'Nova Mart',
      taxNumber: 'VAT-998877665',
      contactEmail: `nova_${Date.now()}@novaretail.com`,
      contactPhone: '+94779998888',
      ownerFirstName: 'Rohan',
      ownerLastName: 'Fernando',
      password: 'NovaPassword123!',
      planId: basicPlan.id,
      billingCycle: 'MONTHLY',
    };

    const registerRes = await fetchHttp(`${baseUrl}/onboarding/register`, {
      method: 'POST',
      body: registerPayload,
    });
    assert(registerRes.status === 201, 'Registration returns 201 Created');
    assert(registerRes.data.responseCode === 'SUCCESS', 'Response code is SUCCESS');
    const merchantId = registerRes.data.response.merchantId;
    const merchantCode = registerRes.data.response.merchantCode;
    const initialInvoice = registerRes.data.response.invoice;
    assert(typeof merchantId === 'string', 'Returns generated merchantId');
    assert(merchantCode.startsWith('MCH-'), 'Generates human-readable merchant code');
    assert(registerRes.data.response.status === 'PENDING_APPROVAL', 'Initial status is PENDING_APPROVAL');
    assert(initialInvoice.status === 'ISSUED', 'Initial subscription invoice is ISSUED');
    assert(registerRes.data.response.branch.code === 'BR-001', 'Default main branch created');
    assert(registerRes.data.response.warehouse.code === 'WH-001', 'Default main warehouse created');

    // -----------------------------------------------------------------
    // STEP 4: Platform Admin Listing & Approval (Workflow WF-02)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 4] Platform Admin Merchant Management & Approval');
    const listMerchantsRes = await fetchHttp(`${baseUrl}/platform/merchants?status=PENDING_APPROVAL`, {
      headers: adminHeaders,
    });
    assert(listMerchantsRes.status === 200, 'Admin can list pending merchants');
    assert(listMerchantsRes.data.meta.total >= 1, 'Pagination meta reflects pending count');

    const approveRes = await fetchHttp(`${baseUrl}/platform/merchants/${merchantId}/approve`, {
      method: 'POST',
      headers: adminHeaders,
    });
    assert(approveRes.status === 200, 'Admin successfully approves merchant');
    assert(approveRes.data.response.status === 'ACTIVE', 'Merchant status is now ACTIVE');

    // -----------------------------------------------------------------
    // STEP 5: Platform Subscription Plan Creation & Modification
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 5] Platform Plan Management');
    const newPlanCode = `PLAN_CUSTOM_${Date.now().toString().slice(-4)}`;
    const createPlanRes = await fetchHttp(`${baseUrl}/platform/plans`, {
      method: 'POST',
      headers: adminHeaders,
      body: {
        name: 'Enterprise Flagship Tier',
        code: newPlanCode,
        tier: 'ENTERPRISE',
        priceMonthly: 35000,
        priceQuarterly: 100000,
        priceAnnually: 350000,
        maxBranches: 25,
        maxWarehouses: 15,
        maxUsers: 150,
        maxProducts: 100000,
        hasOfflinePos: true,
        hasAdvancedAccounting: true,
      },
    });
    assert(createPlanRes.status === 201, 'Platform Admin creates custom subscription plan');
    const createdPlanId = createPlanRes.data.response.id;

    const updatePlanRes = await fetchHttp(`${baseUrl}/platform/plans/${createdPlanId}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: { priceMonthly: 38000 },
    });
    assert(updatePlanRes.status === 200, 'Platform Admin updates plan pricing');
    assert(Number(updatePlanRes.data.response.priceMonthly) === 38000, 'Price updated to 38000');

    // -----------------------------------------------------------------
    // STEP 6: Manual Bank Deposit Slip Submission & Verification (Workflow WF-03)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 6] Manual Bank Deposit Slip Verification Workflow');
    const submitSlipRes = await fetchHttp(`${baseUrl}/platform/payments/submit-slip`, {
      method: 'POST',
      body: {
        invoiceId: initialInvoice.id,
        amountSubmitted: initialInvoice.amount,
        transactionReference: 'BOC-DEP-8849201',
        bankSlipUrl: 'https://storage.retailpos.com/slips/slip-nova-001.jpg',
        notes: 'Cash deposit made at Colombo main branch',
      },
    });
    assert(submitSlipRes.status === 201, 'Bank slip submitted successfully');
    const verificationId = submitSlipRes.data.response.id;
    assert(submitSlipRes.data.response.status === 'PENDING_VERIFICATION', 'Verification status is PENDING_VERIFICATION');

    // Admin verifies bank slip
    const approveSlipRes = await fetchHttp(`${baseUrl}/platform/payments/verifications/${verificationId}/approve`, {
      method: 'POST',
      headers: adminHeaders,
      body: { notes: 'Bank statement matched' },
    });
    assert(approveSlipRes.status === 200, 'Admin approves bank slip verification');
    assert(approveSlipRes.data.response.status === 'VERIFIED', 'Verification marked VERIFIED');

    // -----------------------------------------------------------------
    // STEP 7: Merchant Organization & Plan Limit Enforcement (Phase 5 / WP-04)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 7] Merchant Organization & Plan Limit Enforcement');
    // Merchant Owner logs in
    const merchantLoginRes = await fetchHttp(`${baseUrl}/auth/merchant/login`, {
      method: 'POST',
      body: { email: registerPayload.contactEmail, password: registerPayload.password },
    });
    assert(merchantLoginRes.status === 200, 'Merchant Owner logs in');
    const merchantToken = merchantLoginRes.data.response.accessToken;
    const merchantHeaders = { Authorization: `Bearer ${merchantToken}` };

    // List branches
    const listBranchesRes = await fetchHttp(`${baseUrl}/merchant/branches`, {
      headers: merchantHeaders,
    });
    assert(listBranchesRes.status === 200, 'Lists merchant branches');
    assert(listBranchesRes.data.response.length === 1, 'Currently has 1 branch (BR-001)');

    // Attempt to exceed plan limit: PLAN_BASIC only allows 1 branch!
    console.log('  ℹ Testing Plan Constraint: attempting to create 2nd branch on PLAN_BASIC (max 1)...');
    const exceedBranchRes = await fetchHttp(`${baseUrl}/merchant/branches`, {
      method: 'POST',
      headers: merchantHeaders,
      body: {
        code: 'BR-002',
        name: 'Second Store Extension',
      },
    });
    assert(
      exceedBranchRes.status === 403,
      'Exceeding branch limit correctly blocked with 403 Forbidden',
    );
    assert(
      exceedBranchRes.data.responseMessage.includes('Branch limit reached'),
      'Error message clearly communicates plan quota limit',
    );

    // Create a Custom Role
    console.log('  ℹ Creating custom role...');
    const createRoleRes = await fetchHttp(`${baseUrl}/merchant/roles`, {
      method: 'POST',
      headers: merchantHeaders,
      body: {
        name: 'Shift Supervisor',
        description: 'Store shift supervisor with void and discount privileges',
        permissions: ['pos.sale.create', 'pos.sale.void', 'pos.discount.apply'],
      },
    });
    assert(createRoleRes.status === 201, 'Custom role created');
    const customRole = createRoleRes.data.response;

    // Create a Staff User with the Custom Role
    console.log('  ℹ Creating staff cashier...');
    const createUserRes = await fetchHttp(`${baseUrl}/merchant/users`, {
      method: 'POST',
      headers: merchantHeaders,
      body: {
        email: `cashier_${Date.now()}@novaretail.com`,
        password: 'CashierPassword123!',
        firstName: 'Dinesh',
        lastName: 'Silva',
        role: 'CUSTOM',
        customRoleId: customRole.id,
        branchIds: [registerRes.data.response.branch.id],
      },
    });
    assert(createUserRes.status === 201, 'Staff member created successfully');
    assert(createUserRes.data.response.role === 'CUSTOM', 'User assigned CUSTOM role');

    // -----------------------------------------------------------------
    // STEP 8: Merchant Suspension & Real-Time Security Revocation
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 8] Platform Suspension & Active Session Revocation');
    const suspendRes = await fetchHttp(`${baseUrl}/platform/merchants/${merchantId}/suspend`, {
      method: 'POST',
      headers: adminHeaders,
      body: { reason: 'Regulatory compliance investigation' },
    });
    assert(suspendRes.status === 200, 'Merchant suspended by Platform Admin');
    assert(suspendRes.data.response.status === 'SUSPENDED', 'Merchant status is SUSPENDED');

    // Verify merchant user can no longer log in
    const blockedLoginRes = await fetchHttp(`${baseUrl}/auth/merchant/login`, {
      method: 'POST',
      body: { email: registerPayload.contactEmail, password: registerPayload.password },
    });
    assert(
      blockedLoginRes.status === 403,
      'Suspended merchant login blocked with 403 Forbidden',
    );

    console.log('\n================================================================');
    console.log('🎉 ALL PHASES 4 & 5 E2E INTEGRATION TESTS PASSED CLEANLY!');
    console.log('================================================================\n');
  } finally {
    await app.close();
  }
}

runE2ETests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
