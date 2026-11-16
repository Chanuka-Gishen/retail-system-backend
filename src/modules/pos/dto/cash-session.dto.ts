import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CashSessionStatus } from '@prisma/client';

export class OpenCashSessionDto {
  @ApiProperty({ description: 'POS Terminal UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  posTerminalId!: string;

  @ApiProperty({ example: 10000.0, description: 'Initial cash float placed in the register at shift opening' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingFloat!: number;

  @ApiPropertyOptional({ description: 'Shift start notes or shift identifier', example: 'Morning Shift 08:00 - 16:00' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CloseCashSessionDto {
  @ApiProperty({
    example: 45750.0,
    description: 'Physical counted cash in the register at shift close (excluding card or digital slips)',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  closingCashActual!: number;

  @ApiPropertyOptional({ description: 'Closing notes or explanations for discrepancies' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateCashTransactionDto {
  @ApiProperty({ enum: ['CASH_IN', 'CASH_OUT'], description: 'Cash drawer operation direction' })
  @IsIn(['CASH_IN', 'CASH_OUT'])
  @IsNotEmpty()
  type!: 'CASH_IN' | 'CASH_OUT';

  @ApiProperty({ example: 5000.0, description: 'Cash amount deposited into or removed from the drawer' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty({ example: 'Mid-shift safe drop to main office', description: 'Reason or purpose of the cash operation' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ReconcileCashSessionDto {
  @ApiPropertyOptional({ description: 'Manager review comments and reconciliation notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListCashSessionsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by branch UUID' })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by POS terminal UUID' })
  @IsOptional()
  @IsUUID('4')
  posTerminalId?: string;

  @ApiPropertyOptional({ description: 'Filter by cashier UUID who opened the session' })
  @IsOptional()
  @IsUUID('4')
  openedById?: string;

  @ApiPropertyOptional({ enum: CashSessionStatus, description: 'Filter by session status' })
  @IsOptional()
  @IsEnum(CashSessionStatus)
  status?: CashSessionStatus;

  @ApiPropertyOptional({ description: 'Start date ISO string' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date ISO string' })
  @IsOptional()
  @IsString()
  endDate?: string;

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
