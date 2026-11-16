import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChequeStatus } from '@prisma/client';

export class ClearChequeDto {
  @ApiPropertyOptional({ example: '2026-11-12T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  clearedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BounceChequeDto {
  @ApiPropertyOptional({ example: '2026-11-12T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  bouncedAt?: string;

  @ApiProperty({ example: 'Insufficient funds / Account dormant' })
  @IsString()
  @IsNotEmpty()
  bounceReason!: string;

  @ApiPropertyOptional({ example: 1500.0, default: 0, description: 'Bank charges incurred' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  bounceCharges?: number = 0;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class DepositChequeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelChequeDto {
  @ApiPropertyOptional({ example: 'Payment stopped / cheque voided' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListSupplierChequesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by supplier UUID' })
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @ApiPropertyOptional({ enum: ChequeStatus })
  @IsOptional()
  @IsEnum(ChequeStatus)
  status?: ChequeStatus;

  @ApiPropertyOptional({ description: 'Filter maturing on or before date ISO' })
  @IsOptional()
  @IsString()
  maturityBefore?: string;

  @ApiPropertyOptional({ description: 'Search cheque number or bank' })
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
