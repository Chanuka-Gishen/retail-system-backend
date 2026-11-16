import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupplierChequeService } from '../services/supplier-cheque.service';
import {
  ClearChequeDto,
  BounceChequeDto,
  DepositChequeDto,
  CancelChequeDto,
  ListSupplierChequesQueryDto,
} from '../dto/supplier-cheque.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Purchasing - Supplier Cheques')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('purchasing/cheques')
export class SupplierChequeController {
  constructor(private chequeService: SupplierChequeService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter supplier cheques in the cheque register' })
  async listCheques(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListSupplierChequesQueryDto,
  ) {
    return this.chequeService.listCheques(user.merchantId!, query);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get automated cheque maturity reminder engine alerts (overdue, today, 3d, 7d)' })
  async getMaturityAlerts(@CurrentUser() user: AuthenticatedUserContext) {
    return this.chequeService.getMaturityAlerts(user.merchantId!);
  }

  @Get('pending-summary')
  @ApiOperation({ summary: 'Get pending cheques summary and upcoming maturing cheques for dashboard' })
  async getPendingSummary(@CurrentUser() user: AuthenticatedUserContext) {
    return this.chequeService.getPendingSummary(user.merchantId!);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get supplier cheque details and audit history' })
  async getChequeById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.chequeService.getChequeById(user.merchantId!, id);
  }

  @Post(':id/deposit')
  @ApiOperation({ summary: 'Mark cheque deposited in bank' })
  async depositCheque(
    @Param('id') id: string,
    @Body() dto: DepositChequeDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.chequeService.depositCheque(user.merchantId!, id, dto, user.userId);
  }

  @Post(':id/clear')
  @ApiOperation({ summary: 'Mark cheque cleared and honoured by bank' })
  async clearCheque(
    @Param('id') id: string,
    @Body() dto: ClearChequeDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.chequeService.clearCheque(user.merchantId!, id, dto, user.userId);
  }

  @Post(':id/bounce')
  @ApiOperation({ summary: 'Handle cheque bounce: atomically reverses invoice allocations & restores supplier balance' })
  async bounceCheque(
    @Param('id') id: string,
    @Body() dto: BounceChequeDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.chequeService.bounceCheque(user.merchantId!, id, dto, user.userId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel/void cheque: reverses invoice allocations & restores supplier balance' })
  async cancelCheque(
    @Param('id') id: string,
    @Body() dto: CancelChequeDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.chequeService.cancelCheque(user.merchantId!, id, dto, user.userId);
  }
}
