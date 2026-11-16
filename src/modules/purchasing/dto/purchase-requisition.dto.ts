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
import { PurchaseRequisitionStatus } from '@prisma/client';

export class PurchaseRequisitionItemDto {
  @ApiProperty({ description: 'Product variant UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ example: 50, description: 'Requested quantity' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  requestedQuantity!: number;

  @ApiPropertyOptional({ example: 450.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedUnitCost?: number = 0;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreatePurchaseRequisitionDto {
  @ApiPropertyOptional({ description: 'Requesting branch UUID' })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiProperty({ description: 'Destination warehouse UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  warehouseId!: string;

  @ApiPropertyOptional({ description: 'Preferred supplier UUID' })
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @ApiPropertyOptional({ example: '2026-11-20T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  requiredDate?: string;

  @ApiPropertyOptional({ example: 'Replenishment for holiday seasonal peak' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({ type: [PurchaseRequisitionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequisitionItemDto)
  items!: PurchaseRequisitionItemDto[];
}

export class ApproveRequisitionItemDto {
  @ApiProperty({ description: 'Product variant UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ example: 40 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  approvedQuantity!: number;
}

export class ApproveRequisitionDto {
  @ApiPropertyOptional({ type: [ApproveRequisitionItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApproveRequisitionItemDto)
  approvedItems?: ApproveRequisitionItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class RejectRequisitionDto {
  @ApiProperty({ example: 'Stock level sufficient until next quarter' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ConvertRequisitionToPODto {
  @ApiProperty({ description: 'Supplier UUID to issue PO against' })
  @IsUUID('4')
  @IsNotEmpty()
  supplierId!: string;

  @ApiPropertyOptional({ example: '2026-12-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  expectedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListPurchaseRequisitionsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by warehouse UUID' })
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by branch UUID' })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({ enum: PurchaseRequisitionStatus })
  @IsOptional()
  @IsEnum(PurchaseRequisitionStatus)
  status?: PurchaseRequisitionStatus;

  @ApiPropertyOptional({ description: 'Search by requisition number or reason' })
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
