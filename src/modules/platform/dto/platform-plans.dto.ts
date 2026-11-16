import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SubscriptionTier } from '@/common/types';

export class CreatePlanDto {
  @ApiProperty({ example: 'Enterprise Plus' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'PLAN_ENT_PLUS' })
  @IsString()
  code!: string;

  @ApiProperty({ enum: SubscriptionTier })
  @IsEnum(SubscriptionTier)
  tier!: SubscriptionTier;

  @ApiPropertyOptional({ example: 'Tailored for nationwide supermarket chains.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 25000.0 })
  @IsNumber()
  @Min(0)
  priceMonthly!: number;

  @ApiProperty({ example: 70000.0 })
  @IsNumber()
  @Min(0)
  priceQuarterly!: number;

  @ApiProperty({ example: 250000.0 })
  @IsNumber()
  @Min(0)
  priceAnnually!: number;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @Min(1)
  maxBranches!: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(1)
  maxWarehouses!: number;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(1)
  maxUsers!: number;

  @ApiProperty({ example: 100000 })
  @IsNumber()
  @Min(1)
  maxProducts!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  hasOfflinePos?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  hasAdvancedAccounting?: boolean;
}

export class UpdatePlanDto {
  @ApiPropertyOptional({ example: 'Enterprise Plus v2' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Tailored for nationwide supermarket chains.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: SubscriptionTier })
  @IsOptional()
  @IsEnum(SubscriptionTier)
  tier?: SubscriptionTier;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMonthly?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceQuarterly?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceAnnually?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxBranches?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxWarehouses?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUsers?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxProducts?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasOfflinePos?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasAdvancedAccounting?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
