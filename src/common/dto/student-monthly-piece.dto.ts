import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** Pieza del mes de un alumno (upsert: sólo lo que viene se actualiza). */
export class UpsertMonthlyPieceDto {
  @ApiPropertyOptional({ description: 'Qué pieza pidió' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pieceName?: string;

  @ApiPropertyOptional({ description: 'true = en bizcocho; false = fresca' })
  @IsOptional()
  @IsBoolean()
  bisque?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() delivered?: boolean;

  @ApiPropertyOptional({ description: 'Corresponde adicional (sólo admin)' })
  @IsOptional()
  @IsBoolean()
  extraCharge?: boolean;

  @ApiPropertyOptional({ description: 'Monto del adicional (sólo admin)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  extraAmount?: number;

  @ApiPropertyOptional({ description: 'Adicional cobrado (sólo admin)' })
  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
