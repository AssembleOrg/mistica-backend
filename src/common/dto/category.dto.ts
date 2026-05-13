import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ description: 'Nombre de la categoría' })
  @IsString()
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({ description: 'Descripción breve' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ description: 'Color hex para el badge (#9d684e)' })
  @IsOptional()
  @IsString()
  @MaxLength(9)
  color?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ description: 'Nombre de la categoría' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ description: 'Descripción breve' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ description: 'Color hex para el badge' })
  @IsOptional()
  @IsString()
  @MaxLength(9)
  color?: string;
}
