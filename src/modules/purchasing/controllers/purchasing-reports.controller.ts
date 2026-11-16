import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PurchasingReportsService } from '../services/purchasing-reports.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Purchasing - Reports & Analytics')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('purchasing/reports')
export class PurchasingReportsController {
  constructor(private reportsService: PurchasingReportsService) {}

  @Get('ageing')
  @ApiOperation({ summary: 'Supplier payables ageing report (Current, 1-30, 31-60, 61-90, 90+ days)' })
  async getAgeingReport(@CurrentUser() user: AuthenticatedUserContext) {
    return this.reportsService.getAgeingReport(user.merchantId!);
  }

  @Get('spend')
  @ApiOperation({ summary: 'Procurement spend report grouped by supplier and category' })
  async getSpendReport(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getSpendReport(user.merchantId!, startDate, endDate);
  }

  @Get('discrepancies')
  @ApiOperation({ summary: '3-Way matching invoice discrepancy report' })
  async getDiscrepancyReport(@CurrentUser() user: AuthenticatedUserContext) {
    return this.reportsService.getDiscrepancyReport(user.merchantId!);
  }
}
