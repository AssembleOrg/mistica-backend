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
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

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

  @ApiPropertyOptional({
    description:
      "Clave de turno sugerido ('T1'): compatibilidad, bloquea el rango de ese turno. Preferí start/end.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  shift?: string;

  @ApiPropertyOptional({
    description: "Inicio del bloqueo, 'HH:mm'. Default: apertura del salón.",
  })
  @IsOptional()
  @Matches(HHMM, { message: 'start debe ser HH:mm' })
  start?: string;

  @ApiPropertyOptional({
    description: "Fin del bloqueo, 'HH:mm'. Default: cierre del salón.",
  })
  @IsOptional()
  @Matches(HHMM, { message: 'end debe ser HH:mm' })
  end?: string;

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

/**
 * Plantilla de turno SUGERIDO del día, editable desde el panel. Los turnos no
 * son por experiencia ni restringen horarios: ordenan la oferta de la landing
 * y el bot.
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

/**
 * Bloqueo FIJO semanal de mesas: un motivo o experiencia (taller, colonia)
 * que ocupa ciertas mesas todas las semanas en un día y rango horario. Baja
 * la disponibilidad de esos días sin materializar nada en la agenda.
 */
export class CreateRecurringBlockDto {
  @ApiProperty({
    description: "Motivo o experiencia ('Taller de cerámica', 'Escuelita')",
  })
  @IsString()
  @MaxLength(80)
  label: string;

  @ApiProperty({ description: 'Día ISO 1=lunes … 7=domingo' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @ApiProperty({ description: "Inicio del bloqueo, 'HH:mm' (hora local)" })
  @Matches(HHMM, { message: 'start debe ser HH:mm' })
  start: string;

  @ApiProperty({ description: "Fin del bloqueo, 'HH:mm' (hora local)" })
  @Matches(HHMM, { message: 'end debe ser HH:mm' })
  end: string;

  @ApiProperty({
    description: "Mesas que ocupa ('G1', 'M3')",
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(8, { each: true })
  tableCodes: string[];

  @ApiPropertyOptional({ description: 'Notas internas' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @ApiPropertyOptional({ description: '¿Está activo?', default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateRecurringBlockDto extends PartialType(
  CreateRecurringBlockDto,
) {}
