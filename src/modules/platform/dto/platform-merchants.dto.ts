import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  IsDateString,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MerchantStatus, BillingCycle, SubscriptionStatus } from '@/common/types';

export class ListMerchantsQueryDto {
  @ApiPropertyOptional({ enum: MerchantStatus })
  @IsOptional()
  @IsEnum(MerchantStatus)
  status?: MerchantStatus;

  @ApiPropertyOptional({ example: 'Apex' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 20;
}

export class SuspendMerchantDto {
  @ApiProperty({ example: 'Payment overdue by 30 days.' })
  @IsString()
  reason!: string;
}

export class AdminCreateMerchantDto {
  @ApiProperty({ example: 'Metro Retail Mart Pvt Ltd' })
  @IsString()
  @MinLength(2, { message: 'Business name must be at least 2 characters long' })
  businessName!: string;

  @ApiPropertyOptional({ example: 'Metro Mart' })
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiPropertyOptional({ example: 'TAX-99887766' })
  @IsOptional()
  @IsString()
  taxNumber?: string;

  @ApiProperty({ example: 'contact@metromart.lk' })
  @IsEmail({}, { message: 'Valid contact email is required' })
  contactEmail!: string;

  @ApiProperty({ example: '+94771234567' })
  @IsString()
  @MinLength(8, { message: 'Valid contact phone number is required' })
  contactPhone!: string;

  @ApiPropertyOptional({ default: 'LKR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ default: 'Asia/Colombo' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ example: 'b0e51240-621f-4fcb-861c-8b89e3ec0199' })
  @IsUUID('4', { message: 'Valid subscription plan ID is required' })
  planId!: string;

  @ApiPropertyOptional({ enum: BillingCycle, default: BillingCycle.MONTHLY })
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @ApiPropertyOptional({ enum: MerchantStatus, default: MerchantStatus.ACTIVE })
  @IsOptional()
  @IsEnum(MerchantStatus)
  status?: MerchantStatus;

  // Owner user
  @ApiProperty({ example: 'Sunil' })
  @IsString()
  ownerFirstName!: string;

  @ApiProperty({ example: 'Perera' })
  @IsString()
  ownerLastName!: string;

  @ApiPropertyOptional({ example: 'sunil@metromart.lk' })
  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  ownerPassword!: string;

  // Initial shop / branch
  @ApiPropertyOptional({ example: 'Main Flagship Store' })
  @IsOptional()
  @IsString()
  branchName?: string;

  @ApiPropertyOptional({ example: 'BR-01' })
  @IsOptional()
  @IsString()
  branchCode?: string;

  @ApiPropertyOptional({ example: '123 Galle Road, Colombo' })
  @IsOptional()
  @IsString()
  branchAddress?: string;

  @ApiPropertyOptional({ example: '+94112345678' })
  @IsOptional()
  @IsString()
  branchPhone?: string;
}

export class AdminUpdateMerchantDto {
  @ApiPropertyOptional({ example: 'Metro Retail Mart Pvt Ltd' })
  @IsOptional()
  @IsString()
  businessName?: string;

  @ApiPropertyOptional({ example: 'Metro Mart' })
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiPropertyOptional({ example: 'TAX-99887766' })
  @IsOptional()
  @IsString()
  taxNumber?: string;

  @ApiPropertyOptional({ example: 'contact@metromart.lk' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+94771234567' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ default: 'LKR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ default: 'Asia/Colombo' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: MerchantStatus })
  @IsOptional()
  @IsEnum(MerchantStatus)
  status?: MerchantStatus;

  @ApiPropertyOptional({ example: 'b0e51240-621f-4fcb-861c-8b89e3ec0199' })
  @IsOptional()
  @IsUUID('4')
  planId?: string;

  @ApiPropertyOptional({ enum: BillingCycle })
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;
}

export class UpdateMerchantSubscriptionDto {
  @ApiPropertyOptional({ example: 'b0e51240-621f-4fcb-861c-8b89e3ec0199' })
  @IsOptional()
  @IsUUID('4', { message: 'Valid subscription plan ID is required' })
  planId?: string;

  @ApiPropertyOptional({ enum: BillingCycle, example: BillingCycle.MONTHLY })
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @ApiPropertyOptional({ enum: SubscriptionStatus, example: SubscriptionStatus.ACTIVE })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  generateInvoice?: boolean;
}

export class AdminCreateBranchDto {
  @ApiProperty({ example: 'BR-02' })
  @IsString()
  @MinLength(2, { message: 'Branch code must be at least 2 characters' })
  code!: string;

  @ApiProperty({ example: 'Kandy Mall Store' })
  @IsString()
  @MinLength(2, { message: 'Branch name must be at least 2 characters' })
  name!: string;

  @ApiPropertyOptional({ example: '45 Dalada Veediya, Kandy' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '+94812345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  defaultWarehouseId?: string;
}

export class AdminUpdateBranchDto {
  @ApiPropertyOptional({ example: 'BR-02' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'Kandy Mall Store' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '45 Dalada Veediya, Kandy' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '+94812345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  defaultWarehouseId?: string;
}

export class AdminRenewBankTransferDto {
  @ApiPropertyOptional({ example: '46b11b2d-4640-4bd3-bc17-059db0af8047' })
  @IsOptional()
  @IsUUID('4', { message: 'Valid subscription plan ID is required' })
  planId?: string;

  @ApiProperty({ enum: BillingCycle, example: BillingCycle.MONTHLY })
  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;

  @ApiProperty({ example: 8500 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountPaid!: number;

  @ApiProperty({ example: 'TXN-992812-BOC' })
  @IsString()
  @MinLength(2, { message: 'Transfer reference or slip number is required' })
  transferReference!: string;

  @ApiPropertyOptional({ example: 'Commercial Bank' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ example: '2026-11-13' })
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @ApiPropertyOptional({ example: 'Receipt received via WhatsApp from Sunil' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'https://...' })
  @IsOptional()
  @IsString()
  bankSlipUrl?: string;
}

export class GrantGracePeriodDto {
  @ApiPropertyOptional({ example: 7, default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  days?: number = 7;

  @ApiPropertyOptional({ example: 'Merchant requested 1 week extension via WhatsApp' })
  @IsOptional()
  @IsString()
  reason?: string;
}
