import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { PlatformUserRole } from '@/common/types';

export class CreatePlatformUserDto {
  @ApiProperty({ example: 'auditor@retailpos.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'AdminPass123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Audit' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Viewer' })
  @IsString()
  lastName!: string;

  @ApiProperty({
    enum: PlatformUserRole,
    default: PlatformUserRole.PLATFORM_VIEWER,
    description: 'Role: SUPER_ADMIN, PLATFORM_ADMIN, PLATFORM_SUPPORT, or PLATFORM_VIEWER (read-only)',
  })
  @IsEnum(PlatformUserRole)
  role!: PlatformUserRole;
}

export class UpdatePlatformUserDto {
  @ApiPropertyOptional({ example: 'Audit' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Viewer' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ enum: PlatformUserRole })
  @IsOptional()
  @IsEnum(PlatformUserRole)
  role?: PlatformUserRole;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'NewAdminPass123!' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
