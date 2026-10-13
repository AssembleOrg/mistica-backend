/**
 * Planificador de mesas: dado un grupo de N personas y las mesas libres de un
 * turno, decide QUÉ mesas se le asignan. Función pura, sin base de datos, para
 * poder testear todas las reglas del salón sin levantar nada.
 *
 * Reglas del salón (Mística):
 * - 10 mesas de 2 personas + 2 mesas grandes de 10.
 * - Las mesas se mueven y se unen: no hay que validar que sean contiguas.
 * - Hasta 6 personas se arma con mesas de 2: k = ceil(qty / 2).
 * - De 7 a 10 se prioriza una mesa grande; si no hay, ceil(qty / 2) mesas de 2.
 * - Más de 10 se combina mesa grande + mesas de 2. Al unir una mesa a la grande
 *   se pierde uno de sus lugares, así que la grande aporta 9 en vez de 10.
 * - Se pueden combinar las dos grandes (9 + 9) más las mesas de 2 necesarias.
 * - Compartir una mesa grande: cuando el grupo no entra en mesas de 2, va
 *   ENTERO a una mesa grande que ya tiene gente, mientras queden lugares (10
 *   entre todos). Nunca se parte un grupo entre una mesa de 2 y la grande.
 *   Requiere aviso y aceptación explícita del cliente.
 * - Un grupo chico que no entra en ningún lado se rechaza (no se le da una mesa
 *   grande entera) salvo que se habilite `smallGroupCanTakeLarge`.
 */

export type TableKind = 'SMALL' | 'LARGE';

export interface TableRef {
  code: string;
  kind: TableKind;
}

/** Mesa grande ya ocupada por reservas, con lugares libres para sumar otra. */
export interface ShareableLarge {
  code: string;
  /** Personas ya sentadas en esa mesa, sumando todas sus reservas. */
  holderQty: number;
  /** Primera reserva que la ocupa (con quién se comparte, para avisar). */
  holderReservationId: string;
  /** Todas las reservas que la ocupan (para la guarda atómica al asignar). */
  holderReservationIds?: string[];
}

/** Mesas libres de un turno concreto, ya ordenadas por preferencia. */
export interface FreeTables {
  /** Códigos de mesas de 2 totalmente libres. */
  small: string[];
  /** Códigos de mesas grandes totalmente libres. */
  large: string[];
  /** Mesas grandes con una sola reserva chica, candidatas a compartir. */
  shareableLarge: ShareableLarge[];
}

export interface PlanOptions {
  /** Habilita darle una mesa grande entera a un grupo de hasta 6. */
  smallGroupCanTakeLarge?: boolean;
  /**
   * El cliente ya aceptó compartir mesa. Si es false y la única salida es
   * compartir, el plan vuelve con `needsSharedConsent` para que el bot pregunte.
   */
  sharedAccepted?: boolean;
}

export type PlanFailure =
  | 'INVALID_QTY'
  /** Hay lugar sólo compartiendo mesa grande y falta la aceptación del cliente. */
  | 'NEEDS_SHARED_CONSENT'
  /** No hay combinación posible con las mesas libres del turno. */
  | 'NO_TABLES';

export type PlanResult =
  | {
      ok: true;
      tables: TableRef[];
      /** true si comparte mesa grande con otra reserva. */
      shared: boolean;
      /** Reserva con la que comparte (sólo si shared). */
      sharedWithReservationId?: string;
      /** Todas las reservas que ya están en esa mesa. */
      sharedWithReservationIds?: string[];
      /** Lugares que aporta la combinación elegida. */
      seats: number;
    }
  | {
      ok: false;
      reason: PlanFailure;
      /** En NEEDS_SHARED_CONSENT: la mesa que se ofrecería compartir. */
      offer?: { tables: TableRef[]; sharedWithReservationId: string };
    };

export const SMALL_SEATS = 2;
export const LARGE_SEATS = 10;
/** Una mesa grande pierde un lugar cuando se le une otra mesa. */
export const LARGE_SEATS_JOINED = 9;
/**
 * Personas que entran en una mesa grande compartida, sumando todas sus
 * reservas: se llena hasta sus lugares. (Antes: 4 por reserva, 8 entre dos.)
 */
export const SHARE_MAX_TOTAL = LARGE_SEATS;

/** Mesas de 2 necesarias para un grupo, sin mesa grande de por medio. */
export function smallTablesNeeded(qty: number): number {
  return Math.ceil(qty / SMALL_SEATS);
}

/** Lugares que aporta una combinación de mesas grandes y chicas. */
function seatsOf(larges: number, smalls: number): number {
  if (larges === 0) return smalls * SMALL_SEATS;
  // Cada grande aporta 9 si hay algo unido a ella; una grande sola aporta 10.
  const perLarge = larges > 1 || smalls > 0 ? LARGE_SEATS_JOINED : LARGE_SEATS;
  return larges * perLarge + smalls * SMALL_SEATS;
}

/** Mesas de 2 que hay que sumar a `larges` mesas grandes para llegar a `qty`. */
function smallsNeededWithLarges(qty: number, larges: number): number {
  if (larges === 0) return smallTablesNeeded(qty);
  // Con 0 chicas la grande sola rinde 10; en cuanto se une una, rinde 9.
  if (seatsOf(larges, 0) >= qty) return 0;
  const fromLarges = larges * LARGE_SEATS_JOINED;
  return Math.ceil((qty - fromLarges) / SMALL_SEATS);
}

function take(codes: string[], n: number, kind: TableKind): TableRef[] {
  return codes.slice(0, n).map((code) => ({ code, kind }));
}

