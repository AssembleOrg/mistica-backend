import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ReservationPaymentMethod,
  ReservationStatus,
} from '../enums/reservation.enum';

/**
 * Hold público: crea una reserva PENDING que descuenta cupo y arranca el flujo
 * de pago con MercadoPago. `idempotencyKey` (UUID generado por el front) evita
 * doble consumo de cupo ante doble-click / reintentos.
 */
export class CreateHoldDto {
  @ApiProperty({ description: 'ID del turno (ExperienceSession)' })
  @IsMongoId()
  sessionId: string;

  @ApiProperty({ description: 'Cantidad de personas', minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Nombre y apellido del cliente' })
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

  @ApiProperty({ description: 'Clave de idempotencia (UUID del front)' })
  @IsString()
  @MaxLength(100)
  idempotencyKey: string;
}

/**
 * Reserva creada desde el panel admin. Nace CONFIRMED (descuenta cupo igual,
 * atómico). Si el método no es COURTESY, impacta caja con un ingreso.
 */
export class AdminCreateReservationDto {
  @ApiProperty({ description: 'ID del turno (ExperienceSession)' })
  @IsMongoId()
  sessionId: string;

  @ApiProperty({ description: 'Cantidad de personas', minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Nombre y apellido del cliente' })
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

  @ApiPropertyOptional({ description: 'Vincular a un Client existente' })
  @IsOptional()
  @IsMongoId()
  clientId?: string;

  @ApiProperty({
    description: 'Método de cobro. COURTESY = sin cargo (no impacta caja).',
    enum: ReservationPaymentMethod,
  })
  @IsEnum(ReservationPaymentMethod)
  paymentMethod: ReservationPaymentMethod;

  @ApiPropertyOptional({
    description: 'Importe total cobrado (default = price*quantity del turno).',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: 'Notas internas' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListReservationsQueryDto {
  @ApiPropertyOptional({ enum: ReservationStatus })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @ApiPropertyOptional({ description: 'Filtrar por turno' })
  @IsOptional()
  @IsMongoId()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por experiencia' })
  @IsOptional()
  @IsMongoId()
  experienceId?: string;

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
