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
import { SupplierInvoiceStatus } from '@prisma/client';

export class SupplierInvoiceItemDto {
  @ApiProperty({ description: 'Product variant UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ description: 'Quantity billed by supplier', example: 100 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  billedQuantity!: number;

  @ApiProperty({ description: 'Unit cost billed', example: 450.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number = 0;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number = 0;
}

export class CreateSupplierInvoiceDto {
  @ApiProperty({ description: 'Supplier UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  supplierId!: string;

  @ApiPropertyOptional({ description: 'Purchase Order UUID' })
  @IsOptional()
  @IsUUID('4')
  purchaseOrderId?: string;

  @ApiPropertyOptional({ description: 'GRN UUID' })
  @IsOptional()
  @IsUUID('4')
  grnId?: string;

  @ApiProperty({ example: 'INV-2026-9001', description: 'Supplier Invoice Number' })
  @IsString()
  @IsNotEmpty()
  invoiceNumber!: string;

  @ApiProperty({ example: '2026-11-10T00:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  invoiceDate!: string;

  @ApiProperty({ example: '2026-12-10T00:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  dueDate!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number = 0;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number = 0;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  shippingCharges?: number = 0;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [SupplierInvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplierInvoiceItemDto)
  items!: SupplierInvoiceItemDto[];
}

export class VerifySupplierInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListSupplierInvoicesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by supplier UUID' })
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @ApiPropertyOptional({ enum: SupplierInvoiceStatus })
  @IsOptional()
  @IsEnum(SupplierInvoiceStatus)
  status?: SupplierInvoiceStatus;

  @ApiPropertyOptional({ description: 'Filter only overdue invoices' })
  @IsOptional()
  @Type(() => Boolean)
  isOverdue?: boolean;

  @ApiPropertyOptional({ description: 'Search invoice number' })
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
