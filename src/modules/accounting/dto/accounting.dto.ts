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
import { Type } from 'class-transformer';
import { AccountCategory, EntryType } from '@prisma/client';

export class CreateAccountDto {
  @ApiProperty({ example: '1050', description: 'Unique chart of account numeric code' })
  @IsString()
  @IsNotEmpty()
  accountCode!: string;

  @ApiProperty({ example: 'Petty Cash Float', description: 'Account name' })
  @IsString()
  @IsNotEmpty()
  accountName!: string;

  @ApiProperty({ enum: AccountCategory, example: AccountCategory.ASSET })
  @IsEnum(AccountCategory)
  category!: AccountCategory;

  @ApiPropertyOptional({ description: 'Parent account UUID for hierarchy' })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;
}

export class UpdateAccountDto {
  @ApiPropertyOptional({ example: 'Updated Account Title' })
  @IsOptional()
  @IsString()
  accountName?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class JournalLineInputDto {
  @ApiProperty({ example: '1010', description: 'Account code or UUID to debit/credit' })
  @IsString()
  @IsNotEmpty()
  accountCode!: string;

  @ApiProperty({ enum: EntryType, example: EntryType.DEBIT })
  @IsEnum(EntryType)
  entryType!: EntryType;

  @ApiProperty({ example: 15000.0, description: 'Debit or Credit amount' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ example: 'Cash sales receipt line' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateJournalEntryDto {
  @ApiProperty({ example: '2026-11-09T00:00:00.000Z', description: 'Entry posting date' })
  @IsString()
  @IsNotEmpty()
  entryDate!: string;

  @ApiProperty({
    example: 'MANUAL',
    description: 'Reference source type (MANUAL, SALE, GRN, RETURN, CASH_DRAWER, ADJUSTMENT)',
  })
  @IsString()
  @IsNotEmpty()
  referenceType!: string;

  @ApiPropertyOptional({ description: 'Source transaction UUID' })
  @IsOptional()
  @IsUUID('4')
  referenceId?: string;

  @ApiProperty({ example: 'Monthly owner capital contribution' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ type: [JournalLineInputDto], description: 'Debit and credit lines (must sum to zero difference)' })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineInputDto)
  lines!: JournalLineInputDto[];
}

export class ListJournalEntriesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by reference type' })
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Filter by start date' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter by end date' })
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

export class FinancialReportQueryDto {
  @ApiPropertyOptional({ example: '2026-11-09', description: 'As-of date for Balance Sheet & Trial Balance' })
  @IsOptional()
  @IsString()
  asOfDate?: string;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Start date for P&L income statement' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'End date for P&L income statement' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
