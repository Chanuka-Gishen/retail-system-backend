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
import { GRNStatus } from '@prisma/client';

export class GRNItemDto {
  @ApiProperty({ description: 'Product variant UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  variantId!: string;

  @ApiPropertyOptional({ description: 'Quantity ordered on PO', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  orderedQuantity?: number = 0;

  @ApiProperty({ description: 'Total physical quantity delivered by supplier', example: 100 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantityReceived!: number;

  @ApiProperty({ description: 'Good condition quantity accepted into warehouse stock', example: 98 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  acceptedQuantity!: number;

  @ApiPropertyOptional({ description: 'Damaged quantity quarantined/rejected', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  damagedQuantity?: number = 0;

  @ApiPropertyOptional({ description: 'Rejected quantity sent back or discarded', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  rejectedQuantity?: number = 0;

  @ApiPropertyOptional({ description: 'Free bonus units provided', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  freeQuantity?: number = 0;

  @ApiProperty({ description: 'Unit cost', example: 450.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost!: number;

  @ApiPropertyOptional({ description: 'Discount amount', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number = 0;

  @ApiPropertyOptional({ description: 'Tax amount', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number = 0;

  @ApiPropertyOptional({ description: 'Lot / Batch number', example: 'BATCH-2026-X1' })
  @IsOptional()
  @IsString()
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Serial number', example: 'SN-998811' })
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiPropertyOptional({ description: 'Manufacturing date ISO' })
  @IsOptional()
  @IsString()
  manufacturingDate?: string;

  @ApiPropertyOptional({ description: 'Expiry date ISO' })
  @IsOptional()
  @IsString()
  expiryDate?: string;
}

export class CreateGoodsReceivedNoteDto {
  @ApiProperty({ description: 'Supplier UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  supplierId!: string;

  @ApiPropertyOptional({ description: 'Receiving branch UUID' })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiProperty({ description: 'Destination warehouse UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  warehouseId!: string;

  @ApiPropertyOptional({ description: 'Linked PO UUID if receiving against purchase order' })
  @IsOptional()
  @IsUUID('4')
  purchaseOrderId?: string;

  @ApiPropertyOptional({ description: 'Supplier Delivery Note / Dispatch Advice reference', example: 'DN-88192' })
  @IsOptional()
  @IsString()
  deliveryNoteNumber?: string;

  @ApiPropertyOptional({ description: 'Supplier Invoice reference', example: 'INV-44012' })
  @IsOptional()
  @IsString()
  supplierInvoiceRef?: string;

  @ApiPropertyOptional({ description: 'Vehicle or driver reference', example: 'WP-CAB-1234' })
  @IsOptional()
  @IsString()
  vehicleReference?: string;

  @ApiPropertyOptional({ description: 'Freight, duty, and landed costs allocated', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  landedCosts?: number = 0;

  @ApiPropertyOptional({ description: 'Receiving inspection remarks' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({ type: [GRNItemDto], description: 'Received line items' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GRNItemDto)
  items!: GRNItemDto[];
}

export class ListGRNQueryDto {
  @ApiPropertyOptional({ description: 'Filter by supplier UUID' })
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse UUID' })
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by branch UUID' })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by Purchase Order UUID' })
  @IsOptional()
  @IsUUID('4')
  purchaseOrderId?: string;

  @ApiPropertyOptional({ enum: GRNStatus, description: 'Filter by GRN status' })
  @IsOptional()
  @IsEnum(GRNStatus)
  status?: GRNStatus;

  @ApiPropertyOptional({ description: 'Search by GRN number, delivery note, or supplier invoice' })
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
