import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ReservationPaymentMethod,
  ReservationStatus,
} from '../enums/reservation.enum';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Días y turnos donde se puede reservar una experiencia. */
export class AvailabilityQueryDto {
  @ApiProperty({ description: 'Experiencia a consultar' })
  @IsMongoId()
  experienceId: string;

  @ApiPropertyOptional({ description: 'Desde, YYYY-MM-DD (default: hoy)' })
  @IsOptional()
  @Matches(YMD, { message: 'from debe ser YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ description: 'Hasta, YYYY-MM-DD' })
  @IsOptional()
  @Matches(YMD, { message: 'to debe ser YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({
    description: 'Cuántos días mirar desde `from` si no se manda `to`.',
    default: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number;

  @ApiPropertyOptional({
    description: 'Incluir los turnos sin lugar (para mostrarlos agotados).',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeFull?: boolean;
}

/**
 * Consulta de disponibilidad de MESAS de un turno para un grupo. No reserva:
 * la usa el bot para saber si puede ofrecer el turno, y si la única opción es
 * la mesa grande compartida (que requiere preguntarle al cliente).
 */
export class PreviewTablesDto {
  @ApiPropertyOptional({
    description:
      'ID del turno ya existente. Alternativa a experienceId + date + shiftKey.',
  })
  @IsOptional()
  @IsMongoId()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Experiencia a reservar' })
  @IsOptional()
  @IsMongoId()
  experienceId?: string;

  @ApiPropertyOptional({ description: 'Día, YYYY-MM-DD (hora de Argentina)' })
  @IsOptional()
  @Matches(YMD, { message: 'date debe ser YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ description: "Turno del día ('T1', 'T2')" })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  shiftKey?: string;

  @ApiProperty({ description: 'Cantidad de personas', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({
    description: 'El cliente ya aceptó compartir mesa grande.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  acceptSharedTable?: boolean;
}

/**
 * Hold público: crea una reserva PENDING que descuenta cupo y arranca el flujo
 * de pago con MercadoPago. `idempotencyKey` (UUID generado por el front) evita
 * doble consumo de cupo ante doble-click / reintentos.
 */
export class CreateHoldDto {
  // Dos formas de indicar QUÉ se reserva:
  //  · el trío (experienceId + date + shiftKey) — el turno se crea solo si hace
  //    falta. Es el camino normal: el equipo ya no carga turnos a mano.
  //  · `sessionId`, para un turno puntual que el admin creó a mano.
  @ApiPropertyOptional({ description: 'ID de un turno ya existente' })
  @IsOptional()
  @IsMongoId()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Experiencia a reservar' })
  @IsOptional()
  @IsMongoId()
  experienceId?: string;

  @ApiPropertyOptional({ description: 'Día, YYYY-MM-DD (hora de Argentina)' })
  @IsOptional()
  @Matches(YMD, { message: 'date debe ser YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ description: "Turno del día ('T1', 'T2')" })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  shiftKey?: string;

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

  // No hay `paymentMethod`: el hold público es SIEMPRE por transferencia con
  // comprobante. MercadoPago quedó fuera del flujo del cliente.

  @ApiPropertyOptional({
    description:
      'El cliente aceptó expresamente compartir una mesa grande con otro ' +
      'grupo. Sin esto, cuando la única opción es la mesa compartida la ' +
      'reserva se rechaza para que el bot/front pregunte primero.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  acceptSharedTable?: boolean;
}

/**
 * Resolución del comprobante de transferencia de un hold TRANSFER (interno del
 * bot). approved=true confirma la reserva; false la manda a revisión del admin.
 */
export class TransferProofDto {
  @ApiProperty({
    description: '¿El comprobante validó contra los datos esperados?',
  })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional({
    description:
      'Resumen/razón de la detección (queda en las notas para auditoría).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  note?: string;

  @ApiPropertyOptional({ description: 'Monto detectado en el comprobante.' })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  amountDetected?: number;
}

/**
 * Reserva creada desde el panel admin. Nace CONFIRMED (descuenta cupo igual,
 * atómico). Si el método no es COURTESY, impacta caja con un ingreso.
 */
export class AdminCreateReservationDto {
  // Igual que el hold público: o un turno existente, o el trío
  // (experiencia, día, bloque) y el turno se crea solo.
  @ApiPropertyOptional({ description: 'ID de un turno ya existente' })
  @IsOptional()
  @IsMongoId()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Experiencia a reservar' })
  @IsOptional()
  @IsMongoId()
  experienceId?: string;

  @ApiPropertyOptional({ description: 'Día, YYYY-MM-DD (hora de Argentina)' })
  @IsOptional()
  @Matches(YMD, { message: 'date debe ser YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ description: "Turno del día ('T1', 'T2')" })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  shiftKey?: string;

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

/**
 * Reprogramación de una reserva a otro turno. Política: se acepta hasta
 * 48 h antes del turno original; `force` permite al admin saltear esa regla.
 */
export class AdminRescheduleReservationDto {
  // Turno destino: existente, o (experiencia, día, bloque).
  @ApiPropertyOptional({ description: 'ID de un turno ya existente' })
  @IsOptional()
  @IsMongoId()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Experiencia a reservar' })
  @IsOptional()
  @IsMongoId()
  experienceId?: string;

  @ApiPropertyOptional({ description: 'Día, YYYY-MM-DD (hora de Argentina)' })
  @IsOptional()
  @Matches(YMD, { message: 'date debe ser YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ description: "Turno del día ('T1', 'T2')" })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  shiftKey?: string;

  @ApiPropertyOptional({
    description: 'Saltear la regla de 48 h antes del turno (override admin).',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class AdminUpdateReservationDto {
  @ApiPropertyOptional({ description: 'Nombre del cliente' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

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

  @ApiPropertyOptional({ description: 'Notas internas' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ResolveReviewDto {
  @ApiProperty({
    description: 'confirm = re-tomar cupo y confirmar; cancel = cancelar',
    enum: ['confirm', 'cancel'],
  })
  @IsIn(['confirm', 'cancel'])
  action: 'confirm' | 'cancel';
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

  @ApiPropertyOptional({ description: 'Busca por código, nombre o teléfono' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}
