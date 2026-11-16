import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
import { Type, Transform } from 'class-transformer';
import { SaleStatus, TenderType } from '@prisma/client';

export class CartItemDto {
  @ApiProperty({ description: 'Product variant UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ example: 2.0, description: 'Sold quantity' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @ApiPropertyOptional({
    example: 750.0,
    description: 'Unit selling price (defaults to catalog variant sellingPrice if omitted)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({ example: 50.0, description: 'Item line discount amount', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number = 0;

  @ApiPropertyOptional({ description: 'Optional specific ProductBatch UUID chosen by cashier (if omitted, FEFO/FIFO applies)' })
  @IsOptional()
  @IsUUID('4')
  batchId?: string;
}

export class TenderPaymentDto {
  @ApiProperty({ enum: TenderType, example: TenderType.CASH, description: 'Payment tender type' })
  @IsEnum(TenderType)
  @IsNotEmpty()
  tenderType!: TenderType;

  @ApiProperty({ example: 1500.0, description: 'Amount tendered with this payment method' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({
    example: 'AUTH-VISA-998822',
    description: 'Card authorization code, slip reference, or transaction id',
  })
  @IsOptional()
  @IsString()
  referenceNumber?: string;
}

export class CreateCheckoutDto {
  @ApiProperty({ description: 'Branch UUID where sale occurred' })
  @IsUUID('4')
  @IsNotEmpty()
  branchId!: string;

  @ApiPropertyOptional({
    description: 'Warehouse UUID from which stock is deducted (defaults to branch defaultWarehouseId if omitted)',
  })
  @IsOptional()
  @Transform(({ value }) => (!value || value === '' ? undefined : value))
  @IsUUID('4')
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'POS Terminal UUID' })
  @IsOptional()
  @Transform(({ value }) => (!value || value === '' ? undefined : value))
  @IsUUID('4')
  posTerminalId?: string;

  @ApiPropertyOptional({ description: 'Cash Drawer Session UUID (auto-detected from active terminal if omitted)' })
  @IsOptional()
  @Transform(({ value }) => (!value || value === '' ? undefined : value))
  @IsUUID('4')
  cashSessionId?: string;

  @ApiPropertyOptional({ description: 'Customer UUID for member loyalty and credit sales' })
  @IsOptional()
  @Transform(({ value }) => (!value || value === '' ? undefined : value))
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({
    example: 'op-pos01-uuid-12345',
    description: 'Client-generated idempotency operation ID (prevents double charging / duplicate checkout)',
  })
  @IsOptional()
  @IsString()
  clientOperationId?: string;

  @ApiPropertyOptional({ example: 0, description: 'Additional cart-level discount amount', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cartDiscountAmount?: number = 0;

  @ApiProperty({ type: [CartItemDto], description: 'Items in the checkout basket' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];

  @ApiProperty({ type: [TenderPaymentDto], description: 'Payment tender allocations (supports split payment)' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TenderPaymentDto)
  payments!: TenderPaymentDto[];

  @ApiPropertyOptional({ description: 'Whether this checkout was recorded offline and synced', default: false })
  @IsOptional()
  @IsBoolean()
  isOfflineSync?: boolean = false;

  @ApiPropertyOptional({ description: 'Original timestamp when offline checkout occurred' })
  @IsOptional()
  @IsString()
  completedAt?: string;
}

export class ListSalesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by branch UUID' })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse UUID' })
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by POS terminal UUID' })
  @IsOptional()
  @IsUUID('4')
  posTerminalId?: string;

  @ApiPropertyOptional({ description: 'Filter by cash session UUID' })
  @IsOptional()
  @IsUUID('4')
  cashSessionId?: string;

  @ApiPropertyOptional({ description: 'Filter by cashier UUID' })
  @IsOptional()
  @IsUUID('4')
  cashierId?: string;

  @ApiPropertyOptional({ description: 'Filter by customer UUID' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ enum: SaleStatus, description: 'Filter by sale status' })
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @ApiPropertyOptional({ description: 'Search by invoice number or client operation ID' })
  @IsOptional()
  @IsString()
  search?: string;

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
