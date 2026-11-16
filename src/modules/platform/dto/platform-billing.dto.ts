import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class SubmitBankSlipDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID('4')
  invoiceId!: string;

  @ApiProperty({ example: 7500.0 })
  @IsNumber()
  @Min(1)
  amountSubmitted!: number;

  @ApiPropertyOptional({ example: 'TXN-BOC-99887766' })
  @IsOptional()
  @IsString()
  transactionReference?: string;

  @ApiProperty({ example: 'https://storage.retailpos.com/slips/slip-123.jpg' })
  @IsString()
  bankSlipUrl!: string;

  @ApiPropertyOptional({ example: 'Deposited at Colombo Kollupitiya branch' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReviewPaymentVerificationDto {
  @ApiPropertyOptional({ example: 'Bank deposit verified against statement' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectPaymentVerificationDto {
  @ApiProperty({ example: 'Slip amount does not match invoice total' })
  @IsString()
  reason!: string;
}

export class PayHereIpnDto {
  merchant_id!: string;
  order_id!: string;
  payment_id!: string;
  payhere_amount!: string;
  payhere_currency!: string;
  status_code!: string;
  md5sig!: string;
  custom_1?: string;
  custom_2?: string;
}
