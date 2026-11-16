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

async function runPurchasingE2ETests() {
  console.log('================================================================');
  console.log('🚀 STARTING PURCHASING & SUPPLIER MANAGEMENT (PHASE 8 - WP-07) E2E');
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

  const testPort = 4099;
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
    // STEP 2: Setup Prerequisites (Warehouse & Product to Purchase)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 2] Warehouse & Product Setup');
    const whRes = await fetchHttp(`${baseUrl}/merchant/warehouses`, { headers: authHeaders });
    assert(whRes.status === 200, 'Warehouses fetched successfully');
    const warehouses = whRes.data.response.items || whRes.data.response;
    const warehouse = warehouses[0];

    const productCode = `GRNTEA-${Date.now().toString().slice(-4)}`;
    const productRes = await fetchHttp(`${baseUrl}/catalog/products`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: productCode,
        name: 'Organic Ceylon Green Tea 250g',
        unit: 'PACK',
        costPrice: 300,
        sellingPrice: 550,
        reorderPoint: 20,
      },
    });
    assert(productRes.status === 201, 'Test purchasing product created', productRes.data);
    const variant = productRes.data.response.variants[0];

    // -----------------------------------------------------------------
    // STEP 3: Supplier Profile CRUD
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 3] Supplier Profile CRUD');
    const supplierCode = `SUP-PLANT-${Date.now().toString().slice(-4)}`;
    const createSupRes = await fetchHttp(`${baseUrl}/purchasing/suppliers`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: supplierCode,
        name: 'Ceylon Highlands Tea Plantations PLC',
        contactPerson: 'Mr. Rohan Gunaratne',
        email: 'rohan@highlandstea.lk',
        phone: '+94112345678',
        taxNumber: 'TIN-445566778',
        creditDays: 30,
      },
    });
    assert(createSupRes.status === 201, 'Supplier created successfully', createSupRes.data);
    const supplier = createSupRes.data.response;
    assert(supplier.code === supplierCode, 'Supplier code matches input');
    assert(supplier.creditDays === 30, 'Initial credit terms set to 30 days');
    assert(Number(supplier.outstandingPayables) === 0, 'Initial payables is 0');

    // Duplicate supplier code check
    const dupSupRes = await fetchHttp(`${baseUrl}/purchasing/suppliers`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: supplierCode,
        name: 'Duplicate Company',
      },
    });
    assert(dupSupRes.status === 409, 'Duplicate supplier code rejected with 409 Conflict');

    // Update supplier
    const updateSupRes = await fetchHttp(`${baseUrl}/purchasing/suppliers/${supplier.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: {
        creditDays: 45,
        contactPerson: 'Mr. Rohan Gunaratne (Senior Director)',
      },
    });
    assert(updateSupRes.status === 200, 'Supplier updated successfully');
    assert(updateSupRes.data.response.creditDays === 45, 'Credit terms updated to 45 days');

    // List suppliers
    const listSupRes = await fetchHttp(
      `${baseUrl}/purchasing/suppliers?search=${supplierCode}`,
      { headers: authHeaders },
    );
    assert(listSupRes.status === 200, 'Suppliers listed successfully');
    const supItems = listSupRes.data.response.items || listSupRes.data.response;
    assert(supItems.length === 1, 'Search found exact supplier by code');

    // -----------------------------------------------------------------
    // STEP 4: Purchase Order Lifecycle (Create -> Edit -> Issue)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 4] Purchase Order Lifecycle');
    const createPoRes = await fetchHttp(`${baseUrl}/purchasing/purchase-orders`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        notes: 'Urgent harvest replenishment',
        items: [
          {
            variantId: variant.id,
            quantityOrdered: 100,
            unitCost: 280,
          },
        ],
      },
    });
    assert(createPoRes.status === 201, 'Purchase order draft created', createPoRes.data);
    const po = createPoRes.data.response;
    assert(po.status === 'DRAFT', 'Initial PO status is DRAFT');
    assert(po.poNumber.startsWith('PO-'), 'PO number generated with PO- prefix');
    assert(Number(po.totalAmount) === 28000, 'Total amount calculated (100 * 280 = 28,000)');

    // Update draft PO (increase to 120 units @ 275)
    const updatePoRes = await fetchHttp(`${baseUrl}/purchasing/purchase-orders/${po.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: {
        notes: 'Negotiated quantity discount: 120 units',
        items: [
          {
            variantId: variant.id,
            quantityOrdered: 120,
            unitCost: 275,
          },
        ],
      },
    });
    assert(updatePoRes.status === 200, 'Draft PO updated with new quantities');
    assert(Number(updatePoRes.data.response.totalAmount) === 33000, 'Total updated (120 * 275 = 33,000)');

    // Issue PO
    const issuePoRes = await fetchHttp(`${baseUrl}/purchasing/purchase-orders/${po.id}/issue`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert(issuePoRes.status === 200, 'Purchase order issued');
    assert(issuePoRes.data.response.status === 'ISSUED', 'PO status transitioned to ISSUED');

    // Attempting to edit an ISSUED PO must be blocked
    const failEditRes = await fetchHttp(`${baseUrl}/purchasing/purchase-orders/${po.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: { notes: 'Should fail' },
    });
    assert(failEditRes.status === 400, 'Editing issued PO is properly rejected with 400 Bad Request');

    // -----------------------------------------------------------------
    // STEP 5: Direct Goods Received Note (GRN) with Landed Costs & AVCO Costing
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 5] Direct GRN with Landed Costs & AVCO Costing');
    const directGrnRes = await fetchHttp(`${baseUrl}/purchasing/grn`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        supplierInvoiceRef: 'INV-DIR-8812',
        landedCosts: 1500, // LKR 1,500 shipping/freight allocated to stock
        items: [
          {
            variantId: variant.id,
            quantityReceived: 50,
            unitCost: 300, // 50 * 300 = 15,000
            taxAmount: 0,
          },
        ],
      },
    });
    assert(directGrnRes.status === 201, 'Direct draft GRN created', directGrnRes.data);
    const directGrn = directGrnRes.data.response;
    assert(directGrn.status === 'DRAFT', 'GRN initial status is DRAFT');
    // Total = 15,000 (subtotal) + 1,500 (landed) = 16,500
    assert(Number(directGrn.totalAmount) === 16500, 'Total GRN amount includes landed costs (16,500)');

    // Post direct GRN
    const postDirectRes = await fetchHttp(`${baseUrl}/purchasing/grn/${directGrn.id}/post`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert(postDirectRes.status === 200, 'Direct GRN posted successfully', postDirectRes.data);
    assert(postDirectRes.data.response.status === 'POSTED', 'GRN status is now POSTED');

    // Verify Stock Balance incremented to 50
    const balDirect = await fetchHttp(
      `${baseUrl}/inventory/balances/${warehouse.id}/${variant.id}`,
      { headers: authHeaders },
    );
    assert(Number(balDirect.data.response.quantityOnHand) === 50, 'Warehouse stock on hand is now 50');

    // Effective unit cost = (15,000 + 1,500) / 50 = LKR 330. AVCO on variant costPrice is updated to 330.
    const varAfterDirect = await fetchHttp(
      `${baseUrl}/catalog/products/${productRes.data.response.id}`,
      { headers: authHeaders },
    );
    const updatedVar1 = varAfterDirect.data.response.variants[0];
    assert(Number(updatedVar1.costPrice) === 330, 'AVCO updated variant costPrice to LKR 330 (reflects landed cost)');

    // Verify append-only inventory movement recorded
    const mvDirect = await fetchHttp(
      `${baseUrl}/inventory/movements?warehouseId=${warehouse.id}&referenceType=GRN&referenceId=${directGrn.id}`,
      { headers: authHeaders },
    );
    const movements = mvDirect.data.response.items || mvDirect.data.response;
    assert(movements.length === 1, 'Inventory movement recorded for direct GRN');
    assert(movements[0].movementType === 'PURCHASE_RECEIPT', 'Movement type is PURCHASE_RECEIPT');
    assert(Number(movements[0].runningBalance) === 50, 'Running balance accurately reflects 50 units');

    // Verify supplier outstanding payables increased by 16,500
    const supAfterDirect = await fetchHttp(`${baseUrl}/purchasing/suppliers/${supplier.id}`, {
      headers: authHeaders,
    });
    assert(
      Number(supAfterDirect.data.response.outstandingPayables) === 16500,
      'Supplier outstanding payables increased by 16,500',
    );

    // -----------------------------------------------------------------
    // STEP 6: 3-Way Matching GRN Against PO (Partial -> Complete)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 6] 3-Way Matching GRN Against Purchase Order');
    // Shipment 1: Partial delivery of 70 units (out of 120 ordered on PO)
    const partialGrnRes = await fetchHttp(`${baseUrl}/purchasing/grn`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        purchaseOrderId: po.id,
        supplierInvoiceRef: 'INV-SUP-PARTIAL-1',
        landedCosts: 0,
        items: [
          {
            variantId: variant.id,
            quantityReceived: 70,
            unitCost: 275,
          },
        ],
      },
    });
    assert(partialGrnRes.status === 201, 'Partial delivery GRN created');
    const partialGrn = partialGrnRes.data.response;

    // Post partial delivery
    await fetchHttp(`${baseUrl}/purchasing/grn/${partialGrn.id}/post`, {
      method: 'POST',
      headers: authHeaders,
    });

    // Check PO status: should be PARTIALLY_RECEIVED
    const poPartialCheck = await fetchHttp(`${baseUrl}/purchasing/purchase-orders/${po.id}`, {
      headers: authHeaders,
    });
    assert(
      poPartialCheck.data.response.status === 'PARTIALLY_RECEIVED',
      'PO status automatically transitioned to PARTIALLY_RECEIVED',
    );
    assert(
      Number(poPartialCheck.data.response.items[0].quantityReceived) === 70,
      'PO items show 70 units received',
    );

    // Stock on hand: 50 + 70 = 120
    const balPartial = await fetchHttp(
      `${baseUrl}/inventory/balances/${warehouse.id}/${variant.id}`,
      { headers: authHeaders },
    );
    assert(Number(balPartial.data.response.quantityOnHand) === 120, 'Stock on hand increased to 120');

    // Shipment 2: Final delivery of remaining 50 units (completes the 120 units ordered)
    const finalGrnRes = await fetchHttp(`${baseUrl}/purchasing/grn`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        purchaseOrderId: po.id,
        supplierInvoiceRef: 'INV-SUP-FINAL-2',
        landedCosts: 0,
        items: [
          {
            variantId: variant.id,
            quantityReceived: 50,
            unitCost: 275,
          },
        ],
      },
    });
    assert(finalGrnRes.status === 201, 'Final delivery GRN created');
    const finalGrn = finalGrnRes.data.response;

    await fetchHttp(`${baseUrl}/purchasing/grn/${finalGrn.id}/post`, {
      method: 'POST',
      headers: authHeaders,
    });

    // Check PO status: should now be fully COMPLETED
    const poCompletedCheck = await fetchHttp(`${baseUrl}/purchasing/purchase-orders/${po.id}`, {
      headers: authHeaders,
    });
    assert(
      poCompletedCheck.data.response.status === 'COMPLETED',
      'PO status automatically transitioned to COMPLETED upon full delivery',
    );
    assert(
      Number(poCompletedCheck.data.response.items[0].quantityReceived) === 120,
      'PO item shows full 120 units received',
    );

    // Stock on hand: 120 + 50 = 170
    const balCompleted = await fetchHttp(
      `${baseUrl}/inventory/balances/${warehouse.id}/${variant.id}`,
      { headers: authHeaders },
    );
    assert(Number(balCompleted.data.response.quantityOnHand) === 170, 'Stock on hand increased to 170');

    // -----------------------------------------------------------------
    // STEP 7: Cancellation Safeguards (PO & GRN)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 7] Cancellation Safeguards');
    // Completed PO cannot be cancelled
    const failCancelPo = await fetchHttp(`${baseUrl}/purchasing/purchase-orders/${po.id}/cancel`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert(failCancelPo.status === 400, 'Cannot cancel COMPLETED purchase order (400 Bad Request)');

    // Posted GRN cannot be cancelled
    const failCancelGrn = await fetchHttp(`${baseUrl}/purchasing/grn/${finalGrn.id}/cancel`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert(failCancelGrn.status === 400, 'Cannot cancel POSTED goods received note (400 Bad Request)');

    // Draft PO cancellation test
    const draftPoRes = await fetchHttp(`${baseUrl}/purchasing/purchase-orders`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        notes: 'To be cancelled',
        items: [{ variantId: variant.id, quantityOrdered: 10, unitCost: 200 }],
      },
    });
    const cancelDraftPo = await fetchHttp(
      `${baseUrl}/purchasing/purchase-orders/${draftPoRes.data.response.id}/cancel`,
      { method: 'POST', headers: authHeaders },
    );
    assert(cancelDraftPo.status === 200, 'Draft PO cancelled successfully');
    assert(cancelDraftPo.data.response.status === 'CANCELLED', 'Status marked CANCELLED');

    // -----------------------------------------------------------------
    // STEP 8: Cross-Tenant Security Isolation
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 8] Cross-Tenant Security Isolation');
    const fakeMerchantId = 'b0000000-0000-0000-0000-000000000099';
    const maliciousPoReq = await fetchHttp(
      `${baseUrl}/purchasing/purchase-orders?merchantId=${fakeMerchantId}`,
      { headers: authHeaders },
    );
    assert(
      maliciousPoReq.status === 403,
      'Cross-tenant PO query blocked by TenantGuard with 403 Forbidden',
    );

    console.log('\n================================================================');
    console.log('🎉 ALL PURCHASING & SUPPLIER MANAGEMENT (PHASE 8) TESTS PASSED!');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ PURCHASING E2E TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

runPurchasingE2ETests();
