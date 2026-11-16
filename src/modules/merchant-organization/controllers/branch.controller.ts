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
import { BranchService } from '../services/branch.service';
import { CreateBranchDto, UpdateBranchDto } from '../dto/branch.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@/common/types';

@ApiTags('Merchant - Branches')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('merchant/branches')
export class BranchController {
  constructor(private branchService: BranchService) {}

  @Get()
  @ApiOperation({ summary: 'List all physical branch stores for current merchant' })
  async listBranches(@CurrentUser() user: AuthenticatedUserContext) {
    return this.branchService.listBranches(user.merchantId!);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get branch details by ID' })
  async getBranchById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.branchService.getBranchById(user.merchantId!, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new branch store (verifies plan maxBranches limit)' })
  async createBranch(
    @Body() dto: CreateBranchDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.branchService.createBranch(user.merchantId!, dto, user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update branch store information' })
  async updateBranch(
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.branchService.updateBranch(user.merchantId!, id, dto, user.userId);
  }
}
