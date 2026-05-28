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
import { PaymentMethod, SaleStatus, InvoiceType, TaxCondition } from '../enums';

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

/**
 * Línea de pago de una venta. Una venta puede tener varias (efectivo +
 * tarjeta + transferencia, en cualquier combinación). Se permite una sola
 * entrada por método: si el cliente pone "$5 cash + $3 cash" se suma como
 * un solo CASH de $8.
 */
export class CreateSalePaymentDto {
  @ApiProperty({ description: 'Método de pago', enum: PaymentMethod })
  @IsEnum(PaymentMethod, { message: 'El método de pago debe ser válido' })
  method: PaymentMethod;

  @ApiProperty({
    description: 'Monto que se imputa a este método',
    minimum: 0,
  })
  @IsNumber({}, { message: 'El monto debe ser un número' })
  @Min(0, { message: 'El monto debe ser mayor o igual a 0' })
  amount: number;
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

  @ApiPropertyOptional({
    description:
      'Items de la venta. Puede ir vacío o no enviarse: en ese caso el total se toma de la suma de los pagos ("monto a cobrar").',
    type: [CreateSaleItemDto],
  })
  @IsOptional()
  @IsArray({ message: 'Los items deben ser un array' })
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items?: CreateSaleItemDto[];

  @ApiProperty({
    description:
      'Pagos de la venta. La suma de `amount` debe igualar el `total` calculado. Sólo se permite una entrada por método.',
    type: [CreateSalePaymentDto],
    minItems: 1,
  })
  @IsArray({ message: 'Los pagos deben ser un array' })
  @ArrayMinSize(1, { message: 'La venta debe tener al menos un pago' })
  @ValidateNested({ each: true })
  @Type(() => CreateSalePaymentDto)
  payments: CreateSalePaymentDto[];

  @ApiPropertyOptional({
    description:
      'Nombre amigable de la venta (ej. "Pepe"). Opcional. El N° de venta se sigue generando aparte.',
  })
  @IsOptional()
  @IsString({ message: 'El nombre de la venta debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El nombre de la venta no puede exceder 100 caracteres' })
  name?: string;

  @ApiPropertyOptional({ description: 'Notas adicionales' })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  @MaxLength(500, { message: 'Las notas no pueden exceder 500 caracteres' })
  notes?: string;

  @ApiProperty({ description: 'Nombre del vendedor' })
  @IsString({ message: 'El vendedor debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El vendedor es requerido' })
  @MaxLength(100, { message: 'El vendedor no puede exceder 100 caracteres' })
  seller: string;

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
    description: 'Ajuste en monto fijo (pesos): positivo = descuento, negativo = recargo',
    default: 0,
  })
  // Ajuste en MONTO FIJO (pesos) sobre el subtotal: positivo = descuento,
  // negativo = recargo. Se mantuvo el nombre `discount` por compatibilidad
  // con la base de datos existente.
  @IsOptional()
  @IsNumber({}, { message: 'El ajuste debe ser un número' })
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
  @ApiPropertyOptional({
    description:
      'Nombre amigable de la venta. Enviar vacío para limpiarlo y volver al default ("-").',
  })
  @IsOptional()
  @IsString({ message: 'El nombre de la venta debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El nombre de la venta no puede exceder 100 caracteres' })
  name?: string;

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
    description: 'Items de la venta (puede ir vacío)',
    type: [CreateSaleItemDto],
  })
  @IsOptional()
  @IsArray({ message: 'Los items deben ser un array' })
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items?: CreateSaleItemDto[];

  @ApiPropertyOptional({
    description: 'Pagos de la venta (reemplaza el set previo si se envía)',
    type: [CreateSalePaymentDto],
  })
  @IsOptional()
  @IsArray({ message: 'Los pagos deben ser un array' })
  @ArrayMinSize(1, { message: 'La venta debe tener al menos un pago' })
  @ValidateNested({ each: true })
  @Type(() => CreateSalePaymentDto)
  payments?: CreateSalePaymentDto[];

  @ApiPropertyOptional({
    description: 'Estado de la venta',
    enum: SaleStatus,
  })
  @IsOptional()
  @IsEnum(SaleStatus, { message: 'El estado debe ser válido' })
  status?: SaleStatus;

  @ApiPropertyOptional({ description: 'Notas adicionales' })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  @MaxLength(500, { message: 'Las notas no pueden exceder 500 caracteres' })
  notes?: string;

  @ApiPropertyOptional({ description: 'Nombre del vendedor' })
  @IsOptional()
  @IsString({ message: 'El vendedor debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El vendedor no puede exceder 100 caracteres' })
  seller?: string;

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
  // Ajuste en MONTO FIJO (pesos) sobre el subtotal: positivo = descuento,
  // negativo = recargo. Se mantuvo el nombre `discount` por compatibilidad
  // con la base de datos existente.
  @IsOptional()
  @IsNumber({}, { message: 'El ajuste debe ser un número' })
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

  @ApiPropertyOptional({
    description: 'Indica si se debe generar factura electrónica AFIP al completar la venta',
    default: false,
    example: true
  })
  @IsOptional()
  @IsBoolean({ message: 'El campo shouldInvoice debe ser un booleano' })
  shouldInvoice?: boolean;

  // Datos para la factura AFIP. Solo se usan si shouldInvoice=true.
  // Si no se proveen, default = Factura C consumidor final no identificado.
  @ApiPropertyOptional({ description: 'Tipo de factura a emitir (A/B/C)', enum: InvoiceType })
  @IsOptional()
  @IsEnum(InvoiceType, { message: 'El tipo de factura debe ser A, B o C' })
  invoiceType?: InvoiceType;

  @ApiPropertyOptional({ description: 'CUIT del receptor (11 dígitos)' })
  @IsOptional()
  @IsString({ message: 'El CUIT debe ser una cadena' })
  @MaxLength(13)
  invoiceCuit?: string;

  @ApiPropertyOptional({ description: 'Condición fiscal del receptor', enum: TaxCondition })
  @IsOptional()
  @IsEnum(TaxCondition, { message: 'La condición fiscal debe ser válida' })
  invoiceTaxCondition?: TaxCondition;

  @ApiPropertyOptional({ description: 'Razón social del receptor' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  invoiceBusinessName?: string;

  @ApiPropertyOptional({ description: 'Domicilio fiscal del receptor' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  invoiceFiscalAddress?: string;
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
