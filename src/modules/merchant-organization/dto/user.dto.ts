import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { MerchantUserRole } from '@/common/types';

export class CreateMerchantStaffDto {
  @ApiProperty({ example: 'cashier1@urbanmart.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'TemporaryPassword123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Nimal' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Sirisena' })
  @IsString()
  lastName!: string;

  @ApiPropertyOptional({ example: '+94711122334' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: MerchantUserRole, default: MerchantUserRole.CASHIER })
  @IsEnum(MerchantUserRole)
  role!: MerchantUserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  customRoleId?: string;

  @ApiPropertyOptional({ type: [String], example: ['branch-uuid-1'] })
  @IsOptional()
  @IsArray()
  branchIds?: string[];

  @ApiPropertyOptional({ type: [String], example: ['warehouse-uuid-1'] })
  @IsOptional()
  @IsArray()
  warehouseIds?: string[];
}

export class UpdateMerchantStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: MerchantUserRole })
  @IsOptional()
  @IsEnum(MerchantUserRole)
  role?: MerchantUserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  customRoleId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  branchIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  warehouseIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'NewSecurePassword123!' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
