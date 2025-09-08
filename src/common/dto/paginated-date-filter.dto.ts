import { IsOptional, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

export class PaginatedDateFilterDto extends PaginationDto {
  @ApiPropertyOptional({ 
    description: 'Fecha de inicio para filtrar por createdAt (YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss.sssZ)',
    example: '2025-09-01',
    format: 'date-time'
  })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de inicio debe tener un formato válido' })
  from?: string;

  @ApiPropertyOptional({ 
    description: 'Fecha de fin para filtrar por createdAt (YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss.sssZ)',
    example: '2025-09-30',
    format: 'date-time'
  })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de fin debe tener un formato válido' })
  to?: string;
}