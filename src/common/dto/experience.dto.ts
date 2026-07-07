import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateExperienceDto {
  @ApiProperty({ description: 'Nombre de la experiencia' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'Descripción' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'Duración en minutos', minimum: 1 })
  @IsInt()
  @Min(1)
  durationMinutes: number;

  @ApiProperty({ description: 'Precio por persona (ARS)', minimum: 0 })
  @IsNumber()
  @Min(0)
  basePrice: number;

  @ApiProperty({
    description: 'Cupo por defecto al generar turnos',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  defaultCapacity: number;

  @ApiPropertyOptional({
    description: 'Seña (%) que se cobra al reservar. Default 50.',
    minimum: 0,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  depositPct?: number;

  @ApiProperty({
    description: 'Color hex (#RRGGBB) para la agenda',
    example: '#9d684e',
  })
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'color debe ser un hex tipo #RRGGBB',
  })
  color: string;

  @ApiPropertyOptional({ description: 'URLs de imágenes', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({
    description:
      'Se reserva online (genera turnos + seña). false = servicio coordinado (solo info + consulta)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  bookableOnline?: boolean;

  @ApiPropertyOptional({
    description:
      'Lugares FIJOS del salón que ocupa un turno abierto (ej. mesa de taller = 10). 0 = usa los anotados.',
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  venueSeats?: number;

  @ApiPropertyOptional({ description: 'Activa', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateExperienceDto extends PartialType(CreateExperienceDto) {}
