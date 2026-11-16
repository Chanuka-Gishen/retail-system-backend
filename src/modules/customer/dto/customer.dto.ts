import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TenderType } from '@prisma/client';

export class CreateCustomerDto {
  @ApiPropertyOptional({ example: 'CUST-00101', description: 'Customer unique code (auto-generated if omitted)' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ example: 'Anura Kumara', description: 'Customer full or business name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'anura@example.com', description: 'Contact email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+94771234567', description: 'Contact mobile phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'VAT-888999000', description: 'Customer Tax / VAT identification number' })
  @IsOptional()
  @IsString()
  taxNumber?: string;

  @ApiPropertyOptional({ example: 50000.0, description: 'Maximum approved credit limit (LKR)', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditLimit?: number = 0;
}

export class UpdateCustomerDto {
  @ApiPropertyOptional({ example: 'Anura Kumara Dissanayake' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'anura.k@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+94779876543' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'VAT-888999001' })
  @IsOptional()
  @IsString()
  taxNumber?: string;

  @ApiPropertyOptional({ example: 75000.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditLimit?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListCustomersQueryDto {
  @ApiPropertyOptional({ description: 'Search query across name, phone, or customer code' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by exact phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Filter active status' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

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

export class AdjustLoyaltyPointsDto {
  @ApiProperty({
    example: 50,
    description: 'Points delta (positive to grant promotional/bonus points, negative to manually redeem)',
  })
  @IsInt()
  points!: number;

  @ApiProperty({ example: 'Promotional loyalty bonus for anniversary month' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class SettleBalanceDto {
  @ApiProperty({ example: 15000.0, description: 'Amount settled towards outstanding balance' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty({ enum: TenderType, example: TenderType.CASH, description: 'Payment tender used' })
  @IsEnum(TenderType)
  tenderType!: TenderType;

  @ApiPropertyOptional({ example: 'CHQ-882291', description: 'Bank cheque number, slip number or ref' })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional({ example: 'Monthly balance settlement' })
  @IsOptional()
  @IsString()
  notes?: string;
}
