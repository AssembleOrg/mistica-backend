import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductKind, UnitOfMeasure } from '../enums';

export class CreateProductDto {
  @ApiProperty({ description: 'Nombre del producto' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Código de barras del producto' })
  @IsString()
  barcode: string;

  // Categoría es free-text matching Category.name. Antes era enum cerrado.
  @ApiProperty({ description: 'Categoría del producto' })
  @IsString()
  category: string;

  @ApiProperty({ description: 'Precio de venta' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ description: 'Precio de costo (opcional para servicios)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ description: 'Stock disponible (no aplica a servicios ni señas)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ enum: UnitOfMeasure, description: 'Unidad de medida' })
  @IsOptional()
  @IsEnum(UnitOfMeasure)
  unitOfMeasure?: UnitOfMeasure;

  @ApiPropertyOptional({ description: 'URL de la imagen del producto' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ description: 'Descripción del producto' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Margen de ganancia' })
  @IsOptional()
  @IsNumber()
  profitMargin?: number;

  @ApiPropertyOptional({ description: 'Producto especial', default: false })
  @IsOptional()
  @IsBoolean()
  specialProduct?: boolean;

  @ApiPropertyOptional({ enum: ProductKind, description: 'Tipo: STANDARD | SERVICE | PREPAID' })
  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'Nombre del producto' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Código de barras del producto' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ description: 'Categoría del producto' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Precio de venta' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Precio de costo' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ description: 'Stock disponible' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ enum: UnitOfMeasure, description: 'Unidad de medida' })
  @IsOptional()
  @IsEnum(UnitOfMeasure)
  unitOfMeasure?: UnitOfMeasure;

  @ApiPropertyOptional({ description: 'URL de la imagen del producto' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ description: 'Descripción del producto' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Margen de ganancia' })
  @IsOptional()
  @IsNumber()
  profitMargin?: number;

  @ApiPropertyOptional({ description: 'Producto especial' })
  @IsOptional()
  @IsBoolean()
  specialProduct?: boolean;

  @ApiPropertyOptional({ enum: ProductKind, description: 'Tipo: STANDARD | SERVICE | PREPAID' })
  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;
}

/**
 * Item del bulk-update: identifica el producto por su barcode (no por id)
 * y aplica los campos enviados. Sólo `barcode` es obligatorio; el resto es
 * parcial (campos no enviados quedan sin cambios).
 */
export class BulkUpdateProductItemDto {
  @ApiProperty({ description: 'Código de barras (clave de match)' })
  @IsString()
  @IsNotEmpty()
  barcode: string;

  @ApiProperty({
    description: 'Campos a actualizar (formato igual a UpdateProductDto)',
    type: () => UpdateProductDto,
  })
  @ValidateNested()
  @Type(() => UpdateProductDto)
  fields: UpdateProductDto;
}

export class BulkUpdateProductsDto {
  @ApiProperty({ type: [BulkUpdateProductItemDto], description: 'Filas a actualizar' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateProductItemDto)
  items: BulkUpdateProductItemDto[];
}
