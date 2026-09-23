import { DateTime } from 'luxon';
import { envConfig } from '../config/env.config';

/**
 * Turnos SUGERIDOS del día + ventana horaria del negocio.
 *
 * Los turnos dejaron de ser bloques rígidos: una reserva puede arrancar a
 * CUALQUIER hora, con dos únicas restricciones duras:
 *   · no empieza antes de la apertura (BUSINESS_OPEN, default 15:00)
 *   · no termina después del cierre (BUSINESS_CLOSE, default 20:00)
 *
 * Los turnos quedan como sugerencia de horario (la landing y el bot los
 * ofrecen primero, y el bot recomienda —una sola vez— el inicio del turno
 * cercano), pero nunca bloquean un horario válido.
 *
 * La limpieza ya no es un hueco entre turnos: cada reserva deja su mesa
 * ocupada hasta endAt + CLEANING_BUFFER_MINUTES (ver tables.service).
 */
export interface ShiftDef {
  /** Clave corta y estable ('T1'). */
  key: string;
  /** Nombre para mostrar ('Turno 1'). */
  name: string;
  /** Hora local de inicio, 'HH:mm'. */
  start: string;
  /** Hora local de fin, 'HH:mm'. */
  end: string;
  /**
   * Día ISO (1=lunes … 7=domingo) al que aplica. Sin valor = todos los días.
   * Permite tener horarios distintos según el día sin tocar código.
   */
  weekday?: number;
  /**
   * Experiencias sugeridas para este turno. Vacío = todas las reservables
   * online. Es informativo: no restringe qué se puede reservar.
   */
  experienceIds?: string[];
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** 'HH:mm' → minutos desde medianoche. Lanza si el formato es inválido. */
export function toMinutes(hhmm: string): number {
  const m = HHMM.exec(hhmm);
  if (!m) throw new Error(`Hora inválida: "${hhmm}" (se espera HH:mm)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutos desde medianoche → 'HH:mm'. */
export function fmtMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/**
 * Parsea la definición de turnos sugeridos de env y valida el conjunto:
 * horas válidas, duración positiva, claves únicas y sin solaparse entre sí.
 * (Ya no se exige hueco de limpieza entre turnos: la limpieza es por reserva.)
 */
export function parseShifts(raw: string): ShiftDef[] {
  const shifts = raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => {
      const parts = chunk.split('|').map((p) => p.trim());
      if (parts.length !== 4) {
        throw new Error(
          `Turno inválido en SHIFTS: "${chunk}" (se espera KEY|Nombre|HH:mm|HH:mm)`,
        );
      }
      const [key, name, start, end] = parts;
      if (!key) throw new Error('Turno sin clave en SHIFTS');
      if (toMinutes(end) <= toMinutes(start)) {
        throw new Error(
          `El turno ${key} termina antes de empezar (${start}–${end})`,
        );
      }
      return { key, name, start, end };
    });

  if (!shifts.length) throw new Error('SHIFTS no define ningún turno');

  const keys = new Set<string>();
  for (const s of shifts) {
    if (keys.has(s.key)) throw new Error(`Clave de turno repetida: ${s.key}`);
    keys.add(s.key);
  }

  for (let i = 1; i < shifts.length; i++) {
    const prev = shifts[i - 1];
    const cur = shifts[i];
    if (toMinutes(cur.start) < toMinutes(prev.end)) {
      throw new Error(
        `Los turnos ${prev.key} y ${cur.key} se solapan (${prev.end} > ${cur.start})`,
      );
    }
  }
  return shifts;
}

let cached: ShiftDef[] | null = null;

/**
 * De dónde salen los turnos sugeridos de una fecha. Por defecto, de la env
 * `SHIFTS`. `ShiftsService` lo reemplaza al arrancar por las plantillas de la
 * base, para que se puedan editar desde el panel sin redeployar.
 */
type ShiftProvider = (dateKey: string) => ShiftDef[];

let provider: ShiftProvider | null = null;

/** Instala el origen de turnos (lo hace ShiftsService al iniciar y al editar). */
export function setShiftProvider(fn: ShiftProvider | null): void {
  provider = fn;
  cached = null;
}

function fromEnv(): ShiftDef[] {
  if (!cached) {
    cached = parseShifts(envConfig.shifts);
  }
  return cached;
}

/**
 * Turnos sugeridos que aplican a una fecha. Sin `dateKey` devuelve los turnos
 * "base" (los que valen todos los días), para mensajes genéricos.
 */
export function listShifts(dateKey?: string): ShiftDef[] {
  if (!provider) return fromEnv();
  return provider(dateKey ?? '');
}

/** Sólo para tests: vuelve al origen por env y limpia el cache. */
export function resetShiftsCache(): void {
  cached = null;
  provider = null;
}

/** Día ISO (1=lunes … 7=domingo) de una fecha de negocio 'YYYY-MM-DD'. */
export function weekdayOf(dateKey: string): number {
  return DateTime.fromISO(dateKey).weekday;
}

/** Filtra las plantillas que aplican a una fecha (por día de la semana). */
export function shiftsForDate(all: ShiftDef[], dateKey: string): ShiftDef[] {
  if (!dateKey) return all.filter((s) => s.weekday == null);
  const wd = weekdayOf(dateKey);
  // Si hay plantillas específicas para ese día, mandan sobre las genéricas.
  const specific = all.filter((s) => s.weekday === wd);
  if (specific.length) return specific;
  return all.filter((s) => s.weekday == null);
}

/** Fecha de negocio ('YYYY-MM-DD' en la zona del local) de un instante. */
export function businessDateKey(at: Date, tz = envConfig.timezone): string {
  return DateTime.fromJSDate(at).setZone(tz).toISODate() as string;
}

// ───────────────────── Ventana horaria del negocio ─────────────────────

/** Apertura y cierre de reservas, en minutos desde medianoche (hora local). */
export function businessWindow(): { openMin: number; closeMin: number } {
  return {
    openMin: toMinutes(envConfig.businessOpen),
    closeMin: toMinutes(envConfig.businessClose),
  };
}

/** Límites absolutos de la ventana de reservas de una fecha de negocio. */
export function businessBounds(
  dateKey: string,
  tz = envConfig.timezone,
): { open: Date; close: Date } {
  const open = DateTime.fromISO(`${dateKey}T${envConfig.businessOpen}`, {
    zone: tz,
  });
  const close = DateTime.fromISO(`${dateKey}T${envConfig.businessClose}`, {
    zone: tz,
  });
  return { open: open.toJSDate(), close: close.toJSDate() };
}

export type WindowFailure =
  /** Empieza antes de la apertura. */
  | 'BEFORE_OPEN'
  /** Termina después del cierre. */
  | 'AFTER_CLOSE'
  /** La actividad dura más que toda la ventana del día. */
  | 'TOO_LONG';

/**
 * ¿Una actividad que arranca en `startAt` y dura `durationMinutes` entra en la
 * ventana del negocio? Única restricción dura de horarios del salón.
 */
export function checkBookingWindow(
  startAt: Date,
  durationMinutes: number,
  tz = envConfig.timezone,
): { ok: true; dateKey: string } | { ok: false; reason: WindowFailure } {
  const { openMin, closeMin } = businessWindow();
  const startLocal = DateTime.fromJSDate(startAt).setZone(tz);
  const startMin = startLocal.hour * 60 + startLocal.minute;
  const endMin = startMin + durationMinutes;

  if (durationMinutes > closeMin - openMin) {
    return { ok: false, reason: 'TOO_LONG' };
  }
  if (startMin < openMin) return { ok: false, reason: 'BEFORE_OPEN' };
  if (endMin > closeMin) return { ok: false, reason: 'AFTER_CLOSE' };
  return { ok: true, dateKey: startLocal.toISODate() as string };
}

/**
 * Rango de horas de inicio válidas para una actividad de `durationMinutes` en
 * la ventana del negocio: desde la apertura hasta la última hora que permite
 * terminar antes del cierre. Devuelve null si no entra ni empezando al abrir.
 */
export function bookingStartWindow(
  durationMinutes: number,
): { earliest: string; latest: string } | null {
  const { openMin, closeMin } = businessWindow();
  const latestMin = closeMin - durationMinutes;
  if (latestMin < openMin) return null;
  return { earliest: fmtMinutes(openMin), latest: fmtMinutes(latestMin) };
}

// ───────────────────── Turnos como sugerencia ─────────────────────

/**
 * Inicio ANTICIPADO de un turno: la hora en que termina el turno anterior del
 * mismo día, o null si es el primero o no hay hueco entre ambos.
 *
 * El hueco entre dos turnos es la limpieza de las mesas usadas en el anterior
 * (ej. Turno 1 hasta 17:30, Turno 2 desde 17:40). Las mesas que NO se usaron
 * no necesitan limpieza, así que un grupo que entra en ellas puede arrancar el
 * turno apenas termina el anterior (17:30). Si hay lugar de verdad lo deciden
 * las mesas: una mesa usada queda ocupada hasta su fin + la limpieza.
 */
export function earlyStartOf(
  shift: ShiftDef,
  dayShifts: ShiftDef[],
): string | null {
  const sorted = [...dayShifts].sort(
    (a, b) => toMinutes(a.start) - toMinutes(b.start),
  );
  const idx = sorted.findIndex((s) => s.key === shift.key);
  if (idx <= 0) return null;
  const prev = sorted[idx - 1];
  return toMinutes(prev.end) < toMinutes(shift.start) ? prev.end : null;
}

/**
 * Turno sugerido en el que cae (entera) una actividad, si cae en alguno. Una
 * actividad que arranca en el inicio anticipado de un turno (ver
 * earlyStartOf) cuenta como de ese turno. Es sólo una ETIQUETA para la agenda
 * y los mensajes: que no caiga en ninguno no invalida el horario.
 */
export function suggestedShiftFor(
  startAt: Date,
  durationMinutes: number,
  tz = envConfig.timezone,
): { dateKey: string; shift: ShiftDef } | null {
  const dateKey = businessDateKey(startAt, tz);
  const startLocal = DateTime.fromJSDate(startAt).setZone(tz);
  const startMin = startLocal.hour * 60 + startLocal.minute;
  const endMin = startMin + durationMinutes;

  const shifts = listShifts(dateKey);
  for (const shift of shifts) {
    const from = earlyStartOf(shift, shifts) ?? shift.start;
    if (startMin >= toMinutes(from) && endMin <= toMinutes(shift.end)) {
      return { dateKey, shift };
    }
  }
  return null;
}

/**
 * Rango de horas de inicio con las que una actividad entra ENTERA en un turno
 * sugerido. Para armar la oferta de horarios (no restringe nada).
 */
export function startWindow(
  shift: ShiftDef,
  durationMinutes: number,
): { earliest: string; latest: string } | null {
  const startMin = toMinutes(shift.start);
  const latestMin = toMinutes(shift.end) - durationMinutes;
  if (latestMin < startMin) return null;
  return { earliest: fmtMinutes(startMin), latest: fmtMinutes(latestMin) };
}

/** Turnos sugeridos donde entra entera una actividad de esa duración. */
export function shiftsFitting(
  durationMinutes: number,
  dateKey?: string,
): ShiftDef[] {
  return listShifts(dateKey).filter(
    (s) => startWindow(s, durationMinutes) !== null,
  );
}

/** ¿Este turno sugiere esa experiencia? Sin lista, sugiere todas. */
export function shiftAllowsExperience(
  shift: ShiftDef,
  experienceId: string,
): boolean {
  const ids = shift.experienceIds ?? [];
  return ids.length === 0 || ids.includes(String(experienceId));
}

/** Límites absolutos de un turno sugerido para una fecha de negocio dada. */
export function shiftBounds(
  dateKey: string,
  shift: ShiftDef,
  tz = envConfig.timezone,
): { start: Date; end: Date } {
  const start = DateTime.fromISO(`${dateKey}T${shift.start}`, { zone: tz });
  const end = DateTime.fromISO(`${dateKey}T${shift.end}`, { zone: tz });
  return { start: start.toJSDate(), end: end.toJSDate() };
}
