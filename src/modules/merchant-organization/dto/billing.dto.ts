import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class SubmitMerchantSlipDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID('4', { message: 'Valid subscription invoice ID is required' })
  invoiceId!: string;

  @ApiProperty({ example: 8500 })
  @IsNumber()
  @Min(1, { message: 'Submitted amount must be at least 1' })
  amountSubmitted!: number;

  @ApiPropertyOptional({ example: 'TXN-COMM-20261115-001' })
  @IsOptional()
  @IsString()
  transactionReference?: string;

  @ApiProperty({ example: 'https://storage.retailpos.com/slips/slip-abc.jpg' })
  @IsString()
  bankSlipUrl!: string;

  @ApiPropertyOptional({ example: 'Deposited at Colombo Branch, ref WhatsApp message' })
  @IsOptional()
  @IsString()
  notes?: string;
}
