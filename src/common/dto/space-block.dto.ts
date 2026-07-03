import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class CreateSpaceBlockDto {
  @ApiProperty({ enum: ['WEEKLY', 'ONE_OFF'] })
  @IsEnum(['WEEKLY', 'ONE_OFF'])
  kind: 'WEEKLY' | 'ONE_OFF';

  @ApiPropertyOptional({ description: 'ISO 1=lunes..7=domingo (para WEEKLY)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD (para ONE_OFF)' })
  @IsOptional()
  @Matches(YMD, { message: 'date debe ser YYYY-MM-DD' })
  date?: string;

  @ApiProperty({ description: 'HH:mm' })
  @Matches(HHMM, { message: 'start debe ser HH:mm' })
  start: string;

  @ApiProperty({ description: 'HH:mm' })
  @Matches(HHMM, { message: 'end debe ser HH:mm' })
  end: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seats: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class UpdateSpaceBlockDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(YMD)
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(HHMM)
  start?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(HHMM)
  end?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seats?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}
