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

async function runPosSyncE2ETests() {
  console.log('================================================================');
  console.log('🚀 STARTING OFFLINE POS SYNC ENGINE (PHASE 14 - WP-13) E2E');
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

  const testPort = 4105;
  await app.listen(testPort);
  const baseUrl = `http://localhost:${testPort}/api/v1`;

  try {
    // -----------------------------------------------------------------
    // STEP 1: Merchant Owner Authentication & Setup
    // -----------------------------------------------------------------
    console.log('👉 [Step 1] Merchant Owner Authentication');
    const loginRes = await fetchHttp(`${baseUrl}/auth/merchant/login`, {
      method: 'POST',
      body: { email: 'owner@urbanmart.com', password: 'UrbanOwner123!' },
    });
    assert(loginRes.status === 200, 'Merchant Owner login succeeds');
    const token = loginRes.data.response.accessToken;
    const authHeaders = { Authorization: `Bearer ${token}` };

    const branchesRes = await fetchHttp(`${baseUrl}/merchant/branches`, { headers: authHeaders });
    const branch = branchesRes.data.response[0];
    const warehousesRes = await fetchHttp(`${baseUrl}/merchant/warehouses`, { headers: authHeaders });
    const warehouse = warehousesRes.data.response[0];

    const catalogRes = await fetchHttp(`${baseUrl}/catalog/products?limit=5`, { headers: authHeaders });
    const product = catalogRes.data.response[0];
    const variant = product.variants[0];
    const unitPrice = Number(variant.sellingPrice);

    // Replenish stock
    await fetchHttp(`${baseUrl}/inventory/adjustments`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        warehouseId: warehouse.id,
        reason: 'Restocking for offline sync tests',
        items: [
          {
            variantId: variant.id,
            type: 'POSITIVE',
            quantity: 100.0,
            unitCost: Number(variant.costPrice) || 450,
          },
        ],
      },
    });

    // Check or open active cash session
    const activeSessionRes = await fetchHttp(`${baseUrl}/pos/sessions/active`, {
      headers: authHeaders,
    });
    let terminal: any;
    let session: any;

    if (activeSessionRes.data?.response) {
      session = activeSessionRes.data.response;
      terminal = session.posTerminal;
    } else {
      const termCode = `SYNC-${Date.now().toString().slice(-4)}`;
      const createTermRes = await fetchHttp(`${baseUrl}/pos/terminals`, {
        method: 'POST',
        headers: authHeaders,
        body: {
          branchId: branch.id,
          code: termCode,
          name: 'Sync Test Terminal',
          hardwareIdentifier: `HW-SYNC-${Date.now()}`,
        },
      });
      terminal = createTermRes.data.response;

      const openSessionRes = await fetchHttp(`${baseUrl}/pos/sessions/open`, {
        method: 'POST',
        headers: authHeaders,
        body: {
          posTerminalId: terminal.id,
          openingFloat: 5000.0,
          notes: 'Sync test session',
        },
      });
      session = openSessionRes.data.response;
    }

    // -----------------------------------------------------------------
    // STEP 2: Incremental Catalog Delta Sync
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 2] Incremental Catalog Delta Sync');
    const initialDeltaRes = await fetchHttp(`${baseUrl}/pos/sync/catalog-delta`, {
      headers: authHeaders,
    });
    assert(initialDeltaRes.status === 200, 'Initial catalog delta sync returns 200');
    const initialDelta = initialDeltaRes.data.response;
    assert(!!initialDelta.serverTimestamp, 'Returns server timestamp watermark');
    assert(initialDelta.delta.productsCount >= 1, 'Initial delta contains full catalog products');
    const watermark = initialDelta.serverTimestamp;

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 50));

    // Update product to create a delta change
    const updatedName = `${product.name} (Sync Verified)`;
    await fetchHttp(`${baseUrl}/catalog/products/${product.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: { name: updatedName },
    });

    // Fetch delta since watermark
    const subsequentDeltaRes = await fetchHttp(
      `${baseUrl}/pos/sync/catalog-delta?since=${encodeURIComponent(watermark)}`,
      { headers: authHeaders },
    );
    assert(subsequentDeltaRes.status === 200, 'Subsequent delta sync succeeds');
    const subDelta = subsequentDeltaRes.data.response;
    assert(subDelta.delta.productsCount >= 1, 'Incremental delta captures modified product');
    const modifiedProd = subDelta.delta.products.find((p: any) => p.id === product.id);
    assert(modifiedProd && modifiedProd.name === updatedName, 'Modified product returned in delta');

    // -----------------------------------------------------------------
    // STEP 3: Single Offline Sale Synchronization
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 3] Single Offline Sale Synchronization');
    const clientOpId1 = `offline-op-${Date.now()}-1`;

    const singleSaleSyncRes = await fetchHttp(`${baseUrl}/pos/sync/batch`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        sales: [
          {
            clientOperationId: clientOpId1,
            branchId: branch.id,
            warehouseId: warehouse.id,
            posTerminalId: terminal.id,
            cashSessionId: session.id,
            completedAt: new Date().toISOString(),
            offlineInvoiceNumber: 'OFFLINE-INV-001',
            items: [
              {
                variantId: variant.id,
                quantity: 2.0,
                unitPrice,
              },
            ],
            payments: [
              {
                tenderType: 'CASH',
                amount: unitPrice * 2,
              },
            ],
          },
        ],
      },
    });
    assert(singleSaleSyncRes.status === 200, 'Single offline sale batch processed', singleSaleSyncRes.data);
    const syncRes1 = singleSaleSyncRes.data.response;
    assert(syncRes1.summary.totalSubmitted === 1, '1 sale submitted');
    assert(syncRes1.summary.totalProcessed === 1, '1 sale processed');
    assert(syncRes1.summary.totalDuplicates === 0, '0 duplicates');
    assert(syncRes1.processedSales[0].status === 'SYNCED', 'Sale marked as SYNCED');
    const syncedSaleId = syncRes1.processedSales[0].saleId;

    // Verify sale persisted in database with isOfflineSync = true
    const saleCheck = await fetchHttp(`${baseUrl}/pos/sales/${syncedSaleId}`, { headers: authHeaders });
    assert(saleCheck.data.response.isOfflineSync === true, 'Sale has isOfflineSync set to true');

    // -----------------------------------------------------------------
    // STEP 4: Idempotency & Resubmission of Synced Offline Sale
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 4] Idempotency Check on Resubmitted Batch');
    const dupSyncRes = await fetchHttp(`${baseUrl}/pos/sync/batch`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        sales: [
          {
            clientOperationId: clientOpId1, // Duplicate ID!
            branchId: branch.id,
            warehouseId: warehouse.id,
            completedAt: new Date().toISOString(),
            items: [{ variantId: variant.id, quantity: 2.0, unitPrice }],
            payments: [{ tenderType: 'CASH', amount: unitPrice * 2 }],
          },
        ],
      },
    });
    assert(dupSyncRes.status === 200, 'Duplicate submission processed without error');
    const dupResult = dupSyncRes.data.response;
    assert(dupResult.summary.totalDuplicates === 1, 'Duplicate counted');
    assert(dupResult.summary.totalProcessed === 0, '0 new processed');
    assert(dupResult.processedSales[0].status === 'ALREADY_SYNCED', 'Sale marked as ALREADY_SYNCED');
    assert(dupResult.processedSales[0].saleId === syncedSaleId, 'Returned original sale UUID');

    // -----------------------------------------------------------------
    // STEP 5: Mixed Batch Sync (Multiple Sales + Offline Cash In)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 5] Mixed Batch Sync (Multiple Sales & Cash Movement)');
    const clientOpId2 = `offline-op-${Date.now()}-2`;
    const clientOpId3 = `offline-op-${Date.now()}-3`;
    const clientOpCash = `offline-cash-${Date.now()}`;

    const mixedBatchRes = await fetchHttp(`${baseUrl}/pos/sync/batch`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        sales: [
          {
            clientOperationId: clientOpId2,
            branchId: branch.id,
            warehouseId: warehouse.id,
            completedAt: new Date().toISOString(),
            items: [{ variantId: variant.id, quantity: 1.0, unitPrice }],
            payments: [{ tenderType: 'CASH', amount: unitPrice }],
          },
          {
            clientOperationId: clientOpId3,
            branchId: branch.id,
            warehouseId: warehouse.id,
            completedAt: new Date().toISOString(),
            items: [{ variantId: variant.id, quantity: 3.0, unitPrice }],
            payments: [{ tenderType: 'CARD', amount: unitPrice * 3, referenceNumber: 'AUTH-OFFLINE-9922' }],
          },
        ],
        cashTransactions: [
          {
            clientOperationId: clientOpCash,
            sessionId: session.id,
            type: 'CASH_IN',
            amount: 3500.0,
            reason: 'Offline safe drop collected float top-up',
            occurredAt: new Date().toISOString(),
          },
        ],
      },
    });
    assert(mixedBatchRes.status === 200, 'Mixed batch sync succeeds');
    const mixedResult = mixedBatchRes.data.response;
    assert(mixedResult.summary.totalSubmitted === 3, 'Total 3 items submitted');
    assert(mixedResult.summary.totalProcessed === 3, 'Total 3 items successfully processed');
    assert(mixedResult.summary.isFullySynchronized === true, 'isFullySynchronized is true');
    assert(mixedResult.processedCashTransactions[0].status === 'SYNCED', 'Cash transaction SYNCED');

    // -----------------------------------------------------------------
    // STEP 6: Partial Failure Fault Isolation
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 6] Partial Failure Fault Isolation in Batch');
    const clientOpGood = `offline-good-${Date.now()}`;
    const clientOpBad = `offline-bad-${Date.now()}`;

    const partialFailRes = await fetchHttp(`${baseUrl}/pos/sync/batch`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        sales: [
          {
            clientOperationId: clientOpGood,
            branchId: branch.id,
            warehouseId: warehouse.id,
            completedAt: new Date().toISOString(),
            items: [{ variantId: variant.id, quantity: 1.0, unitPrice }],
            payments: [{ tenderType: 'CASH', amount: unitPrice }],
          },
          {
            clientOperationId: clientOpBad,
            branchId: branch.id,
            warehouseId: warehouse.id,
            completedAt: new Date().toISOString(),
            items: [
              {
                variantId: '00000000-0000-4000-8000-000000000000', // Non-existent variant!
                quantity: 1.0,
                unitPrice: 500,
              },
            ],
            payments: [{ tenderType: 'CASH', amount: 500 }],
          },
        ],
      },
    });
    assert(partialFailRes.status === 200, 'Batch endpoint returns 200 without crashing');
    const partialResult = partialFailRes.data.response;
    assert(partialResult.summary.totalProcessed === 1, 'Good sale processed');
    assert(partialResult.summary.totalFailed === 1, 'Bad sale counted as failed');
    assert(partialResult.summary.isFullySynchronized === false, 'isFullySynchronized is false');

    const goodSale = partialResult.processedSales.find((s: any) => s.clientOperationId === clientOpGood);
    const badSale = partialResult.processedSales.find((s: any) => s.clientOperationId === clientOpBad);
    assert(goodSale && goodSale.status === 'SYNCED', 'Good sale status is SYNCED');
    assert(badSale && badSale.status === 'FAILED', 'Bad sale status is FAILED');
    assert(typeof badSale.error === 'string', 'Failure captures specific error message');

    // -----------------------------------------------------------------
    // STEP 7: Multi-Tenant Cross-Merchant Isolation
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 7] Multi-Tenant Isolation');
    const platformLoginRes = await fetchHttp(`${baseUrl}/auth/platform/login`, {
      method: 'POST',
      body: { email: 'superadmin@retailpos.com', password: 'SuperAdminPassword123!' },
    });
    const platformHeaders = { Authorization: `Bearer ${platformLoginRes.data.response.accessToken}` };

    const plansRes = await fetchHttp(`${baseUrl}/onboarding/plans`);
    const basicPlan = plansRes.data.response.find((p: any) => p.code === 'PLAN_BASIC') || plansRes.data.response[0];

    const tenantEmail = `tenant_sync_${Date.now()}@testmart.com`;
    const regRes = await fetchHttp(`${baseUrl}/onboarding/register`, {
      method: 'POST',
      body: {
        businessName: `Sync Isolated Mart ${Date.now()}`,
        tradeName: 'Sync Mart',
        contactEmail: tenantEmail,
        contactPhone: '+94779998888',
        ownerFirstName: 'TenantF',
        ownerLastName: 'Owner',
        password: 'TenantFPassword123!',
        planId: basicPlan.id,
        billingCycle: 'MONTHLY',
      },
    });
    assert(regRes.status === 201, 'Secondary merchant registered');
    const tenantFMerchantId = regRes.data.response.merchantId;

    await fetchHttp(`${baseUrl}/platform/merchants/${tenantFMerchantId}/approve`, {
      method: 'POST',
      headers: platformHeaders,
    });

    const tenantFLogin = await fetchHttp(`${baseUrl}/auth/merchant/login`, {
      method: 'POST',
      body: { email: tenantEmail, password: 'TenantFPassword123!' },
    });
    assert(tenantFLogin.status === 200, 'Tenant F logged in');
    const tenantFHeaders = { Authorization: `Bearer ${tenantFLogin.data.response.accessToken}` };

    // Tenant F queries catalog delta; should NOT see Tenant A's products
    const tenantFDeltaRes = await fetchHttp(`${baseUrl}/pos/sync/catalog-delta`, {
      headers: tenantFHeaders,
    });
    assert(tenantFDeltaRes.status === 200, 'Tenant F delta sync succeeds');
    const tenantFProducts = tenantFDeltaRes.data.response.delta.products;
    assert(
      !tenantFProducts.some((p: any) => p.id === product.id),
      'Tenant F cannot see Tenant A products in delta sync',
    );

    console.log('\n================================================================');
    console.log('🎉 ALL PHASE 14 (WP-13) OFFLINE POS SYNC TESTS PASSED!');
    console.log('================================================================\n');
  } finally {
    await app.close();
  }
}

runPosSyncE2ETests().catch((err) => {
  console.error('E2E TEST FAILURE:', err);
  process.exit(1);
});
