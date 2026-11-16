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
import { PosTerminalService } from '../services/pos-terminal.service';
import {
  CreatePosTerminalDto,
  UpdatePosTerminalDto,
  ListPosTerminalsQueryDto,
} from '../dto/terminal.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('POS - Terminals')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('pos/terminals')
export class PosTerminalController {
  constructor(private terminalService: PosTerminalService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter POS checkout terminals' })
  @ApiResponse({ status: 200, description: 'Paginated list of POS terminals' })
  async listTerminals(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListPosTerminalsQueryDto,
  ) {
    return this.terminalService.listTerminals(user.merchantId!, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get POS terminal details with active session indicator' })
  @ApiResponse({ status: 200, description: 'Terminal details' })
  async getTerminalById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.terminalService.getTerminalById(user.merchantId!, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new POS terminal for a branch' })
  @ApiResponse({ status: 201, description: 'POS terminal created' })
  async createTerminal(
    @Body() dto: CreatePosTerminalDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.terminalService.createTerminal(user.merchantId!, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update POS terminal details or hardware binding' })
  @ApiResponse({ status: 200, description: 'POS terminal updated' })
  async updateTerminal(
    @Param('id') id: string,
    @Body() dto: UpdatePosTerminalDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.terminalService.updateTerminal(user.merchantId!, id, dto);
  }
}
