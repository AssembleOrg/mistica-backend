import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { KILNS, KILN_ACTIONS } from './kiln-log.schema';

export class CreateKilnLogDto {
  @ApiProperty({ enum: Object.keys(KILNS) })
  @IsIn(Object.keys(KILNS))
  kiln: string;

  @ApiProperty({ enum: Object.keys(KILN_ACTIONS) })
  @IsIn(Object.keys(KILN_ACTIONS))
  action: string;

  @ApiPropertyOptional({ description: 'Quién lo hizo (cuentas compartidas)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  registeredBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class ListKilnLogsDto {
  @ApiProperty({ description: 'Desde (YYYY-MM-DD, hora de Argentina)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from: string;

  @ApiProperty({ description: 'Hasta inclusive (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to: string;
}
