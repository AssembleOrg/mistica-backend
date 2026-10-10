import { DateTime } from 'luxon';
import { envConfig } from '../config/env.config';
import type { PriceVariantLike } from '../common/pricing';
import { businessWindow, fmtMinutes, toMinutes } from '../tables/shifts';
import { cleanAliases, normalizeAlias } from './alias';
import { hasOwnSchedule, ownStartsFor, type OwnSlotLike } from './own-schedule';

/**
 * EDICIONES ESPECIALES de una experiencia (Experience.specials): Halloween,
 * Navidad, el Día de la Madre… Entre `dateFrom` y `dateTo` la experiencia ES
 * esa edición — texto, precio, bonos, extras y horarios propios — y su versión
 * normal no se ofrece esos días. Fuera de la ventana no tiene efecto, así que
 * se activa y se apaga sola.
 *
 * Funciones puras, sin Mongo: las usan la disponibilidad, el precio de la
 * reserva, la validación del panel y la vista pública (bot y landing).
 */
export interface SpecialSlotLike {
  /** Hora local de inicio 'HH:mm'. */
  start: string;
  /** 'YYYY-MM-DD': sólo ese día. Sin fecha, todos los días de la edición. */
  date?: string;
}

export interface SpecialExtraLike {
  name: string;
  price: number;
  description?: string;
}

export interface SpecialLike {
  _id?: unknown;
  name: string;
  aliases?: string[];
  description?: string;
  /** Primer día en que se hace ('YYYY-MM-DD'). */
  dateFrom: string;
  /** Último día en que se hace ('YYYY-MM-DD'). */
  dateTo: string;
  /** Desde cuándo se ofrece y se reserva. Sin valor, apenas se carga. */
  announceFrom?: string;
  /** Precio por persona de la edición. Sin valor, el de la experiencia. */
  price?: number;
  priceVariants?: PriceVariantLike[];
  included?: string[];
  extras?: SpecialExtraLike[];
  schedule?: SpecialSlotLike[];
  active?: boolean;
}

/**
 * PROXIMA: todavía no abrió reservas (falta para `announceFrom`).
 * VIGENTE: se ofrece y se reserva. FINALIZADA: ya pasó su último día.
 */
export type SpecialStatus = 'PROXIMA' | 'VIGENTE' | 'FINALIZADA';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Hoy ('YYYY-MM-DD') en la zona del negocio. */
export function todayKey(tz = envConfig.timezone): string {
  return DateTime.now().setZone(tz).toISODate() as string;
}

/** Edición especial activa que rige ese día, si hay. */
export function specialOn<T extends SpecialLike>(
  specials: T[] | null | undefined,
  dateKey: string,
): T | undefined {
  return (specials ?? []).find(
    (s) => s.active !== false && s.dateFrom <= dateKey && dateKey <= s.dateTo,
  );
}

export function specialStatus(s: SpecialLike, today: string): SpecialStatus {
  if (today > s.dateTo) return 'FINALIZADA';
  if (s.announceFrom && today < s.announceFrom) return 'PROXIMA';
  return 'VIGENTE';
}

/** Id de la edición como texto (para guardarlo en la reserva). */
export function specialIdOf(s: SpecialLike | undefined): string | undefined {
  return s?._id != null ? String(s._id as { toString(): string }) : undefined;
}

/** Claves canónicas con las que el bot reconoce la edición: nombre y activadores. */
export function specialKeys(
  s: Pick<SpecialLike, 'name' | 'aliases'>,
): string[] {
  return [
    normalizeAlias(s.name),
    ...(s.aliases ?? []).map(normalizeAlias),
  ].filter(Boolean);
}

/** Cómo se ofrece la experiencia un día dado. */
export interface DayPlan<T extends SpecialLike = SpecialLike> {
  /** Edición especial que rige ese día. */
  special?: T;
  /**
   * true = se ofrece sólo en `starts` (horario propio o especial: el lugar es
   * el cupo, no las mesas). false = turnos generales del salón.
   */
  own: boolean;
  /** Horas de inicio 'HH:mm' del día cuando `own`. */
  starts: string[];
  /** La edición del día todavía no abrió reservas. */
  notAnnounced: boolean;
}

/**
 * Plan de un día: manda la edición especial que lo cubra (con sus horarios si
 * los tiene); si no, el horario propio de la experiencia; si no, los turnos
 * generales.
 */
export function dayPlan<T extends SpecialLike>(
  exp: { ownSchedule?: OwnSlotLike[] | null; specials?: T[] | null },
  dateKey: string,
  today: string = todayKey(),
): DayPlan<T> {
  const special = specialOn(exp.specials, dateKey);
  const notAnnounced = !!special && specialStatus(special, today) === 'PROXIMA';
  if (special?.schedule?.length) {
    const starts = [
      ...new Set(
        special.schedule
          .filter((s) => !s.date || s.date === dateKey)
          .map((s) => s.start),
      ),
    ].sort((a, b) => toMinutes(a) - toMinutes(b));
    return { special, own: true, starts, notAnnounced };
  }
  if (hasOwnSchedule(exp.ownSchedule)) {
    return {
      special,
      own: true,
      starts: ownStartsFor(exp.ownSchedule, dateKey),
      notAnnounced,
    };
  }
  return { special, own: false, starts: [], notAnnounced };
}

