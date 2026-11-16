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
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PlatformUsersService } from '../services/platform-users.service';
import { CreatePlatformUserDto, UpdatePlatformUserDto } from '../dto/platform-users.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext, PlatformUserRole } from '@/common/types';

@ApiTags('Platform - Admin Users & Roles')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('platform/users')
export class PlatformUsersController {
  constructor(private usersService: PlatformUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all platform admin users (accessible to admins and viewers)' })
  @ApiResponse({ status: 200, description: 'List of platform users' })
  async listUsers() {
    return this.usersService.listUsers();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get platform user details by ID' })
  async getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new platform user (Super Admin only)' })
  async createUser(
    @Body() dto: CreatePlatformUserDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    if (user.role !== PlatformUserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admins can create platform staff accounts.');
    }
    return this.usersService.createUser(dto, user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update platform user role, status or credentials (Super Admin only)' })
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformUserDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    if (user.role !== PlatformUserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admins can update platform staff accounts.');
    }
    return this.usersService.updateUser(id, dto, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete platform user (Super Admin only)' })
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    if (user.role !== PlatformUserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admins can delete platform staff accounts.');
    }
    return this.usersService.deleteUser(id, user.userId);
  }
}
