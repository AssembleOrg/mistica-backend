import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Variante de precio: modalidad alternativa (escuelita mensual) o tier por
 * cantidad (cumpleaños 5+/10+ con extras). Ver PriceVariant en el schema.
 */
export class PriceVariantDto {
  @ApiProperty({ description: "Nombre visible ('Mensual', 'Grupo de 5 o más')" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({
    description:
      'Precio en ARS. Ausente = beneficio puro: mantiene el precio base sobre el que aplica.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiProperty({
    enum: ['PER_PERSON', 'FLAT'],
    description: 'PER_PERSON: por persona (puede auto-aplicarse por rango). FLAT: total fijo informativo.',
  })
  @IsEnum(['PER_PERSON', 'FLAT'])
  unit: 'PER_PERSON' | 'FLAT';

  @ApiPropertyOptional({ description: 'Se activa desde N personas' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minQty?: number;

  @ApiPropertyOptional({ description: 'Hasta N personas' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxQty?: number;

  @ApiPropertyOptional({
    type: [Number],
    description: 'Días de semana ISO en los que rige (1=lunes..7=domingo)',
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  days?: number[];

  @ApiPropertyOptional({ description: "Rige desde ('YYYY-MM-DD')" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @ApiPropertyOptional({ description: "Rige hasta ('YYYY-MM-DD')" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;

  @ApiPropertyOptional({
    description:
      'Lugares bonificados: cuando la promo aplica se cobran (cantidad - freeSpots) personas',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  freeSpots?: number;

  @ApiPropertyOptional({ description: "Qué incluye ('torta + pieza de regalo')" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Un horario propio: día de semana + hora de inicio. Ver Experience.ownSchedule. */
export class OwnSlotDto {
  @ApiProperty({ description: 'Día de semana ISO (1=lunes..7=domingo)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @ApiProperty({ description: "Hora de inicio 'HH:mm'", example: '18:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: "start debe ser una hora 'HH:mm'",
  })
  start: string;
}

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

  @ApiPropertyOptional({
    description:
      'Apodos/abreviaturas con los que la nombran los clientes ("AYD", ' +
      '"cerámica y brunch"). El bot los usa para reconocerla en la charla. ' +
      'No pueden repetirse entre experiencias.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  aliases?: string[];

  @ApiPropertyOptional({
    description: 'Variantes de precio (modalidades y tiers por cantidad)',
    type: [PriceVariantDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceVariantDto)
  priceVariants?: PriceVariantDto[];

  @ApiPropertyOptional({
    description:
      'Horario propio (día + hora de inicio). Si tiene alguno, la experiencia se ofrece SÓLO ' +
      'en esos horarios y no en los turnos generales (ej. Escuelita: miércoles 18:00). ' +
      'Vacío = turnos generales.',
    type: [OwnSlotDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OwnSlotDto)
  ownSchedule?: OwnSlotDto[];

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

  @ApiPropertyOptional({
    description:
      'Marca el doc Cumpleaños (ocasión): hereda precio/duración de la experiencia elegida y aporta beneficios. A lo sumo uno.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isBirthday?: boolean;

  @ApiPropertyOptional({ description: 'Activa', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateExperienceDto extends PartialType(CreateExperienceDto) {}
