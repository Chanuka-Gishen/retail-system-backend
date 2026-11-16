import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AccountingService } from '../services/accounting.service';
import {
  CreateAccountDto,
  UpdateAccountDto,
  CreateJournalEntryDto,
  ListJournalEntriesQueryDto,
  FinancialReportQueryDto,
} from '../dto/accounting.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Accounting - Double-Entry Ledger')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private accountingService: AccountingService) {}

  @Get('accounts')
  @ApiOperation({ summary: 'List merchant Chart of Accounts with current balances' })
  @ApiResponse({ status: 200, description: 'Chart of Accounts' })
  async listAccounts(@CurrentUser() user: AuthenticatedUserContext) {
    return this.accountingService.listAccounts(user.merchantId!);
  }

  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create custom account in Chart of Accounts' })
  @ApiResponse({ status: 201, description: 'Account created' })
  @ApiResponse({ status: 409, description: 'Account code already exists' })
  async createAccount(
    @Body() dto: CreateAccountDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.accountingService.createAccount(user.merchantId!, dto);
  }

  @Get('accounts/:id')
  @ApiOperation({ summary: 'Get account details with ledger line history' })
  @ApiResponse({ status: 200, description: 'Account details' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async getAccountById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.accountingService.getAccountById(user.merchantId!, id);
  }

  @Put('accounts/:id')
  @ApiOperation({ summary: 'Update account details' })
  @ApiResponse({ status: 200, description: 'Account updated' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async updateAccount(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.accountingService.updateAccount(user.merchantId!, id, dto);
  }

  @Post('journal-entries')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Post balanced double-entry journal voucher (validates sum debits == sum credits)',
  })
  @ApiResponse({ status: 201, description: 'Journal entry posted' })
  @ApiResponse({ status: 400, description: 'Imbalance between debits and credits' })
  async createJournalEntry(
    @Body() dto: CreateJournalEntryDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.accountingService.createJournalEntry(user.merchantId!, dto, user.userId);
  }

  @Get('journal-entries')
  @ApiOperation({ summary: 'List and filter journal entries with lines' })
  @ApiResponse({ status: 200, description: 'Paginated list of journal entries' })
  async listJournalEntries(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListJournalEntriesQueryDto,
  ) {
    return this.accountingService.listJournalEntries(user.merchantId!, query);
  }

  @Post('journal-entries/:id/reverse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reverse a posted journal entry with an inverse reversing voucher' })
  @ApiResponse({ status: 200, description: 'Reversing entry posted' })
  @ApiResponse({ status: 400, description: 'Entry already reversed' })
  async reverseJournalEntry(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.accountingService.reverseJournalEntry(
      user.merchantId!,
      id,
      reason || 'Reversal requested by user',
      user.userId,
    );
  }

  @Get('reports/trial-balance')
  @ApiOperation({ summary: 'Generate balanced Trial Balance report' })
  @ApiResponse({ status: 200, description: 'Trial Balance report' })
  async getTrialBalance(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: FinancialReportQueryDto,
  ) {
    return this.accountingService.getTrialBalance(user.merchantId!, query);
  }

  @Get('reports/profit-and-loss')
  @ApiOperation({ summary: 'Generate Profit and Loss (Income Statement) report' })
  @ApiResponse({ status: 200, description: 'Profit and Loss report' })
  async getProfitAndLoss(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: FinancialReportQueryDto,
  ) {
    return this.accountingService.getProfitAndLoss(user.merchantId!, query);
  }

  @Get('reports/balance-sheet')
  @ApiOperation({ summary: 'Generate Balance Sheet statement (Assets = Liabilities + Equity)' })
  @ApiResponse({ status: 200, description: 'Balance Sheet report' })
  async getBalanceSheet(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: FinancialReportQueryDto,
  ) {
    return this.accountingService.getBalanceSheet(user.merchantId!, query);
  }
}
