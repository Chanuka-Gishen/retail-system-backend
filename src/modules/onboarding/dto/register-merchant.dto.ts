import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { BillingCycle } from '@/common/types';

export class RegisterMerchantDto {
  @ApiProperty({ example: 'Apex Retail Enterprises Ltd' })
  @IsString()
  @MinLength(2, { message: 'Business name must be at least 2 characters long' })
  businessName!: string;

  @ApiPropertyOptional({ example: 'Apex Mart' })
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiPropertyOptional({ example: 'VAT-102938475' })
  @IsOptional()
  @IsString()
  taxNumber?: string;

  @ApiProperty({ example: 'admin@apexmart.com' })
  @IsEmail({}, { message: 'Valid contact email is required' })
  contactEmail!: string;

  @ApiProperty({ example: '+94771234888' })
  @IsString()
  @MinLength(8, { message: 'Valid contact phone number is required' })
  contactPhone!: string;

  @ApiPropertyOptional({ example: 'LKR', default: 'LKR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'Asia/Colombo', default: 'Asia/Colombo' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ example: 'Kamal' })
  @IsString()
  ownerFirstName!: string;

  @ApiProperty({ example: 'Gunaratne' })
  @IsString()
  ownerLastName!: string;

  @ApiProperty({ example: 'SecurePassword123!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;

  @ApiProperty({ example: 'b0e51240-621f-4fcb-861c-8b89e3ec0199' })
  @IsUUID('4', { message: 'Valid subscription plan ID is required' })
  planId!: string;

  @ApiProperty({ enum: BillingCycle, default: BillingCycle.MONTHLY })
  @IsEnum(BillingCycle, { message: 'Invalid billing cycle' })
  billingCycle!: BillingCycle;

  @ApiPropertyOptional({ example: 'SUMMER2026' })
  @IsOptional()
  @IsString()
  promoCode?: string;
}
