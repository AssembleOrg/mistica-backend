import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ClosedDateKind } from '../enums/closed-date.enum';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class CreateClosedDateDto {
  @ApiProperty({ enum: ClosedDateKind })
  @IsEnum(ClosedDateKind)
  kind: ClosedDateKind;

  // ── kind = DATE ──
  @ApiPropertyOptional({ description: 'Desde (YYYY-MM-DD). Requerido si kind=DATE' })
  @ValidateIf((o: CreateClosedDateDto) => o.kind === ClosedDateKind.DATE)
  @IsString()
  @Matches(YMD, { message: 'from debe tener formato YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    description: 'Hasta (YYYY-MM-DD). Si se omite, igual a `from` (un solo día)',
  })
  @ValidateIf((o: CreateClosedDateDto) => o.kind === ClosedDateKind.DATE)
  @IsOptional()
  @IsString()
  @Matches(YMD, { message: 'to debe tener formato YYYY-MM-DD' })
  to?: string;

  // ── kind = WEEKLY ──
  @ApiPropertyOptional({
    description: 'Día de semana ISO (1=lunes … 7=domingo). Requerido si kind=WEEKLY',
    minimum: 1,
    maximum: 7,
  })
  @ValidateIf((o: CreateClosedDateDto) => o.kind === ClosedDateKind.WEEKLY)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number;

  @ApiPropertyOptional({ description: 'Motivo (ej. Feriado, Vacaciones)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reason?: string;
}
