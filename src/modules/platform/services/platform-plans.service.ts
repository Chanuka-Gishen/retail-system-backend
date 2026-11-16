import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreatePlanDto, UpdatePlanDto } from '../dto/platform-plans.dto';

@Injectable()
export class PlatformPlansService {
  private readonly logger = new Logger(PlatformPlansService.name);

  constructor(private db: DatabaseService) {}

  async listPlans() {
    return this.db.subscriptionPlan.findMany({
      orderBy: { priceMonthly: 'asc' },
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    });
  }

  async getPlanById(id: string) {
    const plan = await this.db.subscriptionPlan.findUnique({
      where: { id },
      include: {
        subscriptions: {
          take: 10,
          include: { merchant: true },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException(`Subscription plan ${id} not found.`);
    }

    return plan;
  }

  async createPlan(dto: CreatePlanDto) {
    const existing = await this.db.subscriptionPlan.findUnique({
      where: { code: dto.code.trim().toUpperCase() },
    });

    if (existing) {
      throw new ConflictException(`Plan with code ${dto.code} already exists.`);
    }

    const plan = await this.db.subscriptionPlan.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        tier: dto.tier as any,
        description: dto.description?.trim(),
        priceMonthly: dto.priceMonthly,
        priceQuarterly: dto.priceQuarterly,
        priceAnnually: dto.priceAnnually,
        maxBranches: dto.maxBranches,
        maxWarehouses: dto.maxWarehouses,
        maxUsers: dto.maxUsers,
        maxProducts: dto.maxProducts,
        hasOfflinePos: dto.hasOfflinePos ?? true,
        hasAdvancedAccounting: dto.hasAdvancedAccounting ?? true,
        isActive: true,
      },
    });

    this.logger.log(`Created subscription plan: ${plan.name} (${plan.code})`);
    return plan;
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.db.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Subscription plan ${id} not found.`);
    }

    const updated = await this.db.subscriptionPlan.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.tier ? { tier: dto.tier as any } : {}),
        ...(dto.priceMonthly !== undefined ? { priceMonthly: dto.priceMonthly } : {}),
        ...(dto.priceQuarterly !== undefined ? { priceQuarterly: dto.priceQuarterly } : {}),
        ...(dto.priceAnnually !== undefined ? { priceAnnually: dto.priceAnnually } : {}),
        ...(dto.maxBranches !== undefined ? { maxBranches: dto.maxBranches } : {}),
        ...(dto.maxWarehouses !== undefined ? { maxWarehouses: dto.maxWarehouses } : {}),
        ...(dto.maxUsers !== undefined ? { maxUsers: dto.maxUsers } : {}),
        ...(dto.maxProducts !== undefined ? { maxProducts: dto.maxProducts } : {}),
        ...(dto.hasOfflinePos !== undefined ? { hasOfflinePos: dto.hasOfflinePos } : {}),
        ...(dto.hasAdvancedAccounting !== undefined ? { hasAdvancedAccounting: dto.hasAdvancedAccounting } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return updated;
  }

  async deletePlan(id: string) {
    const plan = await this.db.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Subscription plan ${id} not found.`);
    }

    // Soft delete by setting isActive to false
    return this.db.subscriptionPlan.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
