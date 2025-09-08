import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PrepaidStatus } from '../enums';
import { PaginatedDateFilterDto } from './paginated-date-filter.dto';

export class PrepaidPaginationDto extends PaginatedDateFilterDto {
  @ApiPropertyOptional({ 
    description: 'Filtrar por status del prepaid',
    enum: PrepaidStatus,
    example: 'PENDING'
  })
  @IsOptional()
  @IsEnum(PrepaidStatus, { message: 'El status debe ser PENDING o CONSUMED' })
  status?: PrepaidStatus;
}