/**
 * Elige las mesas para un grupo de `qty` personas entre las libres del turno.
 * No toca la base: el llamador se encarga de escribir la asignación de forma
 * atómica y de volver a planificar si perdió la carrera.
 */
export function planTables(
  qty: number,
  free: FreeTables,
  opts: PlanOptions = {},
): PlanResult {
  if (!Number.isInteger(qty) || qty < 1) {
    return { ok: false, reason: 'INVALID_QTY' };
  }

  const shareOffer = pickShareable(qty, free);

  // ── Grupos de hasta 6: siempre mesas de 2 ──
  if (qty <= 6) {
    const need = smallTablesNeeded(qty);
    if (free.small.length >= need) {
      return {
        ok: true,
        tables: take(free.small, need, 'SMALL'),
        shared: false,
        seats: need * SMALL_SEATS,
      };
    }
    // No alcanzan las mesas de 2: el grupo va ENTERO a una mesa grande que
    // todavía tenga lugar (nunca partido entre una mesa de 2 y la grande).
    if (shareOffer) {
      if (!opts.sharedAccepted) return needsConsent(shareOffer);
      return shareWith(shareOffer);
    }
    if (opts.smallGroupCanTakeLarge && free.large.length >= 1) {
      return {
        ok: true,
        tables: take(free.large, 1, 'LARGE'),
        shared: false,
        seats: LARGE_SEATS,
      };
    }
    return { ok: false, reason: 'NO_TABLES' };
  }

  // ── Grupos de 7 a 10: primero la mesa grande ──
  if (qty <= LARGE_SEATS) {
    if (free.large.length >= 1) {
      return {
        ok: true,
        tables: take(free.large, 1, 'LARGE'),
        shared: false,
        seats: LARGE_SEATS,
      };
    }
    const need = smallTablesNeeded(qty);
    if (free.small.length >= need) {
      return {
        ok: true,
        tables: take(free.small, need, 'SMALL'),
        shared: false,
        seats: need * SMALL_SEATS,
      };
    }
    // Último recurso: sumarse a una grande con lugar (7 + un grupo de 3).
    if (shareOffer) {
      return opts.sharedAccepted ? shareWith(shareOffer) : needsConsent(shareOffer);
    }
    return { ok: false, reason: 'NO_TABLES' };
  }

  // ── Más de 10: grande(s) + mesas de 2. Se elige la combinación que menos
  // lugares desperdicia y, a igualdad, la que usa menos mesas. Sin mesas
  // grandes libres, se cae a puras mesas de 2.
  let best: { larges: number; smalls: number; seats: number } | null = null;
  for (let larges = 1; larges <= free.large.length; larges++) {
    const smalls = smallsNeededWithLarges(qty, larges);
    if (smalls > free.small.length) continue;
    const seats = seatsOf(larges, smalls);
    if (seats < qty) continue;
    const waste = seats - qty;
    if (
      !best ||
      waste < best.seats - qty ||
      (waste === best.seats - qty &&
        larges + smalls < best.larges + best.smalls)
    ) {
      best = { larges, smalls, seats };
    }
  }
  if (best) {
    return {
      ok: true,
      tables: [
        ...take(free.large, best.larges, 'LARGE'),
        ...take(free.small, best.smalls, 'SMALL'),
      ],
      shared: false,
      seats: best.seats,
    };
  }

  const need = smallTablesNeeded(qty);
  if (free.small.length >= need) {
    return {
      ok: true,
      tables: take(free.small, need, 'SMALL'),
      shared: false,
      seats: need * SMALL_SEATS,
    };
  }

  return { ok: false, reason: 'NO_TABLES' };
}

/**
 * Mesa grande con gente donde este grupo entra entero. Se elige la que queda
 * más llena, para no dejar lugares sueltos en dos mesas.
 */
function pickShareable(
  qty: number,
  free: FreeTables,
): ShareableLarge | undefined {
  return free.shareableLarge
    .filter((l) => l.holderQty + qty <= SHARE_MAX_TOTAL)
    .sort((a, b) => b.holderQty - a.holderQty)[0];
}

function shareWith(l: ShareableLarge): PlanResult {
  return {
    ok: true,
    tables: [{ code: l.code, kind: 'LARGE' }],
    shared: true,
    sharedWithReservationId: l.holderReservationId,
    sharedWithReservationIds: l.holderReservationIds ?? [l.holderReservationId],
    seats: LARGE_SEATS,
  };
}

function needsConsent(l: ShareableLarge): PlanResult {
  return {
    ok: false,
    reason: 'NEEDS_SHARED_CONSENT',
    offer: {
      tables: [{ code: l.code, kind: 'LARGE' }],
      sharedWithReservationId: l.holderReservationId,
    },
  };
}

/** Personas máximas que admite el salón con estas mesas libres. */
export function maxPartySize(free: FreeTables): number {
  // Con mesas enteras libres o, si rinde más, sumándose a una mesa grande que
  // ya tiene gente: esos lugares vacíos también se pueden vender.
  const sharing = Math.max(
    0,
    ...free.shareableLarge.map((l) => SHARE_MAX_TOTAL - l.holderQty),
  );
  return Math.max(seatsOf(free.large.length, free.small.length), sharing);
}

/**
 * Lugares que da una selección concreta de mesas (la que arma el admin a mano).
 * Aplica la misma regla de unión: una grande con algo unido rinde 9, no 10.
 */
export function seatsForSelection(tables: TableRef[]): number {
  const larges = tables.filter((t) => t.kind === 'LARGE').length;
  const smalls = tables.filter((t) => t.kind === 'SMALL').length;
  return seatsOf(larges, smalls);
}
