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

  // Parse response headers and cookies
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
  console.log('=====================================================');
  console.log('🚀 STARTING AUTH & ACCESS CONTROL E2E TEST SUITE');
  console.log('=====================================================\n');

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
    // TEST 1: Health Check Endpoint
    // -----------------------------------------------------------------
    console.log('👉 [Test 1] Health Check Endpoint');
    const healthRes = await fetchHttp(`${baseUrl}/health`);
    assert(healthRes.status === 200, 'Health endpoint responds with 200 OK');
    assert(healthRes.data.responseCode === 'SUCCESS', 'Standard responseCode is SUCCESS');
    assert(healthRes.data.response.status === 'UP', 'Service status is UP');

    // -----------------------------------------------------------------
    // TEST 2: Platform SuperAdmin Authentication (Negative & Positive)
    // -----------------------------------------------------------------
    console.log('\n👉 [Test 2] Platform SuperAdmin Authentication');
    const badLogin = await fetchHttp(`${baseUrl}/auth/platform/login`, {
      method: 'POST',
      body: { email: 'superadmin@retailpos.com', password: 'WrongPassword999!' },
    });
    assert(badLogin.status === 401, 'Invalid password rejected with 401 Unauthorized');
    assert(badLogin.data.responseCode === 'ERR_UNAUTHORIZED', 'Error responseCode is ERR_UNAUTHORIZED');

    const superAdminLogin = await fetchHttp(`${baseUrl}/auth/platform/login`, {
      method: 'POST',
      body: { email: 'superadmin@retailpos.com', password: 'SuperAdminPassword123!' },
    });
    assert(superAdminLogin.status === 200, 'SuperAdmin login succeeds with 200 OK');
    assert(superAdminLogin.data.responseCode === 'SUCCESS', 'Login responseCode is SUCCESS');
    assert(typeof superAdminLogin.data.response.accessToken === 'string', 'Returns JWT access token');
    assert(superAdminLogin.data.response.user.role === 'SUPER_ADMIN', 'User role is SUPER_ADMIN');
    assert(superAdminLogin.data.response.user.isPlatformUser === true, 'isPlatformUser is true');
    assert(typeof superAdminLogin.cookies['refresh_token'] === 'string', 'Sets refresh_token in HttpOnly cookie');

    const platformAccessToken = superAdminLogin.data.response.accessToken;
    const initialPlatformRefreshToken = superAdminLogin.cookies['refresh_token']!;

    // -----------------------------------------------------------------
    // TEST 3: Authenticated Session Introspection (/auth/me)
    // -----------------------------------------------------------------
    console.log('\n👉 [Test 3] Session Introspection (/auth/me)');
    const unauthMe = await fetchHttp(`${baseUrl}/auth/me`);
    assert(unauthMe.status === 401, 'Unauthenticated /auth/me rejected with 401');

    const authMe = await fetchHttp(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${platformAccessToken}` },
    });
    assert(authMe.status === 200, 'Authenticated /auth/me succeeds with 200 OK');
    assert(authMe.data.response.email === 'superadmin@retailpos.com', 'Returns SuperAdmin email');
    assert(authMe.data.response.isPlatformUser === true, 'Returns isPlatformUser = true');

    // -----------------------------------------------------------------
    // TEST 4: Token Rotation (/auth/refresh)
    // -----------------------------------------------------------------
    console.log('\n👉 [Test 4] Token Rotation & Refresh');
    const refreshRes = await fetchHttp(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      cookies: { refresh_token: initialPlatformRefreshToken },
    });
    assert(refreshRes.status === 200, 'Token refresh succeeds with 200 OK');
    assert(typeof refreshRes.data.response.accessToken === 'string', 'Returns new rotated access token');
    assert(typeof refreshRes.cookies['refresh_token'] === 'string', 'Sets newly rotated refresh_token cookie');

    const rotatedPlatformRefreshToken = refreshRes.cookies['refresh_token']!;
    assert(
      rotatedPlatformRefreshToken !== initialPlatformRefreshToken,
      'Rotated refresh token is different from initial refresh token',
    );

    // -----------------------------------------------------------------
    // TEST 5: Token Reuse Detection & Automatic Session Revocation
    // -----------------------------------------------------------------
    console.log('\n👉 [Test 5] Security Invariant: Token Reuse Detection');
    // Try to re-use the OLD initial refresh token that was already rotated
    const reuseAttackRes = await fetchHttp(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      cookies: { refresh_token: initialPlatformRefreshToken },
    });
    assert(
      reuseAttackRes.status === 401,
      'Old refresh token reuse immediately blocked with 401 Unauthorized',
    );
    assert(
      reuseAttackRes.data.responseMessage.includes('reuse detected'),
      'Detects token reuse and flags security violation in message',
    );

    // Verify that ALL sessions for this user were revoked!
    const subsequentRefreshRes = await fetchHttp(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      cookies: { refresh_token: rotatedPlatformRefreshToken },
    });
    assert(
      subsequentRefreshRes.status === 401,
      'Previously valid session is also revoked following reuse detection',
    );

    // -----------------------------------------------------------------
    // TEST 6: Merchant User Authentication & Tenant Scoping
    // -----------------------------------------------------------------
    console.log('\n👉 [Test 6] Merchant User Authentication & Tenant Scoping');
    const merchantLoginRes = await fetchHttp(`${baseUrl}/auth/merchant/login`, {
      method: 'POST',
      body: { email: 'owner@urbanmart.com', password: 'UrbanOwner123!' },
    });
    assert(merchantLoginRes.status === 200, 'Merchant Owner login succeeds with 200 OK');
    assert(merchantLoginRes.data.response.user.isPlatformUser === false, 'isPlatformUser is false');
    assert(merchantLoginRes.data.response.user.merchantCode === 'MCH-TEST001', 'Tenant code is MCH-TEST001');
    assert(merchantLoginRes.data.response.user.role === 'MERCHANT_OWNER', 'User role is MERCHANT_OWNER');
    assert(merchantLoginRes.data.response.user.permissions[0] === '*', 'Merchant owner has wildcard permissions');
    assert(merchantLoginRes.data.response.user.branchIds.length > 0, 'Branch scope contains assigned branch ID');
    assert(merchantLoginRes.data.response.user.warehouseIds.length > 0, 'Warehouse scope contains assigned warehouse ID');

    const merchantAccessToken = merchantLoginRes.data.response.accessToken;
    const merchantRefreshToken = merchantLoginRes.cookies['refresh_token']!;

    // -----------------------------------------------------------------
    // TEST 7: Merchant Introspection (/auth/me)
    // -----------------------------------------------------------------
    console.log('\n👉 [Test 7] Merchant Introspection (/auth/me)');
    const merchantMe = await fetchHttp(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${merchantAccessToken}` },
    });
    assert(merchantMe.status === 200, 'Merchant /auth/me succeeds with 200 OK');
    assert(merchantMe.data.response.merchant.businessName === 'Urban Mart Superstores Ltd', 'Returns merchant entity details');
    assert(merchantMe.data.response.branches[0].code === 'BR-COLOMBO-01', 'Returns branch context');
    assert(merchantMe.data.response.warehouses[0].code === 'WH-CENTRAL-01', 'Returns warehouse context');

    // -----------------------------------------------------------------
    // TEST 8: Logout & Session Destruction
    // -----------------------------------------------------------------
    console.log('\n👉 [Test 8] Logout & Session Revocation');
    const logoutRes = await fetchHttp(`${baseUrl}/auth/logout`, {
      method: 'POST',
      cookies: { refresh_token: merchantRefreshToken },
    });
    assert(logoutRes.status === 200, 'Logout succeeds with 200 OK');

    const postLogoutRefresh = await fetchHttp(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      cookies: { refresh_token: merchantRefreshToken },
    });
    assert(postLogoutRefresh.status === 401, 'Revoked session cannot refresh tokens');

    console.log('\n=====================================================');
    console.log('🎉 ALL DUAL AUTH & ACCESS CONTROL E2E TESTS PASSED!');
    console.log('=====================================================\n');
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
