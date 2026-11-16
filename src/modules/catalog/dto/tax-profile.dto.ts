import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateTaxProfileDto {
  @ApiProperty({ example: 'TAX-VAT18' })
  @IsString()
  @MinLength(2)
  code!: string;

  @ApiProperty({ example: 'Standard VAT 18%' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 18.0, description: 'Tax rate percentage (0 - 100)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  ratePercentage!: number;

  @ApiPropertyOptional({ example: false, description: 'True if selling price already includes tax' })
  @IsOptional()
  @IsBoolean()
  isInclusive?: boolean;
}

export class UpdateTaxProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  ratePercentage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isInclusive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
