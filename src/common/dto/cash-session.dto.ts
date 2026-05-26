import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class OpenCashSessionDto {
  @ApiProperty({
    description: 'Monto inicial de efectivo en caja',
    minimum: 0,
  })
  @IsNumber({}, { message: 'El monto inicial debe ser un número' })
  @Min(0, { message: 'El monto inicial debe ser mayor o igual a 0' })
  openingCash: number;

  @ApiPropertyOptional({ description: 'Notas de apertura' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateCashSessionLabelDto {
  @ApiProperty({
    description:
      'Nombre editable de la sesión de caja. Enviar vacío para volver al default (día + fecha).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}

export class CloseCashSessionDto {
  @ApiProperty({
    description:
      'Conteo físico del efectivo en caja al cierre. Se compara contra el esperado y se calcula la diferencia.',
    minimum: 0,
  })
  @IsNumber({}, { message: 'El conteo de cierre debe ser un número' })
  @Min(0, { message: 'El conteo de cierre debe ser mayor o igual a 0' })
  countedClosingCash: number;

  @ApiPropertyOptional({ description: 'Notas de cierre (justificar diferencias)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