/** "el 31/10" o "del 24/12 al 31/12". */
export function specialDatesLabel(
  s: Pick<SpecialLike, 'dateFrom' | 'dateTo'>,
): string {
  const f = (ymd: string) => {
    const d = DateTime.fromISO(ymd);
    return `${d.day}/${d.month}`;
  };
  return s.dateFrom === s.dateTo
    ? `el ${f(s.dateFrom)}`
    : `del ${f(s.dateFrom)} al ${f(s.dateTo)}`;
}

/**
 * Deja prolijas las ediciones que manda el panel: recorta textos, limpia los
 * activadores (misma regla que los apodos) y descarta vacíos.
 */
export function normalizeSpecials<T extends SpecialLike>(
  specials: T[] | null | undefined,
): T[] | undefined {
  if (!specials) return undefined;
  return specials.map((s) => ({
    ...s,
    name: (s.name ?? '').trim(),
    aliases: cleanAliases(s.aliases),
    description: s.description?.trim() || undefined,
    announceFrom: s.announceFrom || undefined,
    included: (s.included ?? []).map((x) => String(x).trim()).filter(Boolean),
    extras: (s.extras ?? [])
      .map((x) => ({
        name: (x.name ?? '').trim(),
        price: x.price,
        description: x.description?.trim() || undefined,
      }))
      .filter((x) => x.name),
    schedule: (s.schedule ?? []).map((x) => ({
      start: x.start,
      ...(x.date ? { date: x.date } : {}),
    })),
  }));
}

/**
 * Mensaje de error si las ediciones de UNA experiencia están mal cargadas
 * (null = todo bien): fechas, superposición entre ediciones activas, horarios
 * que no entran en el salón y activadores repetidos entre ellas.
 */
export function specialsError(
  specials: SpecialLike[] | null | undefined,
  durationMinutes: number,
): string | null {
  const list = specials ?? [];
  const { openMin, closeMin } = businessWindow();
  const seen = new Map<string, string>();
  for (const s of list) {
    const quien = `La edición "${s.name || 'sin nombre'}"`;
    if (!s.name?.trim()) return 'Cada edición especial necesita un nombre.';
    if (!YMD.test(s.dateFrom ?? '') || !YMD.test(s.dateTo ?? ''))
      return `${quien} necesita fecha de inicio y de fin.`;
    if (s.dateFrom > s.dateTo)
      return `${quien} termina antes de empezar: revisá las fechas.`;
    if (s.announceFrom) {
      if (!YMD.test(s.announceFrom))
        return `${quien} tiene mal la fecha desde la que se ofrece.`;
      if (s.announceFrom > s.dateTo)
        return `${quien} se empezaría a ofrecer después de haber terminado.`;
    }
    for (const slot of s.schedule ?? []) {
      if (!HHMM.test(slot.start ?? ''))
        return `${quien} tiene un horario con la hora mal cargada.`;
      if (slot.date && (slot.date < s.dateFrom || slot.date > s.dateTo))
        return `${quien} tiene un horario para el ${slot.date}, que está fuera de sus fechas.`;
      const start = toMinutes(slot.start);
      if (start < openMin || start + durationMinutes > closeMin)
        return (
          `${quien}: el horario de las ${slot.start} no entra en el horario del salón ` +
          `(${fmtMinutes(openMin)} a ${fmtMinutes(closeMin)}) con una duración de ${durationMinutes} min.`
        );
    }
    for (const key of new Set(specialKeys(s))) {
      const other = seen.get(key);
      if (other)
        return `${quien} repite un nombre o activador de "${other}": tienen que distinguirse.`;
      seen.set(key, s.name);
    }
  }
  const active = list.filter((s) => s.active !== false);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (a.dateFrom <= b.dateTo && b.dateFrom <= a.dateTo)
        return `Las ediciones "${a.name}" y "${b.name}" se pisan en fechas: un día sólo puede tener una edición.`;
    }
  }
  return null;
}

/** Edición tal como la ven el bot y la landing, con su estado de hoy. */
export function publicSpecials<T extends SpecialLike>(
  specials: T[] | null | undefined,
  today: string = todayKey(),
  /** Las finalizadas se siguen informando un tiempo ("ya pasó"). */
  keepEndedDays = 45,
): Array<T & { status: SpecialStatus }> {
  const limit = DateTime.fromISO(today)
    .minus({ days: keepEndedDays })
    .toISODate() as string;
  return (specials ?? [])
    .filter((s) => s.active !== false && s.dateTo >= limit)
    .map((s) => ({ ...s, status: specialStatus(s, today) }))
    .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
}
