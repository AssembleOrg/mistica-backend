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

/**
 * Un turno de la charla del bot: lo que escribió el cliente y lo que respondió
 * el bot. El bot lo manda después de cada respuesta para que toda la consulta
 * quede persistida en la bandeja (constancia), sin pausar al bot.
 */
export class LogTurnDto {
  @ApiProperty({ description: 'Teléfono del cliente' })
  @IsString()
  @MaxLength(40)
  phone: string;

  @ApiPropertyOptional({ description: 'Nombre, si lo tenemos' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiProperty({ description: 'Lo que escribió el cliente en este turno' })
  @IsString()
  @MaxLength(4000)
  userText: string;

  @ApiPropertyOptional({
    description: 'Lo que respondió el bot (si respondió)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  botText?: string;

  @ApiPropertyOptional({
    description:
      'Tema detectado de la consulta (reemplaza el lead): "Cumpleaños", "Reserva"…',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  intent?: string;

  @ApiPropertyOptional({
    description: 'Etiquetas para filtrar la bandeja',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  tags?: string[];
}

/**
 * Un adjunto (imagen o documento) que mandó el cliente por WhatsApp. Lo sube el
 * bot para que quede en la charla. La imagen/archivo va a Spaces privado; el
 * panel lo ve con URL firmada de corta vida.
 */
export class AttachMediaDto {
  @ApiProperty({ description: 'Teléfono del cliente' })
  @IsString()
  @MaxLength(40)
  phone: string;

  @ApiPropertyOptional({ description: 'Nombre, si lo tenemos' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiProperty({ enum: ['image', 'document'], description: 'Tipo de adjunto' })
  @IsIn(['image', 'document'])
  kind: 'image' | 'document';

  @ApiProperty({
    description: 'Content-Type del archivo (ej. image/jpeg, application/pdf)',
  })
  @IsString()
  @MaxLength(120)
  mime: string;

  @ApiPropertyOptional({
    description: 'Nombre original del archivo (documentos)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Texto que acompaña al adjunto (caption)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  caption?: string;

  @ApiProperty({
    description: 'Contenido del archivo en base64 (sin prefijo data:)',
  })
  @IsString()
  @MaxLength(28_000_000) // ~20 MB de binario
  dataBase64: string;

  @ApiPropertyOptional({ description: 'Tema detectado (ej. "Comprobante")' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  intent?: string;

  @ApiPropertyOptional({
    description: 'Etiquetas para la bandeja',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  tags?: string[];
}
