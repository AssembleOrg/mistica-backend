import { 
  IsString, 
  IsEmail, 
  IsOptional, 
  IsNotEmpty, 
  MaxLength, 
  MinLength,
  IsArray,
  ValidateNested,
  IsNumber,
  Min
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePrepaidDto {
  @ApiProperty({ description: 'Monto del prepago', minimum: 0.01 })
  @IsNumber({}, { message: 'El monto debe ser un número' })
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  amount: number;

  @ApiPropertyOptional({ description: 'Notas del prepago' })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  @MaxLength(500, { message: 'Las notas no pueden exceder 500 caracteres' })
  notes?: string;
}

export class CreateClientDto {
  @ApiProperty({ description: 'Nombre completo del cliente' })
  @IsString({ message: 'El nombre completo debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre completo es requerido' })
  @MinLength(2, { message: 'El nombre completo debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre completo no puede exceder 100 caracteres' })
  fullName: string;

  @ApiPropertyOptional({ description: 'Teléfono del cliente' })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @MaxLength(20, { message: 'El teléfono no puede exceder 20 caracteres' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Email del cliente' })
  @IsOptional()
  @IsEmail({}, { message: 'El email debe tener un formato válido' })
  @MaxLength(255, { message: 'El email no puede exceder 255 caracteres' })
  email?: string;

  @ApiPropertyOptional({ description: 'Notas del cliente' })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  @MaxLength(1000, { message: 'Las notas no pueden exceder 1000 caracteres' })
  notes?: string;

  @ApiPropertyOptional({ description: 'CUIT del cliente' })
  @IsOptional()
  @IsString({ message: 'El CUIT debe ser una cadena de texto' })
  @MaxLength(13, { message: 'El CUIT no puede exceder 13 caracteres' })
  cuit?: string;

  @ApiPropertyOptional({ 
    description: 'Prepaids del cliente',
    type: [CreatePrepaidDto]
  })
  @IsOptional()
  @IsArray({ message: 'Los prepaids deben ser un array' })
  @ValidateNested({ each: true })
  @Type(() => CreatePrepaidDto)
  prepaids?: CreatePrepaidDto[];
}

export class UpdateClientDto {
  @ApiPropertyOptional({ description: 'Nombre completo del cliente' })
  @IsOptional()
  @IsString({ message: 'El nombre completo debe ser una cadena de texto' })
  @MinLength(2, { message: 'El nombre completo debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre completo no puede exceder 100 caracteres' })
  fullName?: string;

  @ApiPropertyOptional({ description: 'Teléfono del cliente' })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @MaxLength(20, { message: 'El teléfono no puede exceder 20 caracteres' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Email del cliente' })
  @IsOptional()
  @IsEmail({}, { message: 'El email debe tener un formato válido' })
  @MaxLength(255, { message: 'El email no puede exceder 255 caracteres' })
  email?: string;

  @ApiPropertyOptional({ description: 'Notas del cliente' })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  @MaxLength(1000, { message: 'Las notas no pueden exceder 1000 caracteres' })
  notes?: string;

  @ApiPropertyOptional({ description: 'CUIT del cliente' })
  @IsOptional()
  @IsString({ message: 'El CUIT debe ser una cadena de texto' })
  @MaxLength(13, { message: 'El CUIT no puede exceder 13 caracteres' })
  cuit?: string;

  @ApiPropertyOptional({ 
    description: 'Prepaids del cliente',
    type: [CreatePrepaidDto]
  })
  @IsOptional()
  @IsArray({ message: 'Los prepaids deben ser un array' })
  @ValidateNested({ each: true })
  @Type(() => CreatePrepaidDto)
  prepaids?: CreatePrepaidDto[];
}
