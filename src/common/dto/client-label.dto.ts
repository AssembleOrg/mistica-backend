import { IsOptional, IsString, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClientLabelDto {
  @ApiProperty({ description: 'Nombre de la etiqueta' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional({ description: 'Color hex, ej: #9d684e' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;
}

export class UpdateClientLabelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;
}
