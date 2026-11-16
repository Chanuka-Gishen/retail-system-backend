import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformPlansService } from '../services/platform-plans.service';
import { CreatePlanDto, UpdatePlanDto } from '../dto/platform-plans.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard';

@ApiTags('Platform - Subscription Plans')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('platform/plans')
export class PlatformPlansController {
  constructor(private plansService: PlatformPlansService) {}

  @Get()
  @ApiOperation({ summary: 'List all subscription tiers and plans' })
  async listPlans() {
    return this.plansService.listPlans();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get plan details by ID' })
  async getPlanById(@Param('id') id: string) {
    return this.plansService.getPlanById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new subscription plan' })
  async createPlan(@Body() dto: CreatePlanDto) {
    return this.plansService.createPlan(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update existing subscription plan' })
  async updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.updatePlan(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate subscription plan' })
  async deletePlan(@Param('id') id: string) {
    return this.plansService.deletePlan(id);
  }
}
