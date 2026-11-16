import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePosTerminalDto {
  @ApiProperty({ description: 'Branch UUID where terminal is located' })
  @IsUUID('4')
  @IsNotEmpty()
  branchId!: string;

  @ApiProperty({ example: 'POS-01', description: 'Unique terminal code within the branch' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  code!: string;

  @ApiProperty({ example: 'Express Checkout Counter 1', description: 'Terminal display name' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({
    example: 'HW-DELL-OPTIPLEX-7090-XYZ',
    description: 'Hardware MAC address, device fingerprint, or client machine identifier for terminal binding',
  })
  @IsOptional()
  @IsString()
  hardwareIdentifier?: string;
}

export class UpdatePosTerminalDto {
  @ApiPropertyOptional({ example: 'Main Checkout Counter 1' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'HW-FINGERPRINT-NEW-DEVICE' })
  @IsOptional()
  @IsString()
  hardwareIdentifier?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListPosTerminalsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by branch UUID' })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Search by terminal code, name, or hardware identifier' })
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
