import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginatedDateFilterDto } from './paginated-date-filter.dto';
import { SaleStatus, PaymentMethodFilter } from '../enums';

export class SalesPaginatedFilterDto extends PaginatedDateFilterDto {
  @ApiPropertyOptional({ 
    description: 'Filtrar por status de la venta',
    enum: SaleStatus,
    example: 'PENDING'
  })
  @IsOptional()
  @IsEnum(SaleStatus, { message: 'El status debe ser PENDING, COMPLETED o CANCELLED' })
  @Transform(({ value }) => value === '' ? undefined : value)
  status?: SaleStatus;

  @ApiPropertyOptional({
    description: 'Filtrar por ID del cliente',
  })
  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  clientId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por método de pago. MIXED = ventas con más de un método.',
    enum: PaymentMethodFilter,
  })
  @IsOptional()
  @IsEnum(PaymentMethodFilter, { message: 'El método debe ser CASH, CARD, TRANSFER o MIXED' })
  @Transform(({ value }) => value === '' ? undefined : value)
  paymentMethod?: PaymentMethodFilter;
}