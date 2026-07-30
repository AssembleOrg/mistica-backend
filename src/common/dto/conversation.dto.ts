import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Un mensaje del tramo que la persona venía hablando con el bot. */
export class HandoffHistoryItemDto {
  @ApiProperty({ enum: ['CLIENT', 'BOT'] })
  @IsIn(['CLIENT', 'BOT'])
  author: 'CLIENT' | 'BOT';

  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  body: string;
}

/** El cliente pidió hablar con una persona del equipo. */
export class HandoffRequestDto {
  @ApiProperty({ description: 'Teléfono del cliente' })
  @IsString()
  @MaxLength(40)
  phone: string;

  @ApiPropertyOptional({ description: 'Nombre, si lo tenemos' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional({ description: 'Por qué pidió hablar con alguien' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Tramo reciente de la charla con el bot, para que quien atienda tenga contexto.',
    type: [HandoffHistoryItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HandoffHistoryItemDto)
  history?: HandoffHistoryItemDto[];
}

/** Mensaje del cliente mientras la charla la atiende una persona. */
export class InboundMessageDto {
  @ApiProperty({ description: 'Teléfono del cliente' })
  @IsString()
  @MaxLength(40)
  phone: string;

  @ApiProperty({ description: 'Texto del mensaje' })
  @IsString()
  @MaxLength(4000)
  body: string;
}

/** Respuesta del equipo, que sale al cliente por WhatsApp. */
export class AdminReplyDto {
  @ApiProperty({ description: 'Texto a enviar' })
  @IsString()
  @MaxLength(4000)
  body: string;
}
