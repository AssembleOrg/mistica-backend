import { 
  IsString, 
  IsEmail, 
  IsOptional, 
  IsArray, 
  IsNumber, 
  IsEnum, 
  IsNotEmpty, 
  IsBoolean,
  Min, 
  Max,
  MaxLength, 
  ValidateNested, 
  ArrayMinSize,
  IsDateString
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, SaleStatus } from '../enums';

export class CreateSaleItemDto {
  @ApiProperty({ description: 'ID del producto' })
  @IsString({ message: 'El ID del producto debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El ID del producto es requerido' })
  productId: string;

  @ApiProperty({ description: 'Cantidad del producto', minimum: 1 })
  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @Min(1, { message: 'La cantidad debe ser mayor a 0' })
  quantity: number;

  @ApiProperty({ description: 'Precio unitario del producto', minimum: 0 })
  @IsNumber({}, { message: 'El precio unitario debe ser un número' })
  @Min(0, { message: 'El precio unitario debe ser mayor o igual a 0' })
  unitPrice: number;
}

export class CreateSaleDto {
  @ApiPropertyOptional({ description: 'ID del cliente' })
  @IsOptional()
  @IsString({ message: 'El ID del cliente debe ser una cadena de texto' })
  clientId?: string;

  @ApiPropertyOptional({ description: 'Nombre del cliente' })
  @IsOptional()
  @IsString({ message: 'El nombre del cliente debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El nombre del cliente no puede exceder 100 caracteres' })
  customerName?: string;

  @ApiPropertyOptional({ description: 'Email del cliente' })
  @IsOptional()
  @IsEmail({}, { message: 'El email debe tener un formato válido' })
  @MaxLength(255, { message: 'El email no puede exceder 255 caracteres' })
  customerEmail?: string;

  @ApiPropertyOptional({ description: 'Teléfono del cliente' })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @MaxLength(20, { message: 'El teléfono no puede exceder 20 caracteres' })
  customerPhone?: string;

  @ApiProperty({ 
    description: 'Items de la venta',
    type: [CreateSaleItemDto],
    minItems: 1
  })
  @IsArray({ message: 'Los items deben ser un array' })
  @ArrayMinSize(1, { message: 'La venta debe tener al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];

  @ApiProperty({ 
    description: 'Método de pago',
    enum: PaymentMethod
  })
  @IsEnum(PaymentMethod, { message: 'El método de pago debe ser válido' })
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ description: 'Notas adicionales' })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  @MaxLength(500, { message: 'Las notas no pueden exceder 500 caracteres' })
  notes?: string;

  @ApiPropertyOptional({ 
    description: 'Porcentaje de impuesto a aplicar (0-100)',
    minimum: 0,
    maximum: 100,
    default: 0
  })
  @IsOptional()
  @IsNumber({}, { message: 'El impuesto debe ser un número' })
  @Min(0, { message: 'El impuesto debe ser mayor o igual a 0' })
  @Max(100, { message: 'El impuesto no puede ser mayor a 100' })
  tax?: number;

  @ApiPropertyOptional({ 
    description: 'Porcentaje de descuento a aplicar (0-100)',
    minimum: 0,
    maximum: 100,
    default: 0
  })
  @IsOptional()
  @IsNumber({}, { message: 'El descuento debe ser un número' })
  @Min(0, { message: 'El descuento debe ser mayor o igual a 0' })
  @Max(100, { message: 'El descuento no puede ser mayor a 100' })
  discount?: number;

  @ApiPropertyOptional({ 
    description: 'Monto en dinero usado de prepaid',
    minimum: 0,
    default: 0
  })
  @IsOptional()
  @IsNumber({}, { message: 'El monto de prepaid usado debe ser un número' })
  @Min(0, { message: 'El monto de prepaid usado debe ser mayor o igual a 0' })
  prepaidUsed?: number;

  @ApiPropertyOptional({ 
    description: 'ID del prepaid a consumir',
    example: '68ba80bd888b3960426b7f55'
  })
  @IsOptional()
  @IsString({ message: 'El ID del prepaid debe ser una cadena de texto' })
  prepaidId?: string;

