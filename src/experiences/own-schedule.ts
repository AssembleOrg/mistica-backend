import { DateTime } from 'luxon';
import { envConfig } from '../config/env.config';
import { businessWindow, fmtMinutes, toMinutes } from '../tables/shifts';

/**
 * HORARIO PROPIO de una experiencia (Experience.ownSchedule): días y horas en
 * los que se ofrece, en lugar de los turnos generales del salón. Lo usan la
 * disponibilidad (qué se ofrece) y la reserva (en un horario propio la
 * capacidad es el cupo, no las mesas).
 */
export interface OwnSlotLike {
  /** Día ISO (1=lunes … 7=domingo). */
  weekday: number;
  /** Hora local de inicio 'HH:mm'. */
  start: string;
}

const DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** ¿La experiencia tiene horario propio? */
export function hasOwnSchedule(schedule?: OwnSlotLike[] | null): boolean {
  return !!schedule && schedule.length > 0;
}

/** Horas de inicio propias que aplican a una fecha de negocio ('YYYY-MM-DD'). */
export function ownStartsFor(
  schedule: OwnSlotLike[] | null | undefined,
  dateKey: string,
): string[] {
  if (!hasOwnSchedule(schedule)) return [];
  const wd = DateTime.fromISO(dateKey).weekday;
  const starts = new Set(
    (schedule as OwnSlotLike[]).filter((s) => s.weekday === wd).map((s) => s.start),
  );
  return [...starts].sort((a, b) => toMinutes(a) - toMinutes(b));
}

/** ¿`startAt` cae justo en un horario propio de la experiencia? */
export function isOwnSlot(
  schedule: OwnSlotLike[] | null | undefined,
  startAt: Date,
  tz = envConfig.timezone,
): boolean {
  if (!hasOwnSchedule(schedule)) return false;
  const local = DateTime.fromJSDate(startAt).setZone(tz);
  const hhmm = local.toFormat('HH:mm');
  return (schedule as OwnSlotLike[]).some(
    (s) => s.weekday === local.weekday && s.start === hhmm,
  );
}

/**
 * Mensaje de error si algún horario propio no entra en la ventana del salón
 * con la duración de la experiencia (así no queda un horario que nunca se
 * ofrece sin que nadie se entere). null = todo bien.
 */
export function ownScheduleError(
  schedule: OwnSlotLike[] | null | undefined,
  durationMinutes: number,
): string | null {
  if (!hasOwnSchedule(schedule)) return null;
  const { openMin, closeMin } = businessWindow();
  for (const s of schedule as OwnSlotLike[]) {
    const start = toMinutes(s.start);
    if (start < openMin || start + durationMinutes > closeMin) {
      return (
        `El horario propio del ${DIAS[s.weekday] ?? s.weekday} a las ${s.start} no entra ` +
        `en el horario del salón (${fmtMinutes(openMin)} a ${fmtMinutes(closeMin)}) ` +
        `con una duración de ${durationMinutes} min.`
      );
    }
  }
  return null;
}
