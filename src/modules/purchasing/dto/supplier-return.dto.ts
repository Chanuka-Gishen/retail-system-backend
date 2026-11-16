import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SupplierReturnStatus, SupplierReturnSettlement } from '@prisma/client';

export class SupplierReturnItemDto {
  @ApiProperty({ description: 'Product variant UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ example: 5, description: 'Quantity returning to supplier' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @ApiProperty({ example: 450.0, description: 'Unit cost credited' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost!: number;

  @ApiProperty({ example: 'DAMAGED', description: 'DAMAGED, EXPIRED, DEFECTIVE, OVER_DELIVERED, WRONG_ITEM' })
  @IsString()
  @IsNotEmpty()
  returnReason!: string;

  @ApiPropertyOptional({ example: 'BATCH-2026-X1' })
  @IsOptional()
  @IsString()
  batchNumber?: string;
}

export class CreateSupplierReturnDto {
  @ApiProperty({ description: 'Supplier UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  supplierId!: string;

  @ApiPropertyOptional({ description: 'Original GRN UUID' })
  @IsOptional()
  @IsUUID('4')
  grnId?: string;

  @ApiProperty({ description: 'Warehouse UUID dispatching goods from' })
  @IsUUID('4')
  @IsNotEmpty()
  warehouseId!: string;

  @ApiPropertyOptional({ example: '2026-11-10T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  returnDate?: string;

  @ApiPropertyOptional({ enum: SupplierReturnSettlement, default: SupplierReturnSettlement.CREDIT_NOTE })
  @IsOptional()
  @IsEnum(SupplierReturnSettlement)
  settlementMethod?: SupplierReturnSettlement = SupplierReturnSettlement.CREDIT_NOTE;

  @ApiPropertyOptional({ example: 'Crushed packaging discovered upon receiving inspection' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [SupplierReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplierReturnItemDto)
  items!: SupplierReturnItemDto[];
}

export class ListSupplierReturnsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by supplier UUID' })
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse UUID' })
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @ApiPropertyOptional({ enum: SupplierReturnStatus })
  @IsOptional()
  @IsEnum(SupplierReturnStatus)
  status?: SupplierReturnStatus;

  @ApiPropertyOptional({ description: 'Search return number or reason' })
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
