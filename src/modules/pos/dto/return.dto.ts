import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
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
import { TenderType } from '@prisma/client';

export class ReturnItemDto {
  @ApiProperty({ description: 'Original sale item UUID being returned' })
  @IsUUID('4')
  @IsNotEmpty()
  saleItemId!: string;

  @ApiProperty({ example: 1.0, description: 'Quantity being returned' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @ApiProperty({
    example: 'RETURN_TO_STOCK',
    description: 'Inventory action: RETURN_TO_STOCK restores inventory, DAMAGE_DISPOSAL writes off damaged goods',
  })
  @IsIn(['RETURN_TO_STOCK', 'DAMAGE_DISPOSAL'])
  returnAction!: 'RETURN_TO_STOCK' | 'DAMAGE_DISPOSAL';

  @ApiPropertyOptional({ example: 'Customer purchased wrong size' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateCustomerReturnDto {
  @ApiProperty({ description: 'Original completed sale UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  saleId!: string;

  @ApiPropertyOptional({ description: 'Branch UUID where return is processed (defaults to sale branch)' })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Warehouse UUID where restocked items are returned (defaults to sale warehouse)',
  })
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @ApiPropertyOptional({
    enum: TenderType,
    example: TenderType.CASH,
    description: 'Refund payout tender (CASH, CARD, or STORE_CREDIT)',
  })
  @IsOptional()
  @IsEnum(TenderType)
  refundTender?: TenderType;

  @ApiPropertyOptional({
    example: 'ITEM_TO_ITEM',
    description: 'Refund method: CASH, ONLINE_TRANSFER, or ITEM_TO_ITEM (24-hour exchange voucher)',
  })
  @IsOptional()
  @IsIn(['CASH', 'ONLINE_TRANSFER', 'ITEM_TO_ITEM'])
  refundMethod?: 'CASH' | 'ONLINE_TRANSFER' | 'ITEM_TO_ITEM';

  @ApiPropertyOptional({ example: 'TXN-98472948', description: 'Bank / online transfer reference number or slip note' })
  @IsOptional()
  @IsString()
  transferReference?: string;

  @ApiPropertyOptional({ example: 24, description: 'Voucher validity duration in hours for ITEM_TO_ITEM (defaults to 24 hours)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  voucherExpiresInHours?: number;

  @ApiPropertyOptional({ example: 'Defective packaging discovered after unboxing' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ type: [ReturnItemDto], description: 'Items and quantities being returned' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];
}

export class ListCustomerReturnsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by original sale UUID' })
  @IsOptional()
  @IsUUID('4')
  saleId?: string;

  @ApiPropertyOptional({ description: 'Filter by branch UUID' })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse UUID' })
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by customer UUID' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ description: 'Search by return number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter start date ISO string' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter end date ISO string' })
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
