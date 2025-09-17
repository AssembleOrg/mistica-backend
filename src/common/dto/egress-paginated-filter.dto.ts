import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginatedDateFilterDto } from './paginated-date-filter.dto';
import { EgressStatus, EgressType, Currency } from '../enums';

export class EgressPaginatedFilterDto extends PaginatedDateFilterDto {
  @ApiPropertyOptional({
    description: 'Filtrar por estado del egreso',
    enum: EgressStatus,
    example: EgressStatus.COMPLETED
  })
  @IsOptional()
  @IsEnum(EgressStatus)
  @Transform(({ value }) => value)
  status?: EgressStatus;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de egreso',
    enum: EgressType,
    example: EgressType.WITHDRAWAL
  })
  @IsOptional()
  @IsEnum(EgressType)
  @Transform(({ value }) => value)
  type?: EgressType;

  @ApiPropertyOptional({
    description: 'Filtrar por moneda',
    enum: Currency,
    example: Currency.USD
  })
  @IsOptional()
  @IsEnum(Currency)
  @Transform(({ value }) => value)
  currency?: Currency;
}