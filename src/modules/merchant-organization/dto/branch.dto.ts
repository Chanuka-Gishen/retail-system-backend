import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({ example: 'BR-KANDY-01' })
  @IsString()
  @MinLength(2)
  code!: string;

  @ApiProperty({ example: 'Kandy City Center Store' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: '5 Dalada Veediya, Kandy' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '+94812233445' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  defaultWarehouseId?: string;
}

export class UpdateBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  defaultWarehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
