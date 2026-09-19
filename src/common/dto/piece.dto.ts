import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  ValidateNested,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ReservationPieceEntryDto {
  @ApiProperty({ description: 'Nombre y apellido de la persona' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  personName: string;

  @ApiProperty({ description: 'Firma colocada físicamente en la pieza' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  signature: string;

  @ApiProperty({ description: 'Pieza elegida' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  pieceType: string;

  @ApiProperty({ description: 'Colores utilizados' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  colorsUsed: string;
}

export class CreateReservationPiecesDto {
  @ApiProperty({ description: 'Reserva del día seleccionada' })
  @IsMongoId()
  reservationId: string;

  @ApiProperty({ type: [ReservationPieceEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReservationPieceEntryDto)
  entries: ReservationPieceEntryDto[];
}

/** Una ficha de pieza para un alumno del grupo. */
export class GroupPieceEntryDto {
  @ApiProperty({ description: 'Alumno del grupo al que pertenece la pieza' })
  @IsMongoId()
  studentId: string;

  @ApiProperty({ description: 'Nombre de la persona (por defecto, el alumno)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  personName: string;

  @ApiProperty({ description: 'Firma colocada físicamente en la pieza' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  signature: string;

  @ApiProperty({ description: 'Pieza elegida' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  pieceType: string;

  @ApiProperty({ description: 'Colores utilizados' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  colorsUsed: string;
}

export class CreateGroupPiecesDto {
  @ApiProperty({ description: 'Grupo de taller seleccionado' })
  @IsMongoId()
  groupId: string;

  @ApiProperty({ type: [GroupPieceEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GroupPieceEntryDto)
  entries: GroupPieceEntryDto[];
}

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
  @ApiPropertyOptional({
    description: 'Teléfono del cliente (si no hay reserva)',
  })
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

  // Datos de la ficha de la pieza (se cargan en el batch; acá se pueden editar).
  @ApiPropertyOptional({
    description: 'Nombre de la persona/autor de la pieza',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  personName?: string;

  @ApiPropertyOptional({ description: 'Firma / marca de la pieza' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  signature?: string;

  @ApiPropertyOptional({ description: 'Tipo de pieza (taza, plato…)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pieceType?: string;

  @ApiPropertyOptional({ description: 'Colores/esmaltes usados' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  colorsUsed?: string;

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

  @ApiPropertyOptional({
    description:
      'Busca por persona, firma, pieza, colores, teléfono, cliente o experiencia',
  })
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
