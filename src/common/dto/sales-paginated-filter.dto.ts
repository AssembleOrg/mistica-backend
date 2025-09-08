import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginatedDateFilterDto } from './paginated-date-filter.dto';
import { SaleStatus } from '../enums';

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
}