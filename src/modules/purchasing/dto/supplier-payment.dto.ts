import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
import { SupplierPaymentMethod } from '@prisma/client';

export class InvoicePaymentAllocationDto {
  @ApiProperty({ description: 'Supplier Invoice UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  invoiceId!: string;

  @ApiProperty({ example: 45000.0, description: 'Amount allocated to this invoice' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  allocatedAmount!: number;
}

export class ChequeDetailsDto {
  @ApiProperty({ example: 'CHQ-009182' })
  @IsString()
  @IsNotEmpty()
  chequeNumber!: string;

  @ApiProperty({ example: 'Commercial Bank of Ceylon' })
  @IsString()
  @IsNotEmpty()
  bankName!: string;

  @ApiPropertyOptional({ example: 'Peliyagoda' })
  @IsOptional()
  @IsString()
  branchName?: string;

  @ApiProperty({ example: '2026-11-10T00:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  chequeDate!: string;

  @ApiProperty({ example: '2026-11-30T00:00:00.000Z', description: 'Maturity / Post-dated date' })
  @IsString()
  @IsNotEmpty()
  maturityDate!: string;

  @ApiProperty({ example: 'Dilmah Ceylon Tea Company PLC' })
  @IsString()
  @IsNotEmpty()
  payeeName!: string;
}

export class CreateSupplierPaymentDto {
  @ApiProperty({ description: 'Supplier UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  supplierId!: string;

  @ApiPropertyOptional({ example: '2026-11-10T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  paymentDate?: string;

  @ApiProperty({ enum: SupplierPaymentMethod })
  @IsEnum(SupplierPaymentMethod)
  paymentMethod!: SupplierPaymentMethod;

  @ApiProperty({ example: 50000.0, description: 'Total payment amount' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ example: 'TXN-998811' })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional({ example: 'Sampath Bank' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ example: '00192837465' })
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [InvoicePaymentAllocationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoicePaymentAllocationDto)
  allocations?: InvoicePaymentAllocationDto[];

  @ApiPropertyOptional({ type: ChequeDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChequeDetailsDto)
  chequeDetails?: ChequeDetailsDto;
}

export class ListSupplierPaymentsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by supplier UUID' })
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @ApiPropertyOptional({ enum: SupplierPaymentMethod })
  @IsOptional()
  @IsEnum(SupplierPaymentMethod)
  paymentMethod?: SupplierPaymentMethod;

  @ApiPropertyOptional({ description: 'Search payment number or reference' })
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
