import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class GroupSlotDto {
  @ApiProperty({ description: 'Día ISO (1=lunes..7=domingo)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @ApiProperty({ description: "Inicio 'HH:mm'" })
  @Matches(HHMM, { message: 'start debe ser HH:mm' })
  start: string;

  @ApiProperty({ description: "Fin 'HH:mm'" })
  @Matches(HHMM, { message: 'end debe ser HH:mm' })
  end: string;
}

export class CreateGroupDto {
  @ApiProperty({ description: 'Nombre del grupo/taller/clase' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'Breve descripción' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Profesor a cargo' })
  @IsOptional()
  @IsMongoId()
  professorId?: string;

  @ApiProperty({
    type: [GroupSlotDto],
    description: 'Único día y horario semanal',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'El grupo debe tener un día y horario' })
  @ArrayMaxSize(1, { message: 'El grupo acepta un único día y horario' })
  @ValidateNested({ each: true })
  @Type(() => GroupSlotDto)
  schedule: GroupSlotDto[];

  @ApiPropertyOptional({ type: [String], description: 'Alumnos asociados' })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  studentIds?: string[];

  @ApiPropertyOptional({ description: 'Información de la actividad' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateGroupDto extends PartialType(CreateGroupDto) {}
