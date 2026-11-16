import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum BatchExpiryStatus {
  ALL = 'ALL',
  HEALTHY = 'HEALTHY',
  NEAR_EXPIRY = 'NEAR_EXPIRY',
  EXPIRED = 'EXPIRED',
}

export class ListBatchesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by warehouse UUID' })
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by product variant UUID' })
  @IsOptional()
  @IsUUID('4')
  variantId?: string;

  @ApiPropertyOptional({
    enum: BatchExpiryStatus,
    description: 'Filter by expiry status: ALL, HEALTHY (>30d), NEAR_EXPIRY (<=30d), or EXPIRED',
    default: BatchExpiryStatus.ALL,
  })
  @IsOptional()
  @IsEnum(BatchExpiryStatus)
  status?: BatchExpiryStatus = BatchExpiryStatus.ALL;

  @ApiPropertyOptional({ description: 'Search by batch number or SKU' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}

export class CreateBatchDto {
  @ApiProperty({ description: 'Warehouse UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  warehouseId!: string;

  @ApiProperty({ description: 'Product Variant UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ example: 'BAT-2026-001', description: 'Unique batch number' })
  @IsString()
  @IsNotEmpty()
  batchNumber!: string;

  @ApiProperty({ example: 450.0, description: 'Batch unit cost price' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice!: number;

  @ApiProperty({ example: 850.0, description: 'Batch unit selling price' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice!: number;

  @ApiProperty({ example: 100, description: 'Received batch quantity' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantityReceived!: number;

  @ApiProperty({ example: 100, description: 'Initial on-hand batch quantity' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantityOnHand!: number;

  @ApiPropertyOptional({ example: '2026-01-15T00:00:00Z', description: 'Manufacturing Date' })
  @IsOptional()
  @IsString()
  manufacturingDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00Z', description: 'Expiry Date' })
  @IsOptional()
  @IsString()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Supplier UUID' })
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;
}

export class UpdateBatchDto {
  @ApiPropertyOptional({ example: 500.0, description: 'Batch unit cost price' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ example: 900.0, description: 'Batch unit selling price' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional({ example: '2026-01-15T00:00:00Z', description: 'Manufacturing Date' })
  @IsOptional()
  @IsString()
  manufacturingDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00Z', description: 'Expiry Date' })
  @IsOptional()
  @IsString()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Active status' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
