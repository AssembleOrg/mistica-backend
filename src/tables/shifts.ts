import { DateTime } from 'luxon';
import { envConfig } from '../config/env.config';

/**
 * Turnos fijos del día. El salón trabaja en bloques cerrados: una experiencia
 * entra ENTERA en un turno o no entra (no puede cruzar el borde). Entre un
 * turno y el siguiente queda el hueco de limpieza (ver cleaningBufferMinutes).
 *
 * Las mesas se bloquean por turno: una mesa ocupada en T1 vuelve al pool en T2.
 */
export interface ShiftDef {
  /** Clave corta y estable ('T1'). Se persiste en la reserva. */
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
   * Experiencias que se pueden reservar en este turno. Vacío = todas las
   * reservables online. En un mismo turno conviven reservas de experiencias
   * distintas: lo que se comparte es el salón (las mesas), no la actividad.
   */
  experienceIds?: string[];
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(hhmm: string): number {
  const m = HHMM.exec(hhmm);
  if (!m)
    throw new Error(`Hora inválida en SHIFTS: "${hhmm}" (se espera HH:mm)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Parsea la definición de turnos de env y valida el conjunto: horas válidas,
 * turno con duración positiva, orden cronológico, sin solaparse y con al menos
 * `cleaningBufferMinutes` de separación entre uno y el siguiente.
 */
export function parseShifts(
  raw: string,
  cleaningBufferMinutes: number,
): ShiftDef[] {
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
    const gap = toMinutes(cur.start) - toMinutes(prev.end);
    if (gap < 0) {
      throw new Error(
        `Los turnos ${prev.key} y ${cur.key} se solapan (${prev.end} > ${cur.start})`,
      );
    }
    if (gap < cleaningBufferMinutes) {
      throw new Error(
        `Entre ${prev.key} y ${cur.key} hay ${gap} min y se necesitan ${cleaningBufferMinutes} para limpiar`,
      );
    }
  }
  return shifts;
}

let cached: ShiftDef[] | null = null;

/**
 * De dónde salen los turnos de una fecha. Por defecto, de la env `SHIFTS`.
 * `ShiftsService` lo reemplaza al arrancar por las plantillas de la base, para
 * que se puedan editar desde el panel sin redeployar. Se mantiene como hook
 * sincrónico para no tener que volver async medio backend (los turnos son 2 o 3
 * documentos: viven en memoria y se recargan cuando el admin los edita).
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
    cached = parseShifts(envConfig.shifts, envConfig.cleaningBufferMinutes);
  }
  return cached;
}

/**
 * Turnos que aplican a una fecha. Sin `dateKey` devuelve los turnos "base" (los
 * que valen todos los días), que es lo que se usa para mensajes genéricos.
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

/** Límites absolutos de un turno para una fecha de negocio dada. */
export function shiftBounds(
  dateKey: string,
  shift: ShiftDef,
  tz = envConfig.timezone,
): { start: Date; end: Date } {
  const start = DateTime.fromISO(`${dateKey}T${shift.start}`, { zone: tz });
  const end = DateTime.fromISO(`${dateKey}T${shift.end}`, { zone: tz });
  return { start: start.toJSDate(), end: end.toJSDate() };
}

/**
 * ¿En qué turno cae una actividad que arranca en `startAt` y dura
 * `durationMinutes`? Devuelve null si no entra entera en ningún turno (empieza
 * antes del primero, termina después del último, o cruza el borde entre dos).
 */
export function resolveShift(
  startAt: Date,
  durationMinutes: number,
  tz = envConfig.timezone,
): { dateKey: string; shift: ShiftDef } | null {
  const dateKey = businessDateKey(startAt, tz);
  const startLocal = DateTime.fromJSDate(startAt).setZone(tz);
  const startMin = startLocal.hour * 60 + startLocal.minute;
  const endMin = startMin + durationMinutes;

  for (const shift of listShifts(dateKey)) {
    if (startMin >= toMinutes(shift.start) && endMin <= toMinutes(shift.end)) {
      return { dateKey, shift };
    }
  }
  return null;
}

/**
 * Rango de horas de inicio válidas para una experiencia de `durationMinutes` en
 * un turno: desde el inicio del turno hasta la última hora que permite terminar
 * dentro. Devuelve null si la experiencia no entra en el turno.
 */
export function startWindow(
  shift: ShiftDef,
  durationMinutes: number,
): { earliest: string; latest: string } | null {
  const startMin = toMinutes(shift.start);
  const latestMin = toMinutes(shift.end) - durationMinutes;
  if (latestMin < startMin) return null;
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { earliest: fmt(startMin), latest: fmt(latestMin) };
}

/** Turnos donde entra entera una experiencia de esa duración. */
export function shiftsFitting(
  durationMinutes: number,
  dateKey?: string,
): ShiftDef[] {
  return listShifts(dateKey).filter(
    (s) => startWindow(s, durationMinutes) !== null,
  );
}

/** ¿Este turno acepta esa experiencia? Sin lista, acepta todas. */
export function shiftAllowsExperience(
  shift: ShiftDef,
  experienceId: string,
): boolean {
  const ids = shift.experienceIds ?? [];
  return ids.length === 0 || ids.includes(String(experienceId));
}
