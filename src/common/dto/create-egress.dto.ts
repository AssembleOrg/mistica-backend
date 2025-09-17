import { IsString, IsNumber, IsEnum, IsOptional, MinLength, Min, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, EgressType, EgressStatus } from '../enums';

export class CreateEgressDto {
  @ApiProperty({
    description: 'Concepto o explicación del egreso',
    example: 'Retiro de caja chica para gastos operativos',
    minLength: 3
  })
  @IsString()
  @MinLength(3)
  concept: string;

  @ApiProperty({
    description: 'Monto del egreso',
    example: 150.50,
    minimum: 0
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @ApiProperty({
    description: 'Moneda del egreso',
    enum: Currency,
    example: Currency.USD
  })
  @IsEnum(Currency)
  currency: Currency;

  @ApiProperty({
    description: 'Tipo de egreso',
    enum: EgressType,
    example: EgressType.WITHDRAWAL
  })
  @IsEnum(EgressType)
  type: EgressType;

  @ApiPropertyOptional({
    description: 'Notas adicionales sobre el egreso',
    example: 'Autorizado por gerencia para mantenimiento de equipos'
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Persona que autoriza el egreso',
    example: 'Juan Pérez - Gerente'
  })
  @IsOptional()
  @IsString()
  authorizedBy?: string;

  @ApiPropertyOptional({
    description: 'ID del usuario que registra el egreso',
    example: '507f1f77bcf86cd799439011'
  })
  @IsOptional()
  @IsMongoId()
  userId?: string;
}