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

async function runPosSessionsE2ETests() {
  console.log('================================================================');
  console.log('🚀 STARTING POS TERMINALS & CASH SESSIONS (PHASE 9 - WP-08) E2E');
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

  const testPort = 4100;
  await app.listen(testPort);
  const baseUrl = `http://localhost:${testPort}/api/v1`;

  try {
    // -----------------------------------------------------------------
    // STEP 1: Merchant Owner Authentication & Branch Setup
    // -----------------------------------------------------------------
    console.log('👉 [Step 1] Merchant Owner Authentication');
    const loginRes = await fetchHttp(`${baseUrl}/auth/merchant/login`, {
      method: 'POST',
      body: { email: 'owner@urbanmart.com', password: 'UrbanOwner123!' },
    });
    assert(loginRes.status === 200, 'Merchant Owner login succeeds');
    const token = loginRes.data.response.accessToken;
    const authHeaders = { Authorization: `Bearer ${token}` };

    const branchRes = await fetchHttp(`${baseUrl}/merchant/branches`, { headers: authHeaders });
    assert(branchRes.status === 200, 'Branches fetched successfully');
    const branches = branchRes.data.response.items || branchRes.data.response;
    const branch = branches[0];

    // -----------------------------------------------------------------
    // STEP 2: POS Terminal Registration
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 2] POS Terminal Registration');
    const term1Code = `POS-${Date.now().toString().slice(-4)}-1`;
    const term2Code = `POS-${Date.now().toString().slice(-4)}-2`;

    const createTerm1Res = await fetchHttp(`${baseUrl}/pos/terminals`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        branchId: branch.id,
        code: term1Code,
        name: 'Express Lane Counter 1',
        hardwareIdentifier: 'HW-TOUCH-001',
      },
    });
    assert(createTerm1Res.status === 201, 'Terminal 1 created successfully', createTerm1Res.data);
    const terminal1 = createTerm1Res.data.response;

    const createTerm2Res = await fetchHttp(`${baseUrl}/pos/terminals`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        branchId: branch.id,
        code: term2Code,
        name: 'Main Customer Service Counter',
        hardwareIdentifier: 'HW-TOUCH-002',
      },
    });
    assert(createTerm2Res.status === 201, 'Terminal 2 created successfully', createTerm2Res.data);
    const terminal2 = createTerm2Res.data.response;

    // Duplicate terminal code within branch check
    const dupTermRes = await fetchHttp(`${baseUrl}/pos/terminals`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        branchId: branch.id,
        code: term1Code,
        name: 'Duplicate Register',
      },
    });
    assert(dupTermRes.status === 409, 'Duplicate terminal code rejected with 409 Conflict');

    // List terminals
    const listTermsRes = await fetchHttp(`${baseUrl}/pos/terminals?branchId=${branch.id}`, {
      headers: authHeaders,
    });
    assert(listTermsRes.status === 200, 'Terminals listed successfully');
    const termList = listTermsRes.data.response.items || listTermsRes.data.response;
    assert(termList.length >= 2, 'At least 2 terminals exist');
    const foundT1 = termList.find((t: any) => t.id === terminal1.id);
    assert(foundT1.hasActiveSession === false, 'Terminal 1 hasActiveSession is initially false');

    // -----------------------------------------------------------------
    // STEP 3: Open Cash Drawer Session & Invariants
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 3] Open Cash Drawer Session');
    const openSessionRes = await fetchHttp(`${baseUrl}/pos/sessions/open`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        posTerminalId: terminal1.id,
        openingFloat: 10000.0,
        notes: 'Morning Shift 08:00 - 16:00',
      },
    });
    assert(openSessionRes.status === 201, 'Cash drawer session opened successfully', openSessionRes.data);
    const session1 = openSessionRes.data.response;
    assert(session1.status === 'OPEN', 'Session status is OPEN');
    assert(Number(session1.openingFloat) === 10000, 'Opening float is LKR 10,000');
    assert(session1.openedAt !== null, 'openedAt timestamp is set');

    // Check terminal inspection now reports activeSession = true
    const term1Inspect = await fetchHttp(`${baseUrl}/pos/terminals/${terminal1.id}`, {
      headers: authHeaders,
    });
    assert(term1Inspect.data.response.hasActiveSession === true, 'Terminal 1 now reports hasActiveSession = true');

    // Invariant Check 1: Terminal cannot have multiple concurrent open sessions
    const dupTerminalOpenRes = await fetchHttp(`${baseUrl}/pos/sessions/open`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        posTerminalId: terminal1.id,
        openingFloat: 5000,
      },
    });
    assert(
      dupTerminalOpenRes.status === 409,
      'Opening 2nd session on same terminal rejected with 409 Conflict',
    );

    // Invariant Check 2: Same cashier cannot open a 2nd terminal concurrently
    const dupCashierOpenRes = await fetchHttp(`${baseUrl}/pos/sessions/open`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        posTerminalId: terminal2.id,
        openingFloat: 5000,
      },
    });
    assert(
      dupCashierOpenRes.status === 409,
      'Cashier opening 2nd terminal concurrently rejected with 409 Conflict',
    );

    // -----------------------------------------------------------------
    // STEP 4: Cash Drawer Operations (CASH_IN & CASH_OUT)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 4] Cash Drawer Operations (CASH_IN & CASH_OUT)');
    // Operation 1: Float top-up (CASH_IN 5,000)
    const cashInRes = await fetchHttp(`${baseUrl}/pos/sessions/${session1.id}/transactions`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        type: 'CASH_IN',
        amount: 5000,
        reason: 'Midday small coin and note float top-up',
      },
    });
    assert(cashInRes.status === 201, 'CASH_IN operation recorded');
    assert(Number(cashInRes.data.response.amount) === 5000, 'Cash in amount is 5,000');

    // Operation 2: Safe drop (CASH_OUT 7,000)
    const cashOutRes = await fetchHttp(`${baseUrl}/pos/sessions/${session1.id}/transactions`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        type: 'CASH_OUT',
        amount: 7000,
        reason: 'Surplus cash transfer to manager vault',
      },
    });
    assert(cashOutRes.status === 201, 'CASH_OUT operation recorded');

    // Operation 3: Overdraft prevention (CASH_OUT 80,000 exceeds available in drawer)
    const failCashOut = await fetchHttp(`${baseUrl}/pos/sessions/${session1.id}/transactions`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        type: 'CASH_OUT',
        amount: 80000,
        reason: 'Attempt unauthorized drawer deficit',
      },
    });
    assert(
      failCashOut.status === 400,
      'CASH_OUT exceeding drawer cash rejected with 400 Bad Request',
    );

    // -----------------------------------------------------------------
    // STEP 5: Live Active Session Running Breakdown
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 5] Active Session Running Breakdown');
    const activeRes = await fetchHttp(`${baseUrl}/pos/sessions/active?posTerminalId=${terminal1.id}`, {
      headers: authHeaders,
    });
    assert(activeRes.status === 200, 'Active session queried successfully');
    const activeSummary = activeRes.data.response.summary;
    // Expected: 10,000 (float) + 5,000 (in) - 7,000 (out) = 8,000
    assert(activeSummary.openingFloat === 10000, 'Running summary reports openingFloat = 10,000');
    assert(activeSummary.totalCashIn === 5000, 'Running summary reports totalCashIn = 5,000');
    assert(activeSummary.totalCashOut === 7000, 'Running summary reports totalCashOut = 7,000');
    assert(activeSummary.currentExpectedCash === 8000, 'Running summary reports currentExpectedCash = 8,000');

    // -----------------------------------------------------------------
    // STEP 6: Close Session & Discrepancy Calculation (Overage)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 6] Close Session & Discrepancy Analysis');
    // Cashier physically counts 8,050 (50 LKR overage)
    const closeRes = await fetchHttp(`${baseUrl}/pos/sessions/${session1.id}/close`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        closingCashActual: 8050,
        notes: 'Shift completed. Verified by supervisor.',
      },
    });
    assert(closeRes.status === 200, 'Session closed successfully', closeRes.data);
    const closedSession = closeRes.data.response;
    assert(closedSession.status === 'CLOSED', 'Status updated to CLOSED');
    assert(Number(closedSession.closingCashExpected) === 8000, 'Expected cash calculated as 8,000');
    assert(Number(closedSession.closingCashActual) === 8050, 'Actual cash recorded as 8,050');
    assert(Number(closedSession.difference) === 50, 'Discrepancy calculated as +50 (Overage)');
    assert(closedSession.closedAt !== null, 'closedAt timestamp is set');

    // Terminal is now released
    const term1AfterClose = await fetchHttp(`${baseUrl}/pos/terminals/${terminal1.id}`, {
      headers: authHeaders,
    });
    assert(
      term1AfterClose.data.response.hasActiveSession === false,
      'Terminal 1 is freed (hasActiveSession = false)',
    );

    // Transactions cannot be added to closed sessions
    const postClosedTx = await fetchHttp(`${baseUrl}/pos/sessions/${session1.id}/transactions`, {
      method: 'POST',
      headers: authHeaders,
      body: { type: 'CASH_IN', amount: 100, reason: 'Late drop' },
    });
    assert(postClosedTx.status === 400, 'Adding transaction to closed session rejected with 400 Bad Request');

    // -----------------------------------------------------------------
    // STEP 7: Manager Reconciliation Sign-off
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 7] Manager Reconciliation Sign-off');
    const reconcileRes = await fetchHttp(`${baseUrl}/pos/sessions/${session1.id}/reconcile`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        notes: 'Manager approved: 50 LKR rounding overage accepted',
      },
    });
    assert(reconcileRes.status === 200, 'Session reconciled successfully', reconcileRes.data);
    assert(reconcileRes.data.response.status === 'RECONCILED', 'Status transitioned to RECONCILED');

    // Cannot reconcile already reconciled session
    const dupReconcile = await fetchHttp(`${baseUrl}/pos/sessions/${session1.id}/reconcile`, {
      method: 'POST',
      headers: authHeaders,
      body: { notes: 'Duplicate' },
    });
    assert(dupReconcile.status === 400, 'Re-reconciling session rejected with 400 Bad Request');

    // -----------------------------------------------------------------
    // STEP 8: Shortage Shift Lifecycle (Terminal 2)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 8] Shortage Shift Lifecycle');
    // Open on Terminal 2
    const open2Res = await fetchHttp(`${baseUrl}/pos/sessions/open`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        posTerminalId: terminal2.id,
        openingFloat: 15000,
        notes: 'Terminal 2 Shift',
      },
    });
    const session2 = open2Res.data.response;

    // CASH_IN 2,000 -> Expected is 17,000
    await fetchHttp(`${baseUrl}/pos/sessions/${session2.id}/transactions`, {
      method: 'POST',
      headers: authHeaders,
      body: { type: 'CASH_IN', amount: 2000, reason: 'Denomination swap' },
    });

    // Close with 16,800 -> Shortage of -200
    const close2Res = await fetchHttp(`${baseUrl}/pos/sessions/${session2.id}/close`, {
      method: 'POST',
      headers: authHeaders,
      body: { closingCashActual: 16800, notes: 'Missing 200 LKR' },
    });
    assert(close2Res.status === 200, 'Session 2 closed');
    assert(Number(close2Res.data.response.difference) === -200, 'Discrepancy calculated as -200 (Shortage)');

    // Reconcile Session 2
    const rec2Res = await fetchHttp(`${baseUrl}/pos/sessions/${session2.id}/reconcile`, {
      method: 'POST',
      headers: authHeaders,
      body: { notes: 'Shortage logged for investigation' },
    });
    assert(rec2Res.status === 200, 'Session 2 reconciled');

    // -----------------------------------------------------------------
    // STEP 9: Cross-Tenant Security Isolation
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 9] Cross-Tenant Security Isolation');
    const fakeMerchantId = 'c0000000-0000-0000-0000-000000000099';
    const maliciousReq = await fetchHttp(
      `${baseUrl}/pos/sessions?merchantId=${fakeMerchantId}`,
      { headers: authHeaders },
    );
    assert(
      maliciousReq.status === 403,
      'Cross-tenant query rejected with 403 Forbidden by TenantGuard',
    );

    console.log('\n================================================================');
    console.log('🎉 ALL POS TERMINAL & CASH SESSION (PHASE 9) TESTS PASSED!');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ POS SESSIONS E2E TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

runPosSessionsE2ETests();
