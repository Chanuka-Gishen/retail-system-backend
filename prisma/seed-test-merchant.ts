import { PrismaClient, MerchantStatus, MerchantUserRole, SubscriptionStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function seedTestMerchant() {
  console.log('[Seed] Seeding sample merchant tenant...');

  // 1. Get Plan
  const plan = await prisma.subscriptionPlan.findUniqueOrThrow({
    where: { code: 'PLAN_PRO' },
  });

  // 2. Create Merchant
  const merchantCode = 'MCH-TEST001';
  const merchant = await prisma.merchant.upsert({
    where: { code: merchantCode },
    update: {
      status: MerchantStatus.ACTIVE,
    },
    create: {
      code: merchantCode,
      businessName: 'Urban Mart Superstores Ltd',
      tradeName: 'Urban Mart',
      contactEmail: 'contact@urbanmart.com',
      contactPhone: '+94771234567',
      status: MerchantStatus.ACTIVE,
      currency: 'LKR',
      timezone: 'Asia/Colombo',
    },
  });

  // 3. Create Subscription
  await prisma.merchantSubscription.upsert({
    where: { id: merchant.id }, // dummy unique or create
    update: {},
    create: {
      id: merchant.id,
      merchantId: merchant.id,
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    },
  });

  // 4. Create Main Branch
  const branch = await prisma.branch.upsert({
    where: {
      merchantId_code: {
        merchantId: merchant.id,
        code: 'BR-COLOMBO-01',
      },
    },
    update: {},
    create: {
      merchantId: merchant.id,
      code: 'BR-COLOMBO-01',
      name: 'Colombo Flagship Store',
      address: '123 Galle Road, Colombo 03',
      phone: '+94112345678',
      isMain: true,
      isActive: true,
    },
  });

  // 5. Create Main Warehouse
  const warehouse = await prisma.warehouse.upsert({
    where: {
      merchantId_code: {
        merchantId: merchant.id,
        code: 'WH-CENTRAL-01',
      },
    },
    update: {},
    create: {
      merchantId: merchant.id,
      code: 'WH-CENTRAL-01',
      name: 'Central Distribution Warehouse',
      address: '45 Kelaniya Industrial Zone',
      isMain: true,
      isActive: true,
    },
  });

  // Link Branch to default Warehouse
  await prisma.branch.update({
    where: { id: branch.id },
    data: { defaultWarehouseId: warehouse.id },
  });

  // 6. Create Merchant Owner User
  const ownerEmail = 'owner@urbanmart.com';
  const passwordHash = await bcrypt.hash('UrbanOwner123!', 10);

  const owner = await prisma.merchantUser.upsert({
    where: {
      merchantId_email: {
        merchantId: merchant.id,
        email: ownerEmail,
      },
    },
    update: {
      passwordHash,
      isActive: true,
      isOwner: true,
      role: MerchantUserRole.MERCHANT_OWNER,
    },
    create: {
      merchantId: merchant.id,
      email: ownerEmail,
      passwordHash,
      firstName: 'Samantha',
      lastName: 'Perera',
      role: MerchantUserRole.MERCHANT_OWNER,
      isOwner: true,
      isActive: true,
    },
  });

  // Grant Branch & Warehouse Access
  await prisma.merchantUserBranchAccess.upsert({
    where: {
      merchantUserId_branchId: {
        merchantUserId: owner.id,
        branchId: branch.id,
      },
    },
    update: {},
    create: {
      merchantUserId: owner.id,
      branchId: branch.id,
    },
  });

  await prisma.merchantUserWarehouseAccess.upsert({
    where: {
      merchantUserId_warehouseId: {
        merchantUserId: owner.id,
        warehouseId: warehouse.id,
      },
    },
    update: {},
    create: {
      merchantUserId: owner.id,
      warehouseId: warehouse.id,
    },
  });

  console.log(`[Seed] Sample Merchant Ready: ${merchant.businessName} (${merchant.code})`);
  console.log(`[Seed] Merchant Owner: ${owner.email} (Password: UrbanOwner123!)`);
  console.log(`[Seed] Branch: ${branch.name} (${branch.code}), Warehouse: ${warehouse.name} (${warehouse.code})`);
}

if (require.main === module) {
  seedTestMerchant()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
