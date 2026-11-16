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
import { CustomerService } from '../services/customer.service';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  ListCustomersQueryDto,
  AdjustLoyaltyPointsDto,
  SettleBalanceDto,
} from '../dto/customer.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Customers & Loyalty Engine')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('customers')
export class CustomerController {
  constructor(private customerService: CustomerService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new customer profile' })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  @ApiResponse({ status: 409, description: 'Customer code already exists' })
  async createCustomer(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.customerService.createCustomer(user.merchantId!, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List and search customers by name, phone, or code' })
  @ApiResponse({ status: 200, description: 'Paginated list of customers' })
  async listCustomers(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() query: ListCustomersQueryDto,
  ) {
    return this.customerService.listCustomers(user.merchantId!, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer profile with transaction summary' })
  @ApiResponse({ status: 200, description: 'Customer details' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getCustomerById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.customerService.getCustomerById(user.merchantId!, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update customer details and credit limits' })
  @ApiResponse({ status: 200, description: 'Customer updated successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async updateCustomer(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.customerService.updateCustomer(user.merchantId!, id, dto);
  }

  @Post(':id/loyalty-adjust')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grant promotional points or manually redeem loyalty points' })
  @ApiResponse({ status: 200, description: 'Points balance adjusted' })
  @ApiResponse({ status: 400, description: 'Insufficient loyalty points' })
  async adjustLoyaltyPoints(
    @Param('id') id: string,
    @Body() dto: AdjustLoyaltyPointsDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.customerService.adjustLoyaltyPoints(user.merchantId!, id, dto);
  }

  @Post(':id/settle-balance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record payment towards customer outstanding credit balance' })
  @ApiResponse({ status: 200, description: 'Balance settled' })
  @ApiResponse({ status: 400, description: 'No outstanding balance' })
  async settleBalance(
    @Param('id') id: string,
    @Body() dto: SettleBalanceDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.customerService.settleBalance(user.merchantId!, id, dto);
  }

  @Get(':id/statement')
  @ApiOperation({ summary: 'Get full statement of account with purchases, returns, and credit usage' })
  @ApiResponse({ status: 200, description: 'Account statement' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getCustomerStatement(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.customerService.getCustomerStatement(user.merchantId!, id);
  }
}
