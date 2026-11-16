import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CashSessionService } from '../services/cash-session.service';
import {
  OpenCashSessionDto,
  CloseCashSessionDto,
  CreateCashTransactionDto,
  ReconcileCashSessionDto,
  ListCashSessionsQueryDto,
} from '../dto/cash-session.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('POS - Cash Drawer Sessions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('pos/sessions')
export class CashSessionController {
  constructor(private sessionService: CashSessionService) {}

  @Get('active')
  @ApiOperation({ summary: 'Get current active open cash drawer session for terminal or cashier' })
  @ApiResponse({ status: 200, description: 'Active open session with live calculated expected cash breakdown' })
  async getActiveSession(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query('posTerminalId') posTerminalId?: string,
  ) {
    return this.sessionService.getActiveSession(
      user.merchantId!,
      posTerminalId,
      posTerminalId ? undefined : user.userId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List and filter cash drawer sessions history' })
  @ApiResponse({ status: 200, description: 'Paginated list of cash drawer sessions' })
  async listSessions(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListCashSessionsQueryDto,
  ) {
    return this.sessionService.listSessions(user.merchantId!, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get cash drawer session details by ID' })
  @ApiResponse({ status: 200, description: 'Full session details with operations and discrepancy analysis' })
  async getSessionById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.sessionService.getSessionById(user.merchantId!, id);
  }

  @Post('open')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Open a new cash drawer shift session with opening float' })
  @ApiResponse({ status: 201, description: 'Cash drawer session opened' })
  async openSession(
    @Body() dto: OpenCashSessionDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.sessionService.openSession(user.merchantId!, dto, user.userId);
  }

  @Post(':id/transactions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record cash in (float top-up) or cash out (safe drop / expense) in active drawer' })
  @ApiResponse({ status: 201, description: 'Cash drawer transaction recorded' })
  async addTransaction(
    @Param('id') id: string,
    @Body() dto: CreateCashTransactionDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.sessionService.addTransaction(user.merchantId!, id, dto, user.userId);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close cash drawer session: records physical counted cash and computes overage/shortage' })
  @ApiResponse({ status: 200, description: 'Cash drawer session closed with discrepancy analysis' })
  async closeSession(
    @Param('id') id: string,
    @Body() dto: CloseCashSessionDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.sessionService.closeSession(user.merchantId!, id, dto, user.userId);
  }

  @Post(':id/reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manager review & reconciliation sign-off on closed session' })
  @ApiResponse({ status: 200, description: 'Cash drawer session reconciled' })
  async reconcileSession(
    @Param('id') id: string,
    @Body() dto: ReconcileCashSessionDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.sessionService.reconcileSession(user.merchantId!, id, dto, user.userId);
  }
}
