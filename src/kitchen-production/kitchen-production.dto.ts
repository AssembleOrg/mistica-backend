import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class CreateKitchenProductionDto {
  @ApiProperty({ description: 'Día (YYYY-MM-DD, hora de Argentina)' })
  @Matches(YMD, { message: 'El día tiene que ser AAAA-MM-DD' })
  day: string;

  @ApiProperty({ description: 'Qué se produjo (torta de chocolate, cookies…)' })
  @IsString()
  @IsNotEmpty({ message: 'Poné qué se preparó' })
  @MaxLength(120)
  item: string;

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad tiene que ser un número' })
  @Min(0, { message: 'La cantidad no puede ser negativa' })
  quantity: number;

  @ApiPropertyOptional({ description: 'u., kg, porciones…' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @ApiPropertyOptional({ description: 'Reserva para la que se preparó' })
  @IsOptional()
  @IsMongoId()
  reservationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ApiPropertyOptional({ description: 'Quién lo hizo (cuentas compartidas)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  registeredBy?: string;
}

/** Editar: todo opcional; reservationId '' la desvincula. */
export class UpdateKitchenProductionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(YMD, { message: 'El día tiene que ser AAAA-MM-DD' })
  day?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  item?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad tiene que ser un número' })
  @Min(0, { message: 'La cantidad no puede ser negativa' })
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @ApiPropertyOptional({ description: "'' quita la reserva" })
  @IsOptional()
  @Matches(/^([a-f\d]{24})?$/i, { message: 'Reserva inválida' })
  reservationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  registeredBy?: string;
}

export class ListKitchenProductionDto {
  @ApiProperty({ description: 'Desde (YYYY-MM-DD)' })
  @Matches(YMD)
  from: string;

  @ApiProperty({ description: 'Hasta inclusive (YYYY-MM-DD)' })
  @Matches(YMD)
  to: string;

  @ApiPropertyOptional({ description: 'Sólo lo de una reserva' })
  @IsOptional()
  @IsMongoId()
  reservationId?: string;
}
