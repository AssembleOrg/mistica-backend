import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PieceStatus } from '../enums/piece.enum';

export class CreatePieceDto {
  // Camino NORMAL: asignar la pieza a una reserva. El contacto (teléfono,
  // nombre) y la experiencia salen de la reserva; no hay que retipearlos.
  @ApiPropertyOptional({ description: 'Reserva a la que se asigna la pieza' })
  @IsOptional()
  @IsMongoId()
  reservationId?: string;

  @ApiPropertyOptional({ description: 'Profesor asignado al proceso' })
  @IsOptional()
  @IsMongoId()
  professorId?: string;

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

  @ApiPropertyOptional({ enum: PieceStatus })
  @IsOptional()
  @IsEnum(PieceStatus)
  status?: PieceStatus;

  @ApiPropertyOptional({ description: 'Notas internas' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

}

export class UpdatePieceDto {
  @ApiPropertyOptional({ enum: PieceStatus })
  @IsOptional()
  @IsEnum(PieceStatus)
  status?: PieceStatus;

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
}

export class ListPiecesQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por profesor asignado' })
  @IsOptional()
  @IsMongoId()
  professorId?: string;

  @ApiPropertyOptional({ enum: PieceStatus })
  @IsOptional()
  @IsEnum(PieceStatus)
  status?: PieceStatus;

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
