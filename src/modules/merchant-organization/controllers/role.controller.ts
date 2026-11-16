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
import { RoleService } from '../services/role.service';
import { CreateCustomRoleDto, UpdateCustomRoleDto } from '../dto/role.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Merchant - Roles & Permissions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('merchant/roles')
export class RoleController {
  constructor(private roleService: RoleService) {}

  @Get('permissions')
  @ApiOperation({ summary: 'List all available granular system permissions' })
  async getAvailablePermissions() {
    return this.roleService.getAvailablePermissions();
  }

  @Get()
  @ApiOperation({ summary: 'List all available system and custom roles' })
  async listRoles(@CurrentUser() user: AuthenticatedUserContext) {
    return this.roleService.listRoles(user.merchantId!);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create custom role with granular permissions array' })
  async createCustomRole(
    @Body() dto: CreateCustomRoleDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.roleService.createCustomRole(user.merchantId!, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update custom role name, description, or permissions' })
  async updateCustomRole(
    @Param('id') id: string,
    @Body() dto: UpdateCustomRoleDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.roleService.updateCustomRole(user.merchantId!, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete custom role if no users are assigned' })
  async deleteCustomRole(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.roleService.deleteCustomRole(user.merchantId!, id);
  }
}
