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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupplierReturnService } from '../services/supplier-return.service';
import {
  CreateSupplierReturnDto,
  ListSupplierReturnsQueryDto,
} from '../dto/supplier-return.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Purchasing - Supplier Returns')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('purchasing/returns')
export class SupplierReturnController {
  constructor(private returnService: SupplierReturnService) {}

  @Get()
  @ApiOperation({ summary: 'List supplier returns' })
  async listReturns(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListSupplierReturnsQueryDto,
  ) {
    return this.returnService.listReturns(user.merchantId!, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get supplier return details' })
  async getReturnById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.returnService.getReturnById(user.merchantId!, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create supplier return (DRAFT)' })
  async createReturn(
    @Body() dto: CreateSupplierReturnDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.returnService.createReturn(user.merchantId!, dto, user.userId);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve supplier return' })
  async approveReturn(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.returnService.approveReturn(user.merchantId!, id, user.userId);
  }

  @Post(':id/dispatch')
  @ApiOperation({ summary: 'Dispatch goods to supplier, reducing inventory and generating credit note settlement' })
  async dispatchReturn(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.returnService.dispatchReturn(user.merchantId!, id, user.userId);
  }
}
