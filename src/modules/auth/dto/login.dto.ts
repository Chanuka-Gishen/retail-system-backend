import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class PlatformLoginDto {
  @ApiProperty({ example: 'superadmin@retailpos.com' })
  @IsEmail({}, { message: 'Invalid email address format' })
  email!: string;

  @ApiProperty({ example: 'SuperAdminPassword123!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;
}

export class MerchantLoginDto {
  @ApiProperty({ example: 'owner@urbanretail.com' })
  @IsEmail({}, { message: 'Invalid email address format' })
  email!: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;

  @ApiPropertyOptional({ example: 'MCH-001', description: 'Required only if user belongs to multiple merchants' })
  @IsOptional()
  @IsString()
  merchantCode?: string;
}
