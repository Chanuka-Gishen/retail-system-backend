import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { SupplierLedgerTransactionType } from '@prisma/client';

export class SupplierLedgerQueryDto {
  @ApiProperty({ description: 'Supplier UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  supplierId!: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ enum: SupplierLedgerTransactionType })
  @IsOptional()
  @IsEnum(SupplierLedgerTransactionType)
  transactionType?: SupplierLedgerTransactionType;
}
