import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MerchantUserService } from '../services/merchant-user.service';
import { CreateMerchantStaffDto, UpdateMerchantStaffDto } from '../dto/user.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Merchant - Staff Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('merchant/users')
export class MerchantUserController {
  constructor(private userService: MerchantUserService) {}

  @Get()
  @ApiOperation({ summary: 'List all staff users in merchant organization' })
  async listUsers(@CurrentUser() user: AuthenticatedUserContext) {
    return this.userService.listUsers(user.merchantId!);
  }

  @Get('quota')
  @ApiOperation({ summary: 'Get merchant staff user subscription limit and current usage' })
  async getUserQuota(@CurrentUser() user: AuthenticatedUserContext) {
    return this.userService.getUserQuota(user.merchantId!);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get staff user details by ID' })
  async getUserById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.userService.getUserById(user.merchantId!, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new staff user (verifies plan maxUsers limit)' })
  async createUser(
    @Body() dto: CreateMerchantStaffDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.userService.createUser(user.merchantId!, dto, user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update staff user role, branch scoping, or status' })
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateMerchantStaffDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.userService.updateUser(user.merchantId!, id, dto, user.userId);
  }
}
