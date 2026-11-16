import { PrismaClient, PlatformUserRole, SubscriptionTier } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Seeding default platform data...');

  // 1. Seed Platform SuperAdmin
  const superAdminEmail = 'superadmin@retailpos.com';
  const superAdminPassword = await bcrypt.hash('SuperAdminPassword123!', 10);

  const superAdmin = await prisma.platformUser.upsert({
    where: { email: superAdminEmail },
    update: {
      passwordHash: superAdminPassword,
      role: PlatformUserRole.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      email: superAdminEmail,
      passwordHash: superAdminPassword,
      firstName: 'Platform',
      lastName: 'SuperAdmin',
      role: PlatformUserRole.SUPER_ADMIN,
      isActive: true,
    },
  });
  console.log(`[Seed] Platform SuperAdmin ready: ${superAdmin.email} (ID: ${superAdmin.id})`);

  // 1.1 Seed Platform Viewer (View-Only Auditor)
  const viewerEmail = 'viewer@retailpos.com';
  const viewerPassword = await bcrypt.hash('ViewerPassword123!', 10);
  const platformViewer = await prisma.platformUser.upsert({
    where: { email: viewerEmail },
    update: {
      passwordHash: viewerPassword,
      role: PlatformUserRole.PLATFORM_VIEWER,
      isActive: true,
    },
    create: {
      email: viewerEmail,
      passwordHash: viewerPassword,
      firstName: 'Audit',
      lastName: 'Viewer',
      role: PlatformUserRole.PLATFORM_VIEWER,
      isActive: true,
    },
  });
  console.log(`[Seed] Platform Viewer ready: ${platformViewer.email} (Role: ${platformViewer.role})`);

  // 2. Seed Subscription Plans
  const plans = [
    {
      code: 'PLAN_BASIC',
      name: 'Basic Tier',
      tier: SubscriptionTier.BASIC,
      description: 'Ideal for single-location retail shops and small boutiques.',
      priceMonthly: 3500.0,
      priceQuarterly: 9500.0,
      priceAnnually: 35000.0,
      maxBranches: 1,
      maxWarehouses: 1,
      maxUsers: 3,
      maxProducts: 500,
      hasOfflinePos: true,
      hasAdvancedAccounting: false,
      isActive: true,
    },
    {
      code: 'PLAN_PRO',
      name: 'Professional Tier',
      tier: SubscriptionTier.PROFESSIONAL,
      description: 'Designed for growing retailers with up to 3 branch stores and central stock.',
      priceMonthly: 7500.0,
      priceQuarterly: 21000.0,
      priceAnnually: 75000.0,
      maxBranches: 3,
      maxWarehouses: 2,
      maxUsers: 10,
      maxProducts: 5000,
      hasOfflinePos: true,
      hasAdvancedAccounting: true,
      isActive: true,
    },
    {
      code: 'PLAN_ENT',
      name: 'Enterprise Tier',
      tier: SubscriptionTier.ENTERPRISE,
      description: 'High-volume retail chains with multi-branch, multi-warehouse, and full accounting.',
      priceMonthly: 18000.0,
      priceQuarterly: 50000.0,
      priceAnnually: 180000.0,
      maxBranches: 10,
      maxWarehouses: 5,
      maxUsers: 50,
      maxProducts: 50000,
      hasOfflinePos: true,
      hasAdvancedAccounting: true,
      isActive: true,
    },
  ];

  for (const plan of plans) {
    const createdPlan = await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    });
    console.log(`[Seed] Subscription Plan ready: ${createdPlan.name} (${createdPlan.code})`);
  }

  console.log('[Seed] Database seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('[Seed] Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
