import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';

/** Cuántos días para atrás o para adelante se acepta fechar un egreso. */
export const EXPENSE_DATE_MAX_DAYS = 366;

/**
 * Dónde va un egreso según el día elegido:
 *  - `cashbox`: a la caja abierta, como siempre (createdAt = ahora, entra al
 *    arqueo si es efectivo del cajón).
 *  - `dated`: registro con fecha propia, sin caja. Cuenta en Finanzas y en el
 *    cierre del mes de ESE día, pero no cambia el arqueo de ninguna caja.
 *    Caso real: un gasto del mes pasado que se olvidaron de cargar, o uno que
 *    ya saben que corresponde al mes que viene.
 */
export type ExpenseDatePlan =
  | { kind: 'cashbox' }
  | { kind: 'dated'; occurredAt: Date };

/**
 * @param date día del gasto `YYYY-MM-DD` (hora del negocio) o undefined.
 * @param hasOpenSession si hay caja abierta ahora.
 */
export function planExpenseDate(
  date: string | undefined,
  now: Date,
  hasOpenSession: boolean,
  timezone: string,
): ExpenseDatePlan {
  // Sin fecha: comportamiento de siempre (si no hay caja, el servicio avisa).
  if (!date) return { kind: 'cashbox' };

  const day = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? DateTime.fromISO(date, { zone: timezone })
    : null;
  if (!day || !day.isValid) {
    throw new BadRequestException('La fecha del egreso no es válida.');
  }

  const today = DateTime.fromJSDate(now).setZone(timezone).startOf('day');
  const diffDays = Math.abs(day.startOf('day').diff(today, 'days').days);
  if (diffDays > EXPENSE_DATE_MAX_DAYS) {
    throw new BadRequestException(
      'La fecha está muy lejos: elegí un día dentro del último año o del próximo.',
    );
  }

  if (day.hasSame(today, 'day')) {
    if (hasOpenSession) return { kind: 'cashbox' };
    // Hoy sin caja abierta: se registra ahora mismo, fuera de cualquier caja
    // (ya cerró la de hoy o todavía no abrió).
    return { kind: 'dated', occurredAt: now };
  }

  // Otro día: al mediodía, así el día no se corre al mostrarlo en ninguna zona.
  return {
    kind: 'dated',
    occurredAt: day.set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toJSDate(),
  };
}
