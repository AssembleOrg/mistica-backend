import { IsOptional, IsNumber, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PrepaidStatus } from '../enums';

export class PrepaidPaginationDto {
  @ApiPropertyOptional({ description: 'Número de página', default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Límite de elementos por página', default: 10 })
  @IsOptional()
  @IsNumber()
  limit?: number = 10;

  @ApiPropertyOptional({ 
    description: 'Filtrar por status del prepaid',
    enum: PrepaidStatus,
    example: 'PENDING'
  })
  @IsOptional()
  @IsEnum(PrepaidStatus, { message: 'El status debe ser PENDING o CONSUMED' })
  status?: PrepaidStatus;
}
