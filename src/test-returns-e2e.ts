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

async function runReturnsE2ETests() {
  console.log('================================================================');
  console.log('🚀 STARTING RETURNS, REFUNDS & DISPOSAL (PHASE 12 - WP-11) E2E');
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

  const testPort = 4103;
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
        reason: 'Restocking for returns E2E test',
        items: [
          {
            variantId: variant.id,
            type: 'POSITIVE',
            quantity: 50.0,
            unitCost: Number(variant.costPrice) || 450,
          },
        ],
      },
    });

    // -----------------------------------------------------------------
    // STEP 2: Create Test Sale (4 Units)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 2] Create Multi-Item Test Sale (4 Units)');
    const saleRes = await fetchHttp(`${baseUrl}/pos/checkout`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        branchId: branch.id,
        warehouseId: warehouse.id,
        items: [
          {
            variantId: variant.id,
            quantity: 4.0,
            unitPrice,
          },
        ],
        payments: [
          {
            tenderType: 'CASH',
            amount: unitPrice * 4,
          },
        ],
      },
    });
    assert(saleRes.status === 201, 'Sale created successfully');
    const sale = saleRes.data.response;
    const saleItem = sale.items[0];
    assert(sale.status === 'COMPLETED', 'Sale status is COMPLETED');

    // -----------------------------------------------------------------
    // STEP 3: Partial Return with Restock (RETURN_TO_STOCK)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 3] Partial Return with RETURN_TO_STOCK (2 Units)');
    const balBeforeRes = await fetchHttp(
      `${baseUrl}/inventory/balances?warehouseId=${warehouse.id}&variantId=${variant.id}`,
      { headers: authHeaders },
    );
    const balBeforeItems = balBeforeRes.data.response.items || balBeforeRes.data.response;
    const stockBeforeReturn = Number(balBeforeItems[0].quantityOnHand);

    const return1Res = await fetchHttp(`${baseUrl}/pos/returns`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        saleId: sale.id,
        refundTender: 'CASH',
        reason: 'Customer returned 2 unopened units',
        items: [
          {
            saleItemId: saleItem.id,
            quantity: 2.0,
            returnAction: 'RETURN_TO_STOCK',
          },
        ],
      },
    });
    assert(return1Res.status === 201, 'Return processed successfully', return1Res.data);
    const return1 = return1Res.data.response;
    assert(return1.returnNumber.startsWith('RET-'), 'Generated return number starts with RET-');
    assert(Number(return1.refundAmount) === unitPrice * 2, 'Refund amount equals 2 * unit price');

    // Verify stock balance restored by +2
    const balAfterRes = await fetchHttp(
      `${baseUrl}/inventory/balances?warehouseId=${warehouse.id}&variantId=${variant.id}`,
      { headers: authHeaders },
    );
    const balAfterItems = balAfterRes.data.response.items || balAfterRes.data.response;
    const stockAfterReturn = Number(balAfterItems[0].quantityOnHand);
    assert(
      stockAfterReturn === stockBeforeReturn + 2,
      `Stock balance incremented by 2 (${stockBeforeReturn} -> ${stockAfterReturn})`,
    );

    // Verify append-only inventory movement ledger
    const movRes = await fetchHttp(
      `${baseUrl}/inventory/movements?warehouseId=${warehouse.id}&variantId=${variant.id}&movementType=SALE_RETURN&limit=1`,
      { headers: authHeaders },
    );
    const movItems = movRes.data.response.items || movRes.data.response;
    assert(movItems.length >= 1, 'SALE_RETURN movement record found');
    assert(Number(movItems[0].quantity) === 2, 'Movement quantity is +2 units');
    assert(movItems[0].referenceType === 'RETURN', 'Movement referenceType is RETURN');

    // Verify sale status transitioned to PARTIALLY_REFUNDED
    const saleCheck1 = await fetchHttp(`${baseUrl}/pos/sales/${sale.id}`, { headers: authHeaders });
    assert(saleCheck1.data.response.status === 'PARTIALLY_REFUNDED', 'Sale status is now PARTIALLY_REFUNDED');
    assert(Number(saleCheck1.data.response.items[0].returnedQuantity) === 2, 'Sale item returnedQuantity is 2');
    assert(saleCheck1.data.response.items[0].isReturned === false, 'Sale item isReturned is false (still 2 units unreturned)');

    // -----------------------------------------------------------------
    // STEP 4: Over-Return Prevention Guard
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 4] Over-Return Prevention Guard');
    const overReturnRes = await fetchHttp(`${baseUrl}/pos/returns`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        saleId: sale.id,
        refundTender: 'CASH',
        items: [
          {
            saleItemId: saleItem.id,
            quantity: 3.0, // Remaining available is only 2 units (4 - 2 = 2)
            returnAction: 'RETURN_TO_STOCK',
          },
        ],
      },
    });
    assert(overReturnRes.status === 400, 'Over-return rejected with 400 Bad Request');

    // -----------------------------------------------------------------
    // STEP 5: Damage Disposal Return (DAMAGE_DISPOSAL)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 5] Damage Disposal Return (DAMAGE_DISPOSAL)');
    // Create single unit sale
    const sale2Res = await fetchHttp(`${baseUrl}/pos/checkout`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        branchId: branch.id,
        warehouseId: warehouse.id,
        items: [
          {
            variantId: variant.id,
            quantity: 1.0,
            unitPrice,
          },
        ],
        payments: [{ tenderType: 'CASH', amount: unitPrice }],
      },
    });
    assert(sale2Res.status === 201, 'Sale 2 created');
    const sale2 = sale2Res.data.response;

    const balBeforeDmg = await fetchHttp(
      `${baseUrl}/inventory/balances?warehouseId=${warehouse.id}&variantId=${variant.id}`,
      { headers: authHeaders },
    );
    const stockBeforeDmg = Number((balBeforeDmg.data.response.items || balBeforeDmg.data.response)[0].quantityOnHand);

    const dmgReturnRes = await fetchHttp(`${baseUrl}/pos/returns`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        saleId: sale2.id,
        refundTender: 'CASH',
        reason: 'Broken bottle reported by customer',
        items: [
          {
            saleItemId: sale2.items[0].id,
            quantity: 1.0,
            returnAction: 'DAMAGE_DISPOSAL',
          },
        ],
      },
    });
    assert(dmgReturnRes.status === 201, 'Damage disposal return processed');

    // Verify stock was NOT added back
    const balAfterDmg = await fetchHttp(
      `${baseUrl}/inventory/balances?warehouseId=${warehouse.id}&variantId=${variant.id}`,
      { headers: authHeaders },
    );
    const stockAfterDmg = Number((balAfterDmg.data.response.items || balAfterDmg.data.response)[0].quantityOnHand);
    assert(stockAfterDmg === stockBeforeDmg, 'Stock balance was not incremented for DAMAGE_DISPOSAL');

    // Verify DAMAGE_DISPOSAL movement logged
    const dmgMovRes = await fetchHttp(
      `${baseUrl}/inventory/movements?warehouseId=${warehouse.id}&variantId=${variant.id}&movementType=DAMAGE_DISPOSAL&limit=1`,
      { headers: authHeaders },
    );
    const dmgMovs = dmgMovRes.data.response.items || dmgMovRes.data.response;
    assert(dmgMovs.length >= 1, 'DAMAGE_DISPOSAL movement audit logged');

    // -----------------------------------------------------------------
    // STEP 6: Full Return Status Transition (REFUNDED)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 6] Full Return Status Transition (REFUNDED)');
    // Return remaining 2 units of Sale 1
    const return2Res = await fetchHttp(`${baseUrl}/pos/returns`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        saleId: sale.id,
        refundTender: 'CASH',
        items: [
          {
            saleItemId: saleItem.id,
            quantity: 2.0,
            returnAction: 'RETURN_TO_STOCK',
          },
        ],
      },
    });
    assert(return2Res.status === 201, 'Second return for remaining units processed');

    const saleCheck2 = await fetchHttp(`${baseUrl}/pos/sales/${sale.id}`, { headers: authHeaders });
    assert(saleCheck2.data.response.status === 'REFUNDED', 'Sale status transitioned to REFUNDED');
    assert(saleCheck2.data.response.items[0].isReturned === true, 'Sale item isReturned is now true');

    // Attempting another return on REFUNDED sale
    const alreadyRefundedRes = await fetchHttp(`${baseUrl}/pos/returns`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        saleId: sale.id,
        refundTender: 'CASH',
        items: [
          {
            saleItemId: saleItem.id,
            quantity: 1.0,
            returnAction: 'RETURN_TO_STOCK',
          },
        ],
      },
    });
    assert(alreadyRefundedRes.status === 400, 'Return on already REFUNDED sale rejected with 400 Bad Request');

    // -----------------------------------------------------------------
    // STEP 7: Customer Loyalty Points Reversal on Refund
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 7] Loyalty Points Reversal on Return');
    const db = app.get(DatabaseService);
    let customer = await db.customer.findFirst({
      where: { merchantId: branch.merchantId },
    });
    if (!customer) {
      customer = await db.customer.create({
        data: {
          merchantId: branch.merchantId,
          code: `CUST-${Date.now().toString().slice(-6)}`,
          name: 'Loyalty Return Tester',
          loyaltyPoints: 10,
        },
      });
    }

    const pointsBefore = customer.loyaltyPoints;
    // Execute sale with customer
    const custSaleRes = await fetchHttp(`${baseUrl}/pos/checkout`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        items: [{ variantId: variant.id, quantity: 1.0, unitPrice: 500.0 }],
        payments: [{ tenderType: 'CASH', amount: 500.0 }],
      },
    });
    assert(custSaleRes.status === 201, 'Customer sale completed (+5 loyalty points)');

    const custAfterSale = await db.customer.findUnique({ where: { id: customer.id } });
    assert(custAfterSale!.loyaltyPoints === pointsBefore + 5, 'Customer earned 5 points');

    // Return the sale
    const custReturnRes = await fetchHttp(`${baseUrl}/pos/returns`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        saleId: custSaleRes.data.response.id,
        refundTender: 'CASH',
        items: [
          {
            saleItemId: custSaleRes.data.response.items[0].id,
            quantity: 1.0,
            returnAction: 'RETURN_TO_STOCK',
          },
        ],
      },
    });
    assert(custReturnRes.status === 201, 'Customer return completed');

    const custAfterReturn = await db.customer.findUnique({ where: { id: customer.id } });
    assert(
      custAfterReturn!.loyaltyPoints === pointsBefore,
      `Loyalty points reversed back to ${pointsBefore} (-5 points)`,
    );

    // -----------------------------------------------------------------
    // STEP 8: Store Credit Tender Refund
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 8] Store Credit Tender Refund');
    const storeCreditSaleRes = await fetchHttp(`${baseUrl}/pos/checkout`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        branchId: branch.id,
        warehouseId: warehouse.id,
        items: [{ variantId: variant.id, quantity: 1.0, unitPrice: 300.0 }],
        payments: [{ tenderType: 'CASH', amount: 300.0 }],
      },
    });
    const scReturnRes = await fetchHttp(`${baseUrl}/pos/returns`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        saleId: storeCreditSaleRes.data.response.id,
        refundTender: 'STORE_CREDIT',
        items: [
          {
            saleItemId: storeCreditSaleRes.data.response.items[0].id,
            quantity: 1.0,
            returnAction: 'RETURN_TO_STOCK',
          },
        ],
      },
    });
    assert(scReturnRes.status === 201, 'Return with STORE_CREDIT tender accepted');
    assert(scReturnRes.data.response.refundTender === 'STORE_CREDIT', 'Refund tender is STORE_CREDIT');

    // -----------------------------------------------------------------
    // STEP 9: Thermal Return Voucher Receipt Generation
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 9] Thermal Return Receipt Generation');
    const receiptRes = await fetchHttp(`${baseUrl}/pos/returns/${return1.id}/receipt`, {
      headers: authHeaders,
    });
    assert(receiptRes.status === 200, 'Return receipt fetched');
    const receipt = receiptRes.data.response;
    assert(receipt.returnNumber === return1.returnNumber, 'Receipt number matches');
    assert(receipt.originalInvoiceNumber === sale.invoiceNumber, 'Receipt contains original invoice number');
    assert(receipt.totalRefund === Number(return1.refundAmount), 'Receipt total matches refund amount');
    assert(receipt.items.length === 1, 'Receipt items populated');

    // -----------------------------------------------------------------
    // STEP 10: Returns Listing & Filtering
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 10] Returns Listing & Filtering');
    const listRes = await fetchHttp(`${baseUrl}/pos/returns?saleId=${sale.id}`, {
      headers: authHeaders,
    });
    assert(listRes.status === 200, 'Returns listed');
    const returnsList = listRes.data.response.items || listRes.data.response;
    assert(returnsList.length === 2, 'Found exactly 2 returns for Sale 1');
    assert(listRes.data.meta.total >= 2, 'Total returns meta tracked');

    // -----------------------------------------------------------------
    // STEP 11: Multi-Tenant Cross-Merchant Isolation
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 11] Multi-Tenant Isolation');
    const platformLoginRes = await fetchHttp(`${baseUrl}/auth/platform/login`, {
      method: 'POST',
      body: { email: 'superadmin@retailpos.com', password: 'SuperAdminPassword123!' },
    });
    const platformHeaders = { Authorization: `Bearer ${platformLoginRes.data.response.accessToken}` };

    const plansRes = await fetchHttp(`${baseUrl}/onboarding/plans`);
    const basicPlan = plansRes.data.response.find((p: any) => p.code === 'PLAN_BASIC') || plansRes.data.response[0];

    const tenantEmail = `tenant_ret_${Date.now()}@testmart.com`;
    const regRes = await fetchHttp(`${baseUrl}/onboarding/register`, {
      method: 'POST',
      body: {
        businessName: `Return Isolated Mart ${Date.now()}`,
        tradeName: 'Return Mart',
        contactEmail: tenantEmail,
        contactPhone: '+94779998888',
        ownerFirstName: 'TenantD',
        ownerLastName: 'Owner',
        password: 'TenantDPassword123!',
        planId: basicPlan.id,
        billingCycle: 'MONTHLY',
      },
    });
    assert(regRes.status === 201, 'Secondary merchant registered');
    const tenantDMerchantId = regRes.data.response.merchantId;

    await fetchHttp(`${baseUrl}/platform/merchants/${tenantDMerchantId}/approve`, {
      method: 'POST',
      headers: platformHeaders,
    });

    const tenantDLogin = await fetchHttp(`${baseUrl}/auth/merchant/login`, {
      method: 'POST',
      body: { email: tenantEmail, password: 'TenantDPassword123!' },
    });
    assert(tenantDLogin.status === 200, 'Tenant D logged in');
    const tenantDHeaders = { Authorization: `Bearer ${tenantDLogin.data.response.accessToken}` };

    // Tenant D attempts to view Tenant A's return
    const crossRes = await fetchHttp(`${baseUrl}/pos/returns/${return1.id}`, {
      headers: tenantDHeaders,
    });
    assert(crossRes.status === 404, 'Cross-tenant return access rejected with 404 Not Found');

    console.log('\n================================================================');
    console.log('🎉 ALL PHASE 12 (WP-11) RETURNS & REFUNDS TESTS PASSED!');
    console.log('================================================================\n');
  } finally {
    await app.close();
  }
}

runReturnsE2ETests().catch((err) => {
  console.error('E2E TEST FAILURE:', err);
  process.exit(1);
});
