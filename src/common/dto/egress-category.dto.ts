import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateEgressCategoryDto {
  @ApiProperty({ description: "Nombre ('Sueldos', 'Servicios', 'Impuestos'…)" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({ description: 'Color hex (#RRGGBB) para el chip' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color debe ser #RRGGBB' })
  color?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEgressCategoryDto extends PartialType(
  CreateEgressCategoryDto,
) {}
