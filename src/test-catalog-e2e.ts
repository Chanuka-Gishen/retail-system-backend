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

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED ASSERTION: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✔ PASSED: ${message}`);
}

async function runCatalogE2ETests() {
  console.log('================================================================');
  console.log('🚀 STARTING PRODUCT & CATALOG MANAGEMENT (PHASE 6) E2E TESTS');
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

  const testPort = 4097;
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
    // STEP 2: Category Tree Hierarchy
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 2] Category Hierarchy Management');
    const parentCatRes = await fetchHttp(`${baseUrl}/catalog/categories`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: `CAT-BEV-${Date.now().toString().slice(-4)}`,
        name: 'Beverages',
        description: 'All liquid beverages and drinks',
      },
    });
    assert(parentCatRes.status === 201, 'Parent category created');
    const parentCategory = parentCatRes.data.response;

    const childCatRes = await fetchHttp(`${baseUrl}/catalog/categories`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: `CAT-HOT-${Date.now().toString().slice(-4)}`,
        name: 'Hot Beverages & Tea',
        parentId: parentCategory.id,
      },
    });
    assert(childCatRes.status === 201, 'Child category created with parentId');
    const childCategory = childCatRes.data.response;

    const listCatRes = await fetchHttp(`${baseUrl}/catalog/categories`, {
      headers: authHeaders,
    });
    assert(listCatRes.status === 200, 'Categories listed successfully');
    assert(listCatRes.data.response.length >= 2, 'Categories include parent and child');

    // -----------------------------------------------------------------
    // STEP 3: Brand Management
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 3] Brand Registry');
    const brandCode = `BRD-DILMAH-${Date.now().toString().slice(-4)}`;
    const brandRes = await fetchHttp(`${baseUrl}/catalog/brands`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: brandCode,
        name: 'Dilmah Ceylon Tea',
      },
    });
    assert(brandRes.status === 201, 'Brand created successfully');
    const brand = brandRes.data.response;

    // -----------------------------------------------------------------
    // STEP 4: Tax Profiles
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 4] Tax Profiles');
    const taxCode = `TAX-VAT18-${Date.now().toString().slice(-4)}`;
    const taxRes = await fetchHttp(`${baseUrl}/catalog/tax-profiles`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: taxCode,
        name: 'Standard VAT 18%',
        ratePercentage: 18.0,
        isInclusive: false,
      },
    });
    assert(taxRes.status === 201, 'Tax profile created successfully');
    const taxProfile = taxRes.data.response;

    // -----------------------------------------------------------------
    // STEP 5: Simple Product Master (Single Default Variant)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 5] Simple Product Master (hasVariants: false)');
    const singleProductCode = `PRD-TEA-${Date.now().toString().slice(-4)}`;
    const singleProductRes = await fetchHttp(`${baseUrl}/catalog/products`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: singleProductCode,
        name: 'Dilmah Premium Ceylon Tea 100g',
        description: 'Single origin pure Ceylon black tea',
        categoryId: childCategory.id,
        brandId: brand.id,
        taxProfileId: taxProfile.id,
        unit: 'PKT',
        hasVariants: false,
        barcode: '4791234567890',
        costPrice: 280.0,
        sellingPrice: 450.0,
        minSellingPrice: 420.0,
        reorderPoint: 25,
      },
    });
    assert(singleProductRes.status === 201, 'Simple product created');
    const singleProduct = singleProductRes.data.response;
    assert(singleProduct.variants.length === 1, 'Auto-created 1 default variant');
    assert(singleProduct.variants[0].sku === singleProductCode, 'Default variant SKU matches product code');
    assert(singleProduct.variants[0].stockBalances.length >= 1, 'Stock balances initialized in warehouses');

    // -----------------------------------------------------------------
    // STEP 6: Multi-Variant Matrix Product (hasVariants: true)
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 6] Multi-Variant Matrix Product (hasVariants: true)');
    const multiProductCode = `PRD-CFB-${Date.now().toString().slice(-4)}`;
    const multiProductRes = await fetchHttp(`${baseUrl}/catalog/products`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: multiProductCode,
        name: 'Urban Roast Arabica Coffee Beans',
        categoryId: parentCategory.id,
        brandId: brand.id,
        taxProfileId: taxProfile.id,
        unit: 'BAG',
        hasVariants: true,
        variants: [
          {
            sku: `${multiProductCode}-250G`,
            barcode: '479000000001',
            variantName: 'Arabica Coffee Beans - 250g Dark Roast',
            attributeValues: { Weight: '250g', Roast: 'Dark' },
            costPrice: 900.0,
            sellingPrice: 1500.0,
            minSellingPrice: 1400.0,
            reorderPoint: 15,
          },
          {
            sku: `${multiProductCode}-500G`,
            barcode: '479000000002',
            variantName: 'Arabica Coffee Beans - 500g Dark Roast',
            attributeValues: { Weight: '500g', Roast: 'Dark' },
            costPrice: 1700.0,
            sellingPrice: 2800.0,
            minSellingPrice: 2600.0,
            reorderPoint: 10,
          },
        ],
      },
    });
    assert(multiProductRes.status === 201, 'Multi-variant product created');
    const multiProduct = multiProductRes.data.response;
    assert(multiProduct.variants.length === 2, 'Created 2 variants in matrix');
    const variant250g = multiProduct.variants[0];

    // -----------------------------------------------------------------
    // STEP 7: Add Variant to Existing Product
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 7] Add Variant to Existing Product');
    const addVariantRes = await fetchHttp(`${baseUrl}/catalog/products/${multiProduct.id}/variants`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        sku: `${multiProductCode}-1KG`,
        barcode: '479000000003',
        variantName: 'Arabica Coffee Beans - 1kg Dark Roast',
        attributeValues: { Weight: '1kg', Roast: 'Dark' },
        costPrice: 3200.0,
        sellingPrice: 5200.0,
        minSellingPrice: 5000.0,
        reorderPoint: 5,
      },
    });
    assert(addVariantRes.status === 201, 'Successfully added 3rd variant to product');

    // -----------------------------------------------------------------
    // STEP 8: Update Variant Pricing
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 8] Update Variant Pricing');
    const updateVariantRes = await fetchHttp(`${baseUrl}/catalog/variants/${variant250g.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: {
        sellingPrice: 1550.0,
      },
    });
    assert(updateVariantRes.status === 200, 'Variant updated');
    assert(Number(updateVariantRes.data.response.sellingPrice) === 1550.0, 'Variant price updated to 1550');

    // -----------------------------------------------------------------
    // STEP 9: Catalog Filtering & Barcode Search
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 9] Product Filtering & Barcode Search');
    const searchByBarcodeRes = await fetchHttp(`${baseUrl}/catalog/products?search=479000000002`, {
      headers: authHeaders,
    });
    assert(searchByBarcodeRes.status === 200, 'Search by barcode succeeds');
    assert(searchByBarcodeRes.data.response.length >= 1, 'Found product by variant barcode');
    assert(searchByBarcodeRes.data.response[0].code === multiProductCode, 'Barcode matched Coffee Beans');

    // -----------------------------------------------------------------
    // STEP 10: POS Catalog Snapshot for Offline Caching
    // -----------------------------------------------------------------
    console.log('\n👉 [Step 10] POS Offline Catalog Snapshot (/pos/catalog-snapshot)');
    const snapshotRes = await fetchHttp(`${baseUrl}/pos/catalog-snapshot`, {
      headers: authHeaders,
    });
    assert(snapshotRes.status === 200, 'POS snapshot returns 200 OK');
    assert(Array.isArray(snapshotRes.data.response.categories), 'Snapshot includes categories');
    assert(Array.isArray(snapshotRes.data.response.taxProfiles), 'Snapshot includes tax profiles');
    assert(Array.isArray(snapshotRes.data.response.products), 'Snapshot includes products');
    assert(typeof snapshotRes.data.response.syncedAt === 'string', 'Snapshot includes syncedAt timestamp');

    console.log('\n================================================================');
    console.log('🎉 ALL PHASE 6 (PRODUCT & CATALOG) E2E TESTS PASSED CLEANLY!');
    console.log('================================================================\n');
  } finally {
    await app.close();
  }
}

runCatalogE2ETests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