  @ApiPropertyOptional({ 
    description: 'Indica si se debe consumir el prepaid especificado',
    default: false,
    example: true
  })
  @IsOptional()
  @IsBoolean({ message: 'El campo consumedPrepaid debe ser un booleano' })
  consumedPrepaid?: boolean;
}

export class UpdateSaleDto {
  @ApiPropertyOptional({ description: 'ID del cliente' })
  @IsOptional()
  @IsString({ message: 'El ID del cliente debe ser una cadena de texto' })
  clientId?: string;

  @ApiPropertyOptional({ description: 'Nombre del cliente' })
  @IsOptional()
  @IsString({ message: 'El nombre del cliente debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El nombre del cliente no puede exceder 100 caracteres' })
  customerName?: string;

  @ApiPropertyOptional({ description: 'Email del cliente' })
  @IsOptional()
  @IsEmail({}, { message: 'El email debe tener un formato válido' })
  @MaxLength(255, { message: 'El email no puede exceder 255 caracteres' })
  customerEmail?: string;

  @ApiPropertyOptional({ description: 'Teléfono del cliente' })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @MaxLength(20, { message: 'El teléfono no puede exceder 20 caracteres' })
  customerPhone?: string;

  @ApiPropertyOptional({ 
    description: 'Items de la venta',
    type: [CreateSaleItemDto]
  })
  @IsOptional()
  @IsArray({ message: 'Los items deben ser un array' })
  @ArrayMinSize(1, { message: 'La venta debe tener al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items?: CreateSaleItemDto[];

  @ApiPropertyOptional({ 
    description: 'Método de pago',
    enum: PaymentMethod
  })
  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'El método de pago debe ser válido' })
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ 
    description: 'Estado de la venta',
    enum: SaleStatus
  })
  @IsOptional()
  @IsEnum(SaleStatus, { message: 'El estado debe ser válido' })
  status?: SaleStatus;

  @ApiPropertyOptional({ description: 'Notas adicionales' })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  @MaxLength(500, { message: 'Las notas no pueden exceder 500 caracteres' })
  notes?: string;

  @ApiPropertyOptional({ 
    description: 'Porcentaje de impuesto a aplicar (0-100)',
    minimum: 0,
    maximum: 100
  })
  @IsOptional()
  @IsNumber({}, { message: 'El impuesto debe ser un número' })
  @Min(0, { message: 'El impuesto debe ser mayor o igual a 0' })
  @Max(100, { message: 'El impuesto no puede ser mayor a 100' })
  tax?: number;

  @ApiPropertyOptional({ 
    description: 'Porcentaje de descuento a aplicar (0-100)',
    minimum: 0,
    maximum: 100
  })
  @IsOptional()
  @IsNumber({}, { message: 'El descuento debe ser un número' })
  @Min(0, { message: 'El descuento debe ser mayor o igual a 0' })
  @Max(100, { message: 'El descuento no puede ser mayor a 100' })
  discount?: number;

  @ApiPropertyOptional({ 
    description: 'Monto en dinero usado de prepaid',
    minimum: 0
  })
  @IsOptional()
  @IsNumber({}, { message: 'El monto de prepaid usado debe ser un número' })
  @Min(0, { message: 'El monto de prepaid usado debe ser mayor o igual a 0' })
  prepaidUsed?: number;

  @ApiPropertyOptional({ 
    description: 'ID del prepaid a consumir',
    example: '68ba80bd888b3960426b7f55'
  })
  @IsOptional()
  @IsString({ message: 'El ID del prepaid debe ser una cadena de texto' })
  prepaidId?: string;

  @ApiPropertyOptional({ 
    description: 'Indica si se debe consumir el prepaid especificado',
    default: false,
    example: true
  })
  @IsOptional()
  @IsBoolean({ message: 'El campo consumedPrepaid debe ser un booleano' })
  consumedPrepaid?: boolean;
}

export class DailySalesQueryDto {
  @ApiPropertyOptional({ 
    description: 'Fecha para consultar ventas (YYYY-MM-DD)',
    example: '2025-08-26'
  })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ 
    description: 'Zona horaria',
    example: 'America/Argentina/Buenos_Aires',
    default: 'America/Argentina/Buenos_Aires'
  })
  @IsOptional()
  @IsString({ message: 'La zona horaria debe ser una cadena de texto' })
  timezone?: string;
}
