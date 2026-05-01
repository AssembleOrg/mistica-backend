import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Body para emitir una nota de crédito sobre una venta.
 * - `amount` opcional: si se omite, se asume el total de la venta.
 *   Es editable a propósito (el operador puede acreditar parcial).
 * - `reason` opcional: motivo interno (ej. "devolución de 1 producto").
 */
export class IssueCreditNoteDto {
  @ApiPropertyOptional({
    description: 'Monto a acreditar. Si se omite, default = total de la venta.',
    minimum: 0.01,
  })
  @IsOptional()
  @IsNumber({}, { message: 'amount debe ser un número' })
  @Min(0.01, { message: 'amount debe ser mayor a 0' })
  amount?: number;

  @ApiPropertyOptional({ description: 'Motivo interno' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
