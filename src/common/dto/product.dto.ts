import { IsString, IsEnum, IsOptional, IsNumber, IsUrl, Min, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductCategory, ProductStatus, UnitOfMeasure } from '../enums';

export class CreateProductDto {
  @ApiProperty({ description: 'Nombre del producto' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Código de barras del producto' })
  @IsString()
  barcode: string;

  @ApiProperty({ enum: ProductCategory, description: 'Categoría del producto' })
  @IsEnum(ProductCategory)
  category: ProductCategory;

  @ApiProperty({ description: 'Precio de venta' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ description: 'Precio de costo' })
  @IsNumber()
  @Min(0)
  costPrice: number;

  @ApiProperty({ description: 'Stock disponible' })
  @IsNumber()
  @Min(0)
  stock: number;

  @ApiProperty({ enum: UnitOfMeasure, description: 'Unidad de medida' })
  @IsEnum(UnitOfMeasure)
  unitOfMeasure: UnitOfMeasure;

  @ApiProperty({ description: 'URL de la imagen del producto' })
  @IsUrl()
  image: string;

  @ApiProperty({ description: 'Descripción del producto' })
  @IsString()
  description: string;

  @ApiProperty({ enum: ProductStatus, description: 'Estado del producto' })
  @IsEnum(ProductStatus)
  status: ProductStatus;

  @ApiPropertyOptional({ description: 'Margen de ganancia' })
  @IsOptional()
  @IsNumber()
  profitMargin?: number;

  @ApiPropertyOptional({ description: 'Producto especial', default: false })
  @IsOptional()
  @IsBoolean()
  specialProduct?: boolean;
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

  @ApiPropertyOptional({ enum: ProductCategory, description: 'Categoría del producto' })
  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

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
  @IsUrl()
  image?: string;

  @ApiPropertyOptional({ description: 'Descripción del producto' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ProductStatus, description: 'Estado del producto' })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ description: 'Margen de ganancia' })
  @IsOptional()
  @IsNumber()
  profitMargin?: number;

  @ApiPropertyOptional({ description: 'Producto especial' })
  @IsOptional()
  @IsBoolean()
  specialProduct?: boolean;
} 