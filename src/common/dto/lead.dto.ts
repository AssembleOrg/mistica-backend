import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { LeadSource, LeadStatus } from '../enums/lead.enum';

export class CreateLeadDto {
  @ApiProperty({ description: 'Servicio/experiencia consultada' })
  @IsString()
  @MaxLength(160)
  service: string;

  @ApiPropertyOptional({ description: 'Experience del catálogo (si aplica)' })
  @IsOptional()
  @IsMongoId()
  experienceId?: string;

  @ApiPropertyOptional({ description: 'Fecha tentativa (texto libre)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  preferredDate?: string;

  @ApiPropertyOptional({ description: 'Cantidad de personas', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiProperty({ description: 'Nombre del cliente' })
  @IsString()
  @MaxLength(120)
  customerName: string;

  @ApiPropertyOptional({ description: 'Email del cliente' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  customerEmail?: string;

  @ApiPropertyOptional({ description: 'Teléfono / WhatsApp' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @ApiPropertyOptional({ enum: LeadSource, default: LeadSource.WHATSAPP })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional({ description: 'Notas' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/**
 * Comprobante de transferencia recibido por WhatsApp SIN reserva (hold) que lo
 * espere. Lo manda el bot (X-Bot-Secret) con lo extraído por visión: el backend
 * matchea el monto contra las últimas reservas del teléfono, guarda la imagen
 * en Spaces y registra la consulta para verificación humana.
 */
export class OrphanReceiptDto {
  @ApiProperty({ description: 'Teléfono verificado del WhatsApp que lo envió' })
  @IsString()
  @MaxLength(40)
  phone: string;

  @ApiProperty({
    description: 'Si el destinatario del comprobante coincide con la cuenta de Mística (lo valida el bot contra su config)',
  })
  @IsBoolean()
  destinatarioOk: boolean;

  @ApiPropertyOptional({ description: 'Monto leído del comprobante' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountDetected?: number;

  @ApiPropertyOptional({ description: 'Número de operación leído' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  operationNumber?: string;

  @ApiPropertyOptional({ description: 'Fecha leída del comprobante (texto)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  receiptDate?: string;

  @ApiProperty({ description: 'Imagen del comprobante en base64' })
  @IsString()
  imageBase64: string;

  @ApiPropertyOptional({ description: 'MIME de la imagen', default: 'image/jpeg' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  imageMime?: string;

  @ApiPropertyOptional({ description: 'Detalle extra del bot' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class UpdateLeadDto extends PartialType(CreateLeadDto) {
  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;
}

export class ListLeadsQueryDto {
  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
