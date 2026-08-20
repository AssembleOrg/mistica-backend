import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  ValidateNested,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePieceDto {
  // Camino NORMAL: asignar la pieza a una reserva. El contacto (teléfono,
  // nombre) y la experiencia salen de la reserva; no hay que retipearlos.
  @ApiPropertyOptional({ description: 'Reserva a la que se asigna la pieza' })
  @IsOptional()
  @IsMongoId()
  reservationId?: string;

  // Piezas de alumnos del taller: se asignan al alumno en vez de a una reserva.
  @ApiPropertyOptional({ description: 'Alumno al que pertenece la pieza' })
  @IsOptional()
  @IsMongoId()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Profesor asignado al proceso' })
  @IsOptional()
  @IsMongoId()
  professorId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'URLs de fotos de la pieza',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  photos?: string[];

  // Camino manual (pieza sin reserva, ej. huérfana): datos de contacto a mano.
  @ApiPropertyOptional({ description: 'Teléfono del cliente (si no hay reserva)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'Nombre del cliente' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional({ description: 'Experiencia de origen' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  experienceName?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Clave de estado (configurable; ver GET /pieces/statuses)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({ description: 'Notas internas' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

}

export class UpdatePieceDto {
  @ApiPropertyOptional({
    description: 'Clave de estado (configurable; ver GET /pieces/statuses)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  experienceName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Profesor asignado al proceso' })
  @IsOptional()
  @IsMongoId()
  professorId?: string;

  @ApiPropertyOptional({ description: 'Alumno al que pertenece la pieza' })
  @IsOptional()
  @IsMongoId()
  studentId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'URLs de fotos de la pieza (reemplaza la lista)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  photos?: string[];
}

export class PieceStatusConfigDto {
  @ApiProperty({ description: "Clave ('FRESCO', 'EN_PROCESO'…)" })
  @IsString()
  @MaxLength(40)
  key: string;

  @ApiProperty({ description: "Etiqueta visible ('Fresco', 'En proceso'…)" })
  @IsString()
  @MaxLength(60)
  label: string;

  @ApiPropertyOptional({
    description: 'Al entrar acá se avisa al cliente que está lista (una vez)',
  })
  @IsOptional()
  isReady?: boolean;

  @ApiPropertyOptional({ description: 'Cierra el ciclo (entregada/retirada)' })
  @IsOptional()
  isFinal?: boolean;
}

export class SetPieceStatusesDto {
  @ApiProperty({ type: [PieceStatusConfigDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PieceStatusConfigDto)
  statuses: PieceStatusConfigDto[];
}

export class ListPiecesQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por profesor asignado' })
  @IsOptional()
  @IsMongoId()
  professorId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por alumno' })
  @IsOptional()
  @IsMongoId()
  studentId?: string;

  @ApiPropertyOptional({
    description: 'Clave de estado (configurable; ver GET /pieces/statuses)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({ description: 'Busca por teléfono, nombre o experiencia' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
