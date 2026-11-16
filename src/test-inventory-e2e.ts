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

async function runInventoryE2ETests() {
  console.log('================================================================');
  console.log('🚀 STARTING INVENTORY & STOCK MANAGEMENT (PHASE 7 - WP-06) E2E');
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
    // STEP 2: Ensure Warehouses Available (Main & Secondary)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 2] Warehouse Verification / Setup');
    const whRes = await fetchHttp(`${baseUrl}/merchant/warehouses`, {
      headers: authHeaders,
    });
    assert(whRes.status === 200, 'Warehouses fetched successfully');
    let warehouses = whRes.data.response.items || whRes.data.response;
    assert(warehouses.length >= 1, 'At least one default warehouse exists');

    let mainWarehouse = warehouses[0];
    let destWarehouse: any;

    if (warehouses.length < 2) {
      console.log('  Creating secondary warehouse for inter-warehouse transfer tests...');
      const createWhRes = await fetchHttp(`${baseUrl}/merchant/warehouses`, {
        method: 'POST',
        headers: authHeaders,
        body: {
          code: `WH-DEPOT-${Date.now().toString().slice(-4)}`,
          name: 'Regional Kandy Depot',
          address: '45 Lake Round Road, Kandy',
          phone: '+94812233445',
          isMain: false,
        },
      });
      assert(createWhRes.status === 201, 'Secondary warehouse created successfully');
      destWarehouse = createWhRes.data.response;
    } else {
      destWarehouse = warehouses[1];
    }

    // -----------------------------------------------------------------
    // STEP 3: Create Products for Inventory Testing
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 3] Create Test Catalog Products');
    const product1Code = `TEA-${Date.now().toString().slice(-4)}`;
    const product2Code = `HON-${Date.now().toString().slice(-4)}`;

    const p1Res = await fetchHttp(`${baseUrl}/catalog/products`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: product1Code,
        name: 'Pure Ceylon Black Tea 500g',
        unit: 'PACK',
        costPrice: 450,
        sellingPrice: 750,
        reorderPoint: 20,
      },
    });
    assert(p1Res.status === 201, 'Product 1 (Tea) created with default variant', p1Res.data);
    const product1 = p1Res.data.response;
    const variant1 = product1.variants[0];

    const p2Res = await fetchHttp(`${baseUrl}/catalog/products`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: product2Code,
        name: 'Organic Wild Bee Honey 250ml',
        unit: 'BOTTLE',
        costPrice: 800,
        sellingPrice: 1200,
        reorderPoint: 15,
      },
    });
    assert(p2Res.status === 201, 'Product 2 (Honey) created with default variant', p2Res.data);
    const product2 = p2Res.data.response;
    const variant2 = product2.variants[0];

    // -----------------------------------------------------------------
    // STEP 4: Initial Stock Balances & Low Stock Alerts
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 4] Query Initial Stock Balances & Low Stock Alerts');
    const balRes = await fetchHttp(
      `${baseUrl}/inventory/balances?warehouseId=${mainWarehouse.id}&variantId=${variant1.id}`,
      { headers: authHeaders },
    );
    assert(balRes.status === 200, 'Queried stock balance for variant 1');
    const initialBalItems = balRes.data.response.items || balRes.data.response;
    assert(initialBalItems.length >= 1, 'Initial balance record exists');
    assert(Number(initialBalItems[0].quantityOnHand) === 0, 'Initial quantity on hand is 0');
    assert(Number(initialBalItems[0].quantityAvailable) === 0, 'Initial quantity available is 0');

    // Low stock alerts
    const lowStockRes = await fetchHttp(
      `${baseUrl}/inventory/balances/low-stock?warehouseId=${mainWarehouse.id}`,
      { headers: authHeaders },
    );
    assert(lowStockRes.status === 200, 'Low stock alerts fetched successfully');
    const lowStockList = lowStockRes.data.response;
    const hasP1 = lowStockList.some((item: any) => item.variant_id === variant1.id);
    const hasP2 = lowStockList.some((item: any) => item.variant_id === variant2.id);
    assert(hasP1 && hasP2, 'Both zero-stock items appear in low stock alerts');

    // -----------------------------------------------------------------
    // STEP 5: Positive Stock Adjustment (Cycle Count Intake)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 5] Positive Stock Adjustment (Intake)');
    const adjPositiveRes = await fetchHttp(`${baseUrl}/inventory/adjustments`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        warehouseId: mainWarehouse.id,
        reason: 'Opening stock cycle count intake',
        items: [
          {
            variantId: variant1.id,
            type: 'POSITIVE',
            quantity: 100,
            unitCost: 450,
          },
          {
            variantId: variant2.id,
            type: 'POSITIVE',
            quantity: 50,
            unitCost: 800,
          },
        ],
      },
    });
    assert(adjPositiveRes.status === 201, 'Positive stock adjustment created');
    const adjPositive = adjPositiveRes.data.response;
    assert(adjPositive.adjustmentNumber.startsWith('ADJ-'), 'Adjustment number generated with ADJ- prefix');
    assert(adjPositive.items.length === 2, '2 items processed in adjustment');

    // Verify balances updated
    const balP1After = await fetchHttp(
      `${baseUrl}/inventory/balances/${mainWarehouse.id}/${variant1.id}`,
      { headers: authHeaders },
    );
    assert(balP1After.status === 200, 'Fetched updated balance for Product 1');
    assert(Number(balP1After.data.response.quantityOnHand) === 100, 'Product 1 stock is now 100');
    assert(Number(balP1After.data.response.quantityAvailable) === 100, 'Product 1 available is now 100');

    const balP2After = await fetchHttp(
      `${baseUrl}/inventory/balances/${mainWarehouse.id}/${variant2.id}`,
      { headers: authHeaders },
    );
    assert(Number(balP2After.data.response.quantityOnHand) === 50, 'Product 2 stock is now 50');

    // Verify inventory valuation
    const allBalRes = await fetchHttp(
      `${baseUrl}/inventory/balances?warehouseId=${mainWarehouse.id}`,
      { headers: authHeaders },
    );
    assert(allBalRes.status === 200, 'Fetched warehouse stock balances with valuation');
    // total valuation = (100 * 450) + (50 * 800) = 45000 + 40000 = 85000
    const valuation = allBalRes.data.response.summary?.totalInventoryValuation;
    assert(valuation >= 85000, `Aggregated inventory valuation calculated (LKR ${valuation})`);

    // -----------------------------------------------------------------
    // STEP 6: Strictly Append-Only Inventory Movements Ledger
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 6] Append-Only Movements Audit Ledger');
    const movementsRes = await fetchHttp(
      `${baseUrl}/inventory/movements?warehouseId=${mainWarehouse.id}&referenceType=ADJUSTMENT`,
      { headers: authHeaders },
    );
    assert(movementsRes.status === 200, 'Inventory movements queried');
    const movements = movementsRes.data.response.items || movementsRes.data.response;
    assert(movements.length >= 2, 'Movements ledger recorded intake operations');
    const p1Movement = movements.find((m: any) => m.variantId === variant1.id);
    assert(p1Movement.movementType === 'ADJUSTMENT_POSITIVE', 'Movement type is ADJUSTMENT_POSITIVE');
    assert(Number(p1Movement.quantity) === 100, 'Movement quantity is +100');
    assert(Number(p1Movement.runningBalance) === 100, 'Running balance is recorded as 100');

    // -----------------------------------------------------------------
    // STEP 7: Negative Stock Adjustment & Over-deduction Prevention
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 7] Negative Stock Adjustment & Over-deduction Check');
    // Test over-deduction prevention
    const failAdjRes = await fetchHttp(`${baseUrl}/inventory/adjustments`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        warehouseId: mainWarehouse.id,
        reason: 'Attempt invalid over-deduction',
        items: [
          {
            variantId: variant1.id,
            type: 'NEGATIVE',
            quantity: 9999, // exceeds 100
          },
        ],
      },
    });
    assert(failAdjRes.status === 400, 'Over-deduction is properly rejected with 400 Bad Request');

    // Valid negative adjustment: 5 units damaged
    const validNegAdjRes = await fetchHttp(`${baseUrl}/inventory/adjustments`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        warehouseId: mainWarehouse.id,
        reason: 'Broken packaging during storage inspection',
        items: [
          {
            variantId: variant1.id,
            type: 'NEGATIVE',
            quantity: 5,
          },
        ],
      },
    });
    assert(validNegAdjRes.status === 201, 'Valid negative adjustment recorded');

    const balAfterNeg = await fetchHttp(
      `${baseUrl}/inventory/balances/${mainWarehouse.id}/${variant1.id}`,
      { headers: authHeaders },
    );
    assert(Number(balAfterNeg.data.response.quantityOnHand) === 95, 'Product 1 stock updated to 95');

    // -----------------------------------------------------------------
    // STEP 8: Inter-Warehouse Stock Transfer - Draft Creation
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 8] Inter-Warehouse Transfer - Draft Creation');
    const createTrfRes = await fetchHttp(`${baseUrl}/inventory/transfers`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        sourceWarehouseId: mainWarehouse.id,
        destinationWarehouseId: destWarehouse.id,
        notes: 'Replenishment for Kandy regional depot',
        items: [
          { variantId: variant1.id, quantitySent: 30 },
          { variantId: variant2.id, quantitySent: 10 },
        ],
      },
    });
    assert(createTrfRes.status === 201, 'Draft stock transfer created');
    const transfer = createTrfRes.data.response;
    assert(transfer.status === 'DRAFT', 'Transfer initial status is DRAFT');
    assert(transfer.transferNumber.startsWith('TRF-'), 'Transfer number starts with TRF-');
    assert(transfer.items.length === 2, 'Transfer has 2 items');

    // Stock balances at this point must NOT be altered yet
    const sourceBalBeforeDispatch = await fetchHttp(
      `${baseUrl}/inventory/balances/${mainWarehouse.id}/${variant1.id}`,
      { headers: authHeaders },
    );
    assert(
      Number(sourceBalBeforeDispatch.data.response.quantityOnHand) === 95,
      'Source balance unchanged while transfer is DRAFT',
    );

    // -----------------------------------------------------------------
    // STEP 9: Inter-Warehouse Stock Transfer - Dispatch
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 9] Inter-Warehouse Transfer - Dispatch');
    const dispatchRes = await fetchHttp(`${baseUrl}/inventory/transfers/${transfer.id}/dispatch`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert(dispatchRes.status === 200, 'Transfer dispatched successfully');
    const dispatchedTransfer = dispatchRes.data.response;
    assert(dispatchedTransfer.status === 'IN_TRANSIT', 'Transfer status changed to IN_TRANSIT');
    assert(dispatchedTransfer.dispatchedAt !== null, 'dispatchedAt timestamp is set');

    // Source warehouse stock should now be deducted
    const sourceBalAfterDispatch = await fetchHttp(
      `${baseUrl}/inventory/balances/${mainWarehouse.id}/${variant1.id}`,
      { headers: authHeaders },
    );
    assert(
      Number(sourceBalAfterDispatch.data.response.quantityOnHand) === 65,
      'Source warehouse stock deducted: 95 - 30 = 65',
    );

    // Destination warehouse should still be 0 (goods in transit)
    const destBalBeforeReceive = await fetchHttp(
      `${baseUrl}/inventory/balances/${destWarehouse.id}/${variant1.id}`,
      { headers: authHeaders },
    );
    assert(
      Number(destBalBeforeReceive.data.response.quantityOnHand) === 0,
      'Destination warehouse stock is still 0 while in transit',
    );

    // -----------------------------------------------------------------
    // STEP 10: Inter-Warehouse Stock Transfer - Receive
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 10] Inter-Warehouse Transfer - Receive');
    const receiveRes = await fetchHttp(`${baseUrl}/inventory/transfers/${transfer.id}/receive`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        notes: 'All items received in pristine condition at Kandy Depot',
      },
    });
    assert(receiveRes.status === 200, 'Transfer received successfully');
    const receivedTransfer = receiveRes.data.response;
    assert(receivedTransfer.status === 'RECEIVED', 'Transfer status changed to RECEIVED');
    assert(receivedTransfer.receivedAt !== null, 'receivedAt timestamp is set');

    // Destination warehouse stock should now be increased
    const destBalAfterReceive1 = await fetchHttp(
      `${baseUrl}/inventory/balances/${destWarehouse.id}/${variant1.id}`,
      { headers: authHeaders },
    );
    assert(
      Number(destBalAfterReceive1.data.response.quantityOnHand) === 30,
      'Destination warehouse received 30 units of Product 1',
    );

    const destBalAfterReceive2 = await fetchHttp(
      `${baseUrl}/inventory/balances/${destWarehouse.id}/${variant2.id}`,
      { headers: authHeaders },
    );
    assert(
      Number(destBalAfterReceive2.data.response.quantityOnHand) === 10,
      'Destination warehouse received 10 units of Product 2',
    );

    // -----------------------------------------------------------------
    // STEP 11: Transfer In-Transit Cancellation with Compensating Reversal
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 11] Transfer In-Transit Cancellation & Compensating Reversal');
    // Create new transfer for 15 units of Product 1
    const trf2Res = await fetchHttp(`${baseUrl}/inventory/transfers`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        sourceWarehouseId: mainWarehouse.id,
        destinationWarehouseId: destWarehouse.id,
        notes: 'Transfer to be cancelled mid-transit',
        items: [{ variantId: variant1.id, quantitySent: 15 }],
      },
    });
    const trf2 = trf2Res.data.response;

    // Dispatch it: source drops 65 -> 50
    await fetchHttp(`${baseUrl}/inventory/transfers/${trf2.id}/dispatch`, {
      method: 'POST',
      headers: authHeaders,
    });
    const balMidTransit = await fetchHttp(
      `${baseUrl}/inventory/balances/${mainWarehouse.id}/${variant1.id}`,
      { headers: authHeaders },
    );
    assert(Number(balMidTransit.data.response.quantityOnHand) === 50, 'Stock dropped to 50 during transit');

    // Cancel while in transit: should reverse and return 15 units to source
    const cancelRes = await fetchHttp(`${baseUrl}/inventory/transfers/${trf2.id}/cancel`, {
      method: 'POST',
      headers: authHeaders,
      body: { notes: 'Transport vehicle breakdown, transfer recalled' },
    });
    assert(cancelRes.status === 200, 'Transfer cancelled successfully');

    const balAfterCancel = await fetchHttp(
      `${baseUrl}/inventory/balances/${mainWarehouse.id}/${variant1.id}`,
      { headers: authHeaders },
    );
    assert(
      Number(balAfterCancel.data.response.quantityOnHand) === 65,
      'Compensating reversal successfully restored stock back to 65',
    );

    // -----------------------------------------------------------------
    // STEP 12: Cross-Tenant Isolation Security Test
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 12] Cross-Tenant Security Isolation');
    const fakeMerchantId = 'a0000000-0000-0000-0000-000000000099';
    const maliciousReq = await fetchHttp(
      `${baseUrl}/inventory/balances?merchantId=${fakeMerchantId}`,
      { headers: authHeaders },
    );
    assert(
      maliciousReq.status === 403,
      'Malicious cross-tenant query rejected with 403 Forbidden by TenantGuard',
    );

    console.log('\n================================================================');
    console.log('🎉 ALL INVENTORY & STOCK MANAGEMENT (PHASE 7) TESTS PASSED!');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ INVENTORY E2E TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

runInventoryE2ETests();
