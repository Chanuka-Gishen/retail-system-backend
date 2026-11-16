import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StockTransferItemDto {
  @ApiProperty({ description: 'Product variant UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ description: 'Quantity to transfer', example: 25 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantitySent!: number;
}

export class CreateStockTransferDto {
  @ApiProperty({ description: 'Source warehouse UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  sourceWarehouseId!: string;

  @ApiProperty({ description: 'Destination warehouse UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  destinationWarehouseId!: string;

  @ApiPropertyOptional({ description: 'Notes or internal remarks for this transfer' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [StockTransferItemDto], description: 'Items to transfer' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockTransferItemDto)
  items!: StockTransferItemDto[];
}

export class ReceiveTransferItemDto {
  @ApiProperty({ description: 'Product variant UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ description: 'Actual quantity received at destination warehouse', example: 25 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantityReceived!: number;
}

export class ReceiveStockTransferDto {
  @ApiPropertyOptional({ description: 'Receiving inspection notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    type: [ReceiveTransferItemDto],
    description: 'Specific received quantities. If omitted, full dispatched quantity is received.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveTransferItemDto)
  items?: ReceiveTransferItemDto[];
}
