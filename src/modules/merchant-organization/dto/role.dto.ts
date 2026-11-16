import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCustomRoleDto {
  @ApiProperty({ example: 'Senior Supervisor' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: 'Can open/close sessions and void sales' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    type: [String],
    example: ['pos.sale.create', 'pos.sale.void', 'pos.session.open', 'pos.session.close'],
  })
  @IsArray()
  permissions!: string[];
}

export class UpdateCustomRoleDto {
  @ApiPropertyOptional({ example: 'Senior Supervisor' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'Can open/close sessions and void sales' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['pos.sale.create', 'pos.sale.void', 'pos.session.open', 'pos.session.close'],
  })
  @IsOptional()
  @IsArray()
  permissions?: string[];
}
