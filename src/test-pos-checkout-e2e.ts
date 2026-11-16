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

async function runPosCheckoutE2ETests() {
  console.log('================================================================');
  console.log('🚀 STARTING POS CHECKOUT & SALES ENGINE (PHASE 10 - WP-09) E2E');
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

  const testPort = 4101;
  await app.listen(testPort);
  const baseUrl = `http://localhost:${testPort}/api/v1`;

  try {
    // -----------------------------------------------------------------
    // STEP 1: Merchant Owner Authentication & Branch/Warehouse Setup
    // -----------------------------------------------------------------
    console.log('👉 [Step 1] Merchant Owner Authentication');
    const loginRes = await fetchHttp(`${baseUrl}/auth/merchant/login`, {
      method: 'POST',
      body: { email: 'owner@urbanmart.com', password: 'UrbanOwner123!' },
    });
    assert(loginRes.status === 200, 'Merchant Owner login succeeds');
    const token = loginRes.data.response.accessToken;
    const authHeaders = { Authorization: `Bearer ${token}` };

    const branchesRes = await fetchHttp(`${baseUrl}/merchant/branches`, {
      headers: authHeaders,
    });
    assert(branchesRes.status === 200, 'Branches listed');
    const branch = branchesRes.data.response[0];
    assert(!!branch, 'Found primary branch');

    const warehousesRes = await fetchHttp(`${baseUrl}/merchant/warehouses`, {
      headers: authHeaders,
    });
    assert(warehousesRes.status === 200, 'Warehouses listed');
    const warehouse = warehousesRes.data.response[0];
    assert(!!warehouse, 'Found warehouse');

    // -----------------------------------------------------------------
    // STEP 2: POS Terminal & Cash Drawer Session Initialization
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 2] POS Terminal & Active Cash Session Setup');
    const activeSessionRes = await fetchHttp(`${baseUrl}/pos/sessions/active`, {
      headers: authHeaders,
    });
    let terminal: any;
    let session: any;

    if (activeSessionRes.data?.response) {
      session = activeSessionRes.data.response;
      terminal = session.posTerminal;
    } else {
      const termCode = `EXP-${Date.now().toString().slice(-5)}`;
      const createTermRes = await fetchHttp(`${baseUrl}/pos/terminals`, {
        method: 'POST',
        headers: authHeaders,
        body: {
          branchId: branch.id,
          code: termCode,
          name: 'Main Express Counter',
          hardwareIdentifier: `HW-${Date.now()}`,
        },
      });
      assert(createTermRes.status === 201, 'POS Terminal created', createTermRes.data);
      terminal = createTermRes.data.response;

      const openSessionRes = await fetchHttp(`${baseUrl}/pos/sessions/open`, {
        method: 'POST',
        headers: authHeaders,
        body: {
          posTerminalId: terminal.id,
          openingFloat: 5000.0,
          notes: 'Morning shift opening float for checkout test',
        },
      });
      assert(openSessionRes.status === 201, 'Cash session opened with 5,000 opening float', openSessionRes.data);
      session = openSessionRes.data.response;
    }
    assert(session && session.status === 'OPEN', 'Active cash session confirmed');

    // -----------------------------------------------------------------
    // STEP 3: Catalog Products & Tax Setup
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 3] Catalog Variants & Stock Verification');
    const catalogRes = await fetchHttp(`${baseUrl}/catalog/products?limit=10`, {
      headers: authHeaders,
    });
    assert(catalogRes.status === 200, 'Catalog products retrieved');
    const products = catalogRes.data.response;
    assert(products.length > 0, 'Catalog has products');

    let variantA = products[0].variants[0];
    assert(!!variantA, 'Variant A identified for checkout');

    // Ensure warehouse has sufficient stock for variantA
    const adjRes = await fetchHttp(`${baseUrl}/inventory/adjustments`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        warehouseId: warehouse.id,
        reason: 'Restocking for POS checkout test',
        items: [
          {
            variantId: variantA.id,
            type: 'POSITIVE',
            quantity: 50.0,
            unitCost: Number(variantA.costPrice) || 450,
          },
        ],
      },
    });
    assert(adjRes.status === 201, 'Replenished 50 units for checkout test', adjRes.data);

    // -----------------------------------------------------------------
    // STEP 4: Scenario A - Single Cash Checkout with Change Calculation
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 4] Scenario A - Single Cash Checkout & Inventory Deduction');
    const initialBalanceRes = await fetchHttp(`${baseUrl}/inventory/balances?warehouseId=${warehouse.id}&variantId=${variantA.id}`, {
      headers: authHeaders,
    });
    const initialItems = initialBalanceRes.data.response.items || initialBalanceRes.data.response;
    const stockBeforeA = Number(initialItems[0]?.quantityOnHand || 0);

    const saleAReq = {
      branchId: branch.id,
      warehouseId: warehouse.id,
      posTerminalId: terminal.id,
      cashSessionId: session.id,
      items: [
        {
          variantId: variantA.id,
          quantity: 2.0,
          unitPrice: Number(variantA.sellingPrice),
          discountAmount: 0,
        },
      ],
      payments: [
        {
          tenderType: 'CASH',
          amount: Number(variantA.sellingPrice) * 2 + 100, // overpaying by 100 to test change given
        },
      ],
    };

    const saleARes = await fetchHttp(`${baseUrl}/pos/checkout`, {
      method: 'POST',
      headers: authHeaders,
      body: saleAReq,
    });
    assert(saleARes.status === 201, 'Cash checkout completed successfully', saleARes.data);
    const saleA = saleARes.data.response;
    assert(saleA.status === 'COMPLETED', 'Sale status is COMPLETED');
    assert(Number(saleA.totalAmount) === Number(variantA.sellingPrice) * 2, 'Total amount correctly computed');
    assert(Number(saleA.changeGiven) === 100, 'Change given accurately calculated at 100 LKR');

    // Verify atomic inventory balance decrement
    const balanceAfterARes = await fetchHttp(`${baseUrl}/inventory/balances?warehouseId=${warehouse.id}&variantId=${variantA.id}`, {
      headers: authHeaders,
    });
    const afterItems = balanceAfterARes.data.response.items || balanceAfterARes.data.response;
    const stockAfterA = Number(afterItems[0].quantityOnHand);
    assert(stockAfterA === stockBeforeA - 2, `Stock deducted by exactly 2 units (${stockBeforeA} -> ${stockAfterA})`);

    // Verify append-only inventory movement ledger entry
    const movementsRes = await fetchHttp(`${baseUrl}/inventory/movements?warehouseId=${warehouse.id}&variantId=${variantA.id}&movementType=SALE_DEDUCTION&limit=5`, {
      headers: authHeaders,
    });
    assert(movementsRes.status === 200, 'Inventory movements retrieved');
    const movItems = movementsRes.data.response.items || movementsRes.data.response;
    const movement = movItems[0];
    assert(movement && Number(movement.quantity) === -2, 'SALE_DEDUCTION movement logged with -2 units');
    assert(movement.referenceType === 'SALE', 'Movement referenceType is SALE');

    // -----------------------------------------------------------------
    // STEP 5: Scenario B - Split Payment Checkout (CASH + CARD)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 5] Scenario B - Split Payment Checkout (CARD + CASH)');
    const unitPriceB = Number(variantA.sellingPrice);
    const qtyB = 3.0;
    const totalDueB = unitPriceB * qtyB;
    const cardPay = Math.round((totalDueB / 2) * 100) / 100;
    const cashPay = Math.round((totalDueB - cardPay) * 100) / 100;

    const saleBRes = await fetchHttp(`${baseUrl}/pos/checkout`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        branchId: branch.id,
        warehouseId: warehouse.id,
        posTerminalId: terminal.id,
        items: [
          {
            variantId: variantA.id,
            quantity: qtyB,
            unitPrice: unitPriceB,
          },
        ],
        payments: [
          { tenderType: 'CARD', amount: cardPay, referenceNumber: 'AUTH-VISA-TEST-7788' },
          { tenderType: 'CASH', amount: cashPay },
        ],
      },
    });
    assert(saleBRes.status === 201, 'Split payment checkout processed successfully');
    const saleB = saleBRes.data.response;
    assert(saleB.payments.length === 2, '2 payment tenders recorded');
    assert(Number(saleB.paidAmount) === totalDueB, 'Total paid matches grand total');

    // -----------------------------------------------------------------
    // STEP 6: Scenario C - Minimum Selling Price Guard & Cart Discounts
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 6] Scenario C - Minimum Selling Price Guard & Cart Discount');
    if (variantA.minSellingPrice) {
      const belowMinRes = await fetchHttp(`${baseUrl}/pos/checkout`, {
        method: 'POST',
        headers: authHeaders,
        body: {
          branchId: branch.id,
          warehouseId: warehouse.id,
          items: [
            {
              variantId: variantA.id,
              quantity: 1,
              unitPrice: Number(variantA.minSellingPrice) - 1, // Below minimum threshold
            },
          ],
          payments: [{ tenderType: 'CASH', amount: 500 }],
        },
      });
      assert(belowMinRes.status === 400, 'Selling below minSellingPrice correctly rejected with 400 Bad Request');
    }

    // Checkout with cart discount
    const cartDiscountRes = await fetchHttp(`${baseUrl}/pos/checkout`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        branchId: branch.id,
        warehouseId: warehouse.id,
        cartDiscountAmount: 50.0,
        items: [
          {
            variantId: variantA.id,
            quantity: 1.0,
            unitPrice: unitPriceB,
          },
        ],
        payments: [
          { tenderType: 'CASH', amount: unitPriceB - 50.0 },
        ],
      },
    });
    assert(cartDiscountRes.status === 201, 'Cart discount checkout processed successfully');
    assert(Number(cartDiscountRes.data.response.discountAmount) === 50.0, 'Cart discount of 50 recorded');
    assert(Number(cartDiscountRes.data.response.totalAmount) === unitPriceB - 50.0, 'Grand total reduced by discount');

    // -----------------------------------------------------------------
    // STEP 7: Scenario D - Overdraft / Insufficient Stock Prevention
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 7] Scenario D - Overdraft / Insufficient Stock Prevention');
    const overdraftRes = await fetchHttp(`${baseUrl}/pos/checkout`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        branchId: branch.id,
        warehouseId: warehouse.id,
        items: [
          {
            variantId: variantA.id,
            quantity: 999999.0, // Exceeds available stock
            unitPrice: unitPriceB,
          },
        ],
        payments: [{ tenderType: 'CASH', amount: 99999999 }],
      },
    });
    assert(overdraftRes.status === 400, 'Overdraft checkout rejected with 400 Bad Request');

    // -----------------------------------------------------------------
    // STEP 8: Scenario E - Idempotency via clientOperationId
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 8] Scenario E - Idempotency via clientOperationId');
    const clientOpId = `op-e2e-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const idempReq = {
      branchId: branch.id,
      warehouseId: warehouse.id,
      posTerminalId: terminal.id,
      clientOperationId: clientOpId,
      items: [
        {
          variantId: variantA.id,
          quantity: 1.0,
          unitPrice: unitPriceB,
        },
      ],
      payments: [{ tenderType: 'CASH', amount: unitPriceB }],
    };

    const firstSubmitRes = await fetchHttp(`${baseUrl}/pos/checkout`, {
      method: 'POST',
      headers: authHeaders,
      body: idempReq,
    });
    assert(firstSubmitRes.status === 201, 'First idempotent submission created sale');
    const firstSaleId = firstSubmitRes.data.response.id;

    // Resubmit identical request
    const secondSubmitRes = await fetchHttp(`${baseUrl}/pos/checkout`, {
      method: 'POST',
      headers: authHeaders,
      body: idempReq,
    });
    assert(secondSubmitRes.status === 201, 'Second idempotent submission succeeded without error');
    assert(secondSubmitRes.data.response.id === firstSaleId, 'Second submission returned identical original sale ID (no duplicate)');

    // -----------------------------------------------------------------
    // STEP 9: Scenario F - Customer Attachment & Loyalty Points Accrual
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 9] Scenario F - Customer Loyalty Points Accrual');
    // Seed/lookup customer directly via database or API if customer module exists
    // Let's create customer or verify loyalty points update
    const db = app.get(DatabaseService);
    const dbCustomer = await db.customer.findFirst({
      where: { merchantId: branch.merchantId },
    });

    let testCustomer = dbCustomer;
    if (!testCustomer) {
      testCustomer = await db.customer.create({
        data: {
          merchantId: branch.merchantId,
          code: `CUST-${Date.now().toString().slice(-6)}`,
          name: 'Kamal Perera',
          phone: `077${Math.floor(1000000 + Math.random() * 9000000)}`,
          loyaltyPoints: 10,
        },
      });
    }

    const pointsBefore = testCustomer.loyaltyPoints;
    const loyaltySaleRes = await fetchHttp(`${baseUrl}/pos/checkout`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: testCustomer.id,
        items: [
          {
            variantId: variantA.id,
            quantity: 1.0,
            unitPrice: 550.0,
          },
        ],
        payments: [{ tenderType: 'CASH', amount: 550.0 }],
      },
    });
    assert(loyaltySaleRes.status === 201, 'Customer checkout completed');

    const updatedCustomer = await db.customer.findUnique({
      where: { id: testCustomer.id },
    });
    assert(!!updatedCustomer, 'Updated customer found in DB');
    const expectedPointsEarned = Math.floor(550.0 / 100); // 5 points
    assert(
      updatedCustomer!.loyaltyPoints === pointsBefore + expectedPointsEarned,
      `Loyalty points increased from ${pointsBefore} to ${updatedCustomer!.loyaltyPoints} (+${expectedPointsEarned})`,
    );

    // -----------------------------------------------------------------
    // STEP 10: Scenario G - Receipt Generation & Formatting
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 10] Scenario G - Receipt Generation & Thermal Structure');
    const receiptRes = await fetchHttp(`${baseUrl}/pos/sales/${saleA.id}/receipt`, {
      headers: authHeaders,
    });
    assert(receiptRes.status === 200, 'Receipt fetched successfully');
    const receipt = receiptRes.data.response;
    assert(receipt.receiptNumber === saleA.invoiceNumber, 'Receipt number matches invoice number');
    assert(!!receipt.store.companyName, 'Store company name present on receipt');
    assert(receipt.items.length === 1, 'Receipt items populated');
    assert(receipt.pricing.grandTotal === Number(saleA.totalAmount), 'Receipt grand total matches');
    assert(receipt.pricing.changeGiven === 100, 'Receipt change given accurately rendered');
    assert(!!receipt.footer.returnPolicy, 'Receipt footer includes return policy');

    // -----------------------------------------------------------------
    // STEP 11: Scenario H - Sales Listing & Filtering
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 11] Scenario H - Sales Listing & Filtering');
    const salesListRes = await fetchHttp(`${baseUrl}/pos/sales?branchId=${branch.id}&limit=5`, {
      headers: authHeaders,
    });
    assert(salesListRes.status === 200, 'Sales transactions listed');
    assert(salesListRes.data.response.length > 0, 'Sales records returned');
    assert(salesListRes.data.meta.total >= 4, 'Total sales count tracked');

    // Filter by invoiceNumber search
    const searchRes = await fetchHttp(`${baseUrl}/pos/sales?search=${saleA.invoiceNumber}`, {
      headers: authHeaders,
    });
    assert(searchRes.status === 200, 'Invoice search succeeded');
    assert(searchRes.data.response.length === 1, 'Found exact invoice by search');
    assert(searchRes.data.response[0].id === saleA.id, 'Returned target sale record');

    // -----------------------------------------------------------------
    // STEP 12: Scenario I - Multi-Tenant Isolation
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 12] Scenario I - Multi-Tenant Cross-Merchant Isolation');
    const platformLoginRes = await fetchHttp(`${baseUrl}/auth/platform/login`, {
      method: 'POST',
      body: { email: 'superadmin@retailpos.com', password: 'SuperAdminPassword123!' },
    });
    assert(platformLoginRes.status === 200, 'SuperAdmin login succeeded');
    const platformHeaders = { Authorization: `Bearer ${platformLoginRes.data.response.accessToken}` };

    // Query public subscription plans
    const plansRes = await fetchHttp(`${baseUrl}/onboarding/plans`);
    assert(plansRes.status === 200, 'Public plans endpoint returns 200');
    const basicPlan = plansRes.data.response.find((p: any) => p.code === 'PLAN_BASIC') || plansRes.data.response[0];

    // Create a secondary merchant
    const ownerEmail = `tenantb_${Date.now()}@testmart.com`;
    const regRes = await fetchHttp(`${baseUrl}/onboarding/register`, {
      method: 'POST',
      body: {
        businessName: `Cross Tenant Mart ${Date.now()}`,
        tradeName: 'Cross Mart',
        contactEmail: ownerEmail,
        contactPhone: '+94779998888',
        ownerFirstName: 'TenantB',
        ownerLastName: 'Owner',
        password: 'TenantBPassword123!',
        planId: basicPlan.id,
        billingCycle: 'MONTHLY',
      },
    });
    assert(regRes.status === 201, 'Secondary merchant registered', regRes.data);
    const tenantBMerchantId = regRes.data.response.merchantId;

    // Approve merchant
    const approveRes = await fetchHttp(`${baseUrl}/platform/merchants/${tenantBMerchantId}/approve`, {
      method: 'POST',
      headers: platformHeaders,
    });
    assert(approveRes.status === 200, 'Tenant B merchant approved');

    // Login as Tenant B
    const tenantBLogin = await fetchHttp(`${baseUrl}/auth/merchant/login`, {
      method: 'POST',
      body: {
        email: ownerEmail,
        password: 'TenantBPassword123!',
      },
    });
    assert(tenantBLogin.status === 200, 'Tenant B logged in', tenantBLogin.data);
    const tenantBHeaders = { Authorization: `Bearer ${tenantBLogin.data.response.accessToken}` };

    // Tenant B attempts to read Tenant A's sale
    const crossReadRes = await fetchHttp(`${baseUrl}/pos/sales/${saleA.id}`, {
      headers: tenantBHeaders,
    });
    assert(crossReadRes.status === 404, 'Cross-tenant sale read isolated with 404 Not Found');

    console.log('\n================================================================');
    console.log('🎉 ALL PHASE 10 (WP-09) POS CHECKOUT & SALES TESTS PASSED!');
    console.log('================================================================\n');
  } finally {
    await app.close();
  }
}

runPosCheckoutE2ETests().catch((err) => {
  console.error('E2E TEST FAILURE:', err);
  process.exit(1);
});
