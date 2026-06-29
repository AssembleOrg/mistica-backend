import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
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

  @ApiPropertyOptional({ description: 'URLs de imágenes', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ description: 'Activa', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateExperienceDto extends PartialType(CreateExperienceDto) {}
