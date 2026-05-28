import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EgressType, PaymentMethod } from '../enums';

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

export class RetroactiveEgressDto {
  @ApiProperty({ description: 'Concepto/explicación del egreso retroactivo' })
  @IsString({ message: 'El concepto debe ser una cadena de texto' })
  @MaxLength(200, { message: 'El concepto no puede exceder 200 caracteres' })
  concept: string;

  @ApiProperty({ description: 'Monto del egreso', minimum: 0 })
  @IsNumber({}, { message: 'El monto debe ser un número' })
  @Min(0, { message: 'El monto debe ser mayor o igual a 0' })
  amount: number;

  @ApiProperty({ description: 'Método de pago', enum: PaymentMethod })
  @IsEnum(PaymentMethod, { message: 'El método de pago debe ser válido' })
  paymentMethod: PaymentMethod;

  @ApiProperty({ description: 'Tipo de egreso', enum: EgressType })
  @IsEnum(EgressType, { message: 'El tipo de egreso debe ser válido' })
  type: EgressType;

  @ApiPropertyOptional({ description: 'Notas adicionales del egreso' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RetroactiveIncomeDto {
  @ApiProperty({
    description:
      'Concepto del ingreso (ej. "corrección de saldo", "devolución recibida", etc.)',
  })
  @IsString({ message: 'El concepto debe ser una cadena de texto' })
  @MaxLength(200, { message: 'El concepto no puede exceder 200 caracteres' })
  concept: string;

  @ApiProperty({ description: 'Monto del ingreso', minimum: 0 })
  @IsNumber({}, { message: 'El monto debe ser un número' })
  @Min(0, { message: 'El monto debe ser mayor o igual a 0' })
  amount: number;

  @ApiProperty({ description: 'Método de pago', enum: PaymentMethod })
  @IsEnum(PaymentMethod, { message: 'El método de pago debe ser válido' })
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ description: 'Notas adicionales del ingreso' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class EditCashSessionDto {
  @ApiPropertyOptional({
    description:
      'Egresos retroactivos a cargar en la sesión. Cada uno se crea con createdAt dentro de la ventana de la sesión y el arqueo se recalcula.',
    type: [RetroactiveEgressDto],
  })
  @IsOptional()
  @IsArray({ message: 'addEgresses debe ser un array' })
  @ValidateNested({ each: true })
  @Type(() => RetroactiveEgressDto)
  addEgresses?: RetroactiveEgressDto[];

  @ApiPropertyOptional({
    description:
      'Ingresos retroactivos (correcciones de saldo, miscelánea) a cargar en la sesión.',
    type: [RetroactiveIncomeDto],
  })
  @IsOptional()
  @IsArray({ message: 'addIncomes debe ser un array' })
  @ValidateNested({ each: true })
  @Type(() => RetroactiveIncomeDto)
  addIncomes?: RetroactiveIncomeDto[];
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
