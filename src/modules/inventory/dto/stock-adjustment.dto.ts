import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StockAdjustmentItemDto {
  @ApiProperty({ description: 'Product variant UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ enum: ['POSITIVE', 'NEGATIVE'], description: 'Adjustment direction' })
  @IsIn(['POSITIVE', 'NEGATIVE'])
  @IsNotEmpty()
  type!: 'POSITIVE' | 'NEGATIVE';

  @ApiProperty({ description: 'Adjustment quantity (must be positive value)', example: 10 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Unit cost override (defaults to variant costPrice if omitted)', example: 150.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;
}

export class CreateStockAdjustmentDto {
  @ApiProperty({ description: 'Warehouse UUID where stock is adjusted' })
  @IsUUID('4')
  @IsNotEmpty()
  warehouseId!: string;

  @ApiProperty({ description: 'Reason for adjustment', example: 'Cycle count physical inventory discrepancy' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty({ type: [StockAdjustmentItemDto], description: 'List of adjusted items' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockAdjustmentItemDto)
  items!: StockAdjustmentItemDto[];
}
