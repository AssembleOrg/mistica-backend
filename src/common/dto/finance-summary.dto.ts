import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaymentMethod } from '../enums';

export class FinanceSummaryQueryDto {
  @ApiPropertyOptional({ description: 'Desde (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Hasta (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Filtrar por método de pago', enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Filtrar por clientId (o `anonymous` para sin cliente)' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por productId' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({
    description: 'Estado de venta (PENDING/COMPLETED/CANCELLED)',
  })
  @IsOptional()
  @IsString()
  saleStatus?: string;
}
