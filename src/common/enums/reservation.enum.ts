// Estados del turno de una experiencia (la instancia con fecha/hora).
// DRAFT: creado pero no publicado (no acepta reservas).
// OPEN: publicado, acepta reservas mientras haya cupo.
// CLOSED: cerrado manualmente (no acepta más reservas), las existentes siguen.
// CANCELLED: turno cancelado (se da de baja).
export enum SessionStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

// Ciclo de vida de una reserva.
// PENDING: hold creado, cupo descontado, esperando pago (vence en `expiresAt`).
// CONFIRMED: pago aprobado (o creada por admin como confirmada). Cupo firme.
// EXPIRED: el hold venció sin pago. Cupo devuelto.
// CANCELLED: cancelada por cliente o admin. Cupo devuelto.
// NEEDS_REVIEW: el pago llegó tarde (post-expiración) y no se pudo re-tomar
//   cupo. Requiere acción manual (reembolso ya disparado o a confirmar).
export enum ReservationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
}

// Origen de la reserva.
export enum ReservationSource {
  PUBLIC = 'PUBLIC', // landing pública, paga con MercadoPago
  ADMIN = 'ADMIN', // creada desde el panel de administración
}

// Método de pago de la reserva.
// MERCADOPAGO: flujo público con preference + webhook.
// CASH / TRANSFER / CARD: cobrado por el admin (impacta caja).
// COURTESY: cortesía / invitación, sin cobro (no impacta caja).
export enum ReservationPaymentMethod {
  MERCADOPAGO = 'MERCADOPAGO',
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
  CARD = 'CARD',
  COURTESY = 'COURTESY',
}
