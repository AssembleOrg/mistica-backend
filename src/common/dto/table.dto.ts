import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class DayAgendaQueryDto {
  @ApiProperty({ description: 'Fecha del día, YYYY-MM-DD (hora de Argentina)' })
  @Matches(YMD, { message: 'date debe ser YYYY-MM-DD' })
  date: string;
}

export class ReassignTablesDto {
  @ApiProperty({ description: 'Reserva a la que se le cambian las mesas' })
  @IsMongoId()
  reservationId: string;

  @ApiProperty({
    description:
      "Mesas que va a ocupar ('M1', 'G1'). Reemplaza la asignación actual.",
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(8, { each: true })
  tables: string[];
}

export class BlockTableDto {
  @ApiProperty({ description: 'Fecha del día, YYYY-MM-DD' })
  @Matches(YMD, { message: 'date debe ser YYYY-MM-DD' })
  date: string;

  @ApiProperty({ description: "Clave del turno ('T1', 'T2')" })
  @IsString()
  @MaxLength(8)
  shift: string;

  @ApiProperty({ description: "Código de la mesa ('M1', 'G1')" })
  @IsString()
  @MaxLength(8)
  code: string;

  @ApiProperty({
    description: 'Motivo del bloqueo (taller, evento, mesa rota)',
  })
  @IsString()
  @MaxLength(80)
  label: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Plantilla de turno del día, editable desde el panel. Los turnos NO son por
 * experiencia: existen solos y en un mismo turno conviven reservas de
 * experiencias distintas.
 */
export class CreateShiftTemplateDto {
  @ApiProperty({ description: "Clave corta y estable ('T1')" })
  @IsString()
  @MaxLength(8)
  key: string;

  @ApiProperty({ description: "Nombre visible ('Turno 1')" })
  @IsString()
  @MaxLength(60)
  name: string;

  @ApiProperty({ description: 'Hora de inicio, HH:mm' })
  @Matches(HHMM, { message: 'start debe ser HH:mm' })
  start: string;

  @ApiProperty({ description: 'Hora de fin, HH:mm' })
  @Matches(HHMM, { message: 'end debe ser HH:mm' })
  end: string;

  @ApiPropertyOptional({
    description:
      'Día ISO 1=lunes … 7=domingo. Vacío = todos los días. Si un día tiene ' +
      'turnos propios, esos mandan sobre los genéricos.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number;

  @ApiPropertyOptional({
    description:
      'Experiencias habilitadas en este turno. Vacío = todas las reservables.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  experienceIds?: string[];

  @ApiPropertyOptional({ description: 'Orden de aparición' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ description: '¿Está activo?', default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateShiftTemplateDto extends PartialType(
  CreateShiftTemplateDto,
) {}
