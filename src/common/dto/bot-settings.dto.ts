import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BotBusinessDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  maps?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  hours?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  instagram?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  facebook?: string;
}

export class BotTransferDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  alias?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ownerCuit?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bank?: string;
}

const TEXT = 2000;

export class BotTextsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  greeting?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  farewell?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  error?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  audioFail?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  rateLimit?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  safeFallback?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  jailbreakRefusal?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  transferNotReceipt?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  transferReview?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  transferOrphan?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  transferExpired?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  botOff?: string;
}

export class UpdateBotSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() botActive?: boolean;

  @ApiPropertyOptional({ type: BotBusinessDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BotBusinessDto)
  business?: BotBusinessDto;

  @ApiPropertyOptional({ type: BotTransferDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BotTransferDto)
  transfer?: BotTransferDto;

  @ApiPropertyOptional({ type: BotTextsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BotTextsDto)
  texts?: BotTextsDto;
}

export class CreateBotFaqDto {
  @ApiProperty({ description: 'Tema / pregunta en una línea' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ type: [String], description: 'Cómo lo preguntan' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  examples?: string[];

  @ApiProperty({ description: 'Respuesta / política' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  answer: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateBotFaqDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  examples?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  answer?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;
}

export class BotTryDto {
  @ApiProperty({ description: 'Mensaje del cliente a probar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({
    description: 'Turnos previos de la charla de prueba [{role, content}]',
  })
  @IsOptional()
  @IsArray()
  history?: { role: 'user' | 'assistant'; content: string }[];
}
