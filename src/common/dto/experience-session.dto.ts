import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SessionStatus } from '../enums/reservation.enum';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:mm 24h

/** Un slot a crear: fecha + hora local (zona Bs.As.), con overrides opcionales. */
export class SessionSlotDto {
  @ApiProperty({
    description: 'Fecha local (YYYY-MM-DD)',
    example: '2026-07-05',
  })
  @IsString()
  @Matches(DATE_RE, { message: 'date debe ser YYYY-MM-DD' })
  date: string;

  @ApiProperty({ description: 'Hora local 24h (HH:mm)', example: '15:00' })
  @IsString()
  @Matches(TIME_RE, { message: 'time debe ser HH:mm' })
  time: string;

  @ApiPropertyOptional({
    description: 'Cupo (si se omite usa defaultCapacity)',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({
    description: 'Precio por persona (si se omite usa basePrice)',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Notas del turno' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/**
 * Generación de turnos en lote ("repetir carga rápida"): una experiencia y N
 * slots (fechas/horas). Cada slot copia precio/cupo/duración de la experiencia
 * salvo override. `publish` decide si nacen OPEN (visibles) o DRAFT.
 */
export class GenerateSessionsDto {
  @ApiProperty({ description: 'ID de la experiencia plantilla' })
  @IsMongoId()
  experienceId: string;

  @ApiProperty({ description: 'Slots a crear', type: [SessionSlotDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SessionSlotDto)
  slots: SessionSlotDto[];

  @ApiPropertyOptional({
    description: 'Publicar (OPEN) en vez de DRAFT',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

/** Actualización puntual de un turno (cupo, estado, precio, notas). */
export class UpdateSessionDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ enum: SessionStatus })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
