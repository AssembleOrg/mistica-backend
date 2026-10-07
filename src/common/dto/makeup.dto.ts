import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Agendar (o cambiar) dónde recupera un alumno la clase que falta. */
export class ScheduleMakeupDto {
  @ApiProperty({ description: 'Alumno' })
  @IsMongoId()
  studentId: string;

  @ApiProperty({ description: 'Grupo de la clase que falta' })
  @IsMongoId()
  fromGroupId: string;

  @ApiProperty({ description: "Día de la clase que falta, 'YYYY-MM-DD'" })
  @Matches(YMD, { message: 'La fecha va en formato YYYY-MM-DD' })
  fromDate: string;

  @ApiProperty({ description: 'Grupo en el que la recupera' })
  @IsMongoId()
  toGroupId: string;

  @ApiProperty({ description: "Día en que la recupera, 'YYYY-MM-DD'" })
  @Matches(YMD, { message: 'La fecha va en formato YYYY-MM-DD' })
  toDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Quién la agenda (cuentas compartidas). Si no viene, el nombre de la cuenta.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  doneBy?: string;
}

export class ListMakeupsQueryDto {
  @ApiPropertyOptional({ description: 'Grupo (con date: lo que entra y sale de esa clase)' })
  @IsOptional()
  @IsMongoId()
  groupId?: string;

  @ApiPropertyOptional({ description: "Día de la clase, 'YYYY-MM-DD'" })
  @IsOptional()
  @Matches(YMD, { message: 'La fecha va en formato YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ description: 'Alumno' })
  @IsOptional()
  @IsMongoId()
  studentId?: string;
}
