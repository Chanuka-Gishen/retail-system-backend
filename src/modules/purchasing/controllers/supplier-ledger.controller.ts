import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupplierLedgerService } from '../services/supplier-ledger.service';
import { SupplierLedgerQueryDto } from '../dto/supplier-ledger.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Purchasing - Supplier Ledger & Statements')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('purchasing/ledger')
export class SupplierLedgerController {
  constructor(private ledgerService: SupplierLedgerService) {}

  @Get('statement')
  @ApiOperation({ summary: 'Get supplier statement of account with running balance and transaction timeline' })
  async getSupplierStatement(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: SupplierLedgerQueryDto,
  ) {
    return this.ledgerService.getSupplierStatement(user.merchantId!, query);
  }
}
