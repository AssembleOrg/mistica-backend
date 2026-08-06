/**
 * Precio efectivo de una experiencia según la cantidad de personas y la fecha
 * de la reserva.
 *
 * Una variante PER_PERSON con al menos una CONDICIÓN se aplica sola cuando la
 * reserva cumple TODAS sus condiciones:
 * · Rango de personas (minQty/maxQty): cumpleaños 5+ → $8 c/u.
 * · Días de semana (days, ISO 1=lunes..7=domingo): promo martes y miércoles.
 * · Fecha o rango de fechas (dateFrom/dateTo, 'YYYY-MM-DD'): promo del 20/12,
 *   o de vacaciones de invierno (rango).
 *
 * Si varias aplican gana la MÁS ESPECÍFICA: fecha puntual > rango de fechas >
 * días de semana > cantidad (sumando especificidad si combina condiciones);
 * a igual especificidad, la más barata para el cliente.
 *
 * Las variantes FLAT o sin condiciones son modalidades informativas (escuelita
 * "Mensual" $80) y nunca se auto-aplican.
 *
 * Función pura, sin Mongo: la usan el hold, el alta admin y el preview (así
 * el bot y la landing muestran el MISMO número que después se cobra).
 */

export interface PriceVariantLike {
  name: string;
  /**
   * Precio por persona (o total si FLAT). AUSENTE = beneficio puro: mantiene
   * el precio base sobre el que se aplica (caso cumpleaños: los beneficios
   * rigen sobre el precio de la experiencia elegida, sea cual sea).
   */
  price?: number;
  unit: 'PER_PERSON' | 'FLAT';
  minQty?: number;
  maxQty?: number;
  /** Días de semana ISO (1=lunes..7=domingo) en los que rige. */
  days?: number[];
  /** Primera fecha en la que rige ('YYYY-MM-DD'). Sola = fecha puntual. */
  dateFrom?: string;
  /** Última fecha en la que rige ('YYYY-MM-DD'). */
  dateTo?: string;
  /**
   * Lugares que NO se cobran cuando la promo aplica ("1 lugar bonificado"):
   * el grupo entra completo pero paga por (cantidad - freeSpots) personas.
   */
  freeSpots?: number;
  description?: string;
  active?: boolean;
}

export interface EffectivePrice {
  /** Precio por persona a cobrar. */
  unitPrice: number;
  /**
   * Personas que se COBRAN (cantidad menos lugares bonificados de la promo;
   * nunca menos de 1). Sin promo, igual a la cantidad pedida.
   */
  billableQty: number;
  /** Variante aplicada, si alguna (para mostrarla en el resumen). */
  variant?: PriceVariantLike;
}

/** Día de semana ISO (1=lunes..7=domingo) de un dateKey 'YYYY-MM-DD'. */
export function isoWeekdayOf(dateKey: string): number {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay(); // 0=domingo
  return day === 0 ? 7 : day;
}

function hasQtyRule(v: PriceVariantLike): boolean {
  return v.minQty != null || v.maxQty != null;
}

function hasDayRule(v: PriceVariantLike): boolean {
  return Array.isArray(v.days) && v.days.length > 0;
}

function hasDateRule(v: PriceVariantLike): boolean {
  return v.dateFrom != null || v.dateTo != null;
}

/**
 * ¿La variante se auto-aplica a una reserva de `qty` personas el día `dateKey`?
 * Sin dateKey (contexto sin fecha), las variantes con condición de día/fecha
 * NO aplican: mejor cobrar el precio base que aplicar una promo por error.
 */
function matches(
  v: PriceVariantLike,
  qty: number,
  dateKey?: string,
): boolean {
  if (v.active === false || v.unit !== 'PER_PERSON') return false;
  if (!hasQtyRule(v) && !hasDayRule(v) && !hasDateRule(v)) return false;
  if (hasQtyRule(v)) {
    if (v.minQty != null && qty < v.minQty) return false;
    if (v.maxQty != null && qty > v.maxQty) return false;
  }
  if (hasDayRule(v)) {
    if (!dateKey) return false;
    if (!v.days!.includes(isoWeekdayOf(dateKey))) return false;
  }
  if (hasDateRule(v)) {
    if (!dateKey) return false;
    // dateKey es 'YYYY-MM-DD': la comparación lexicográfica ordena por fecha.
    if (v.dateFrom != null && dateKey < v.dateFrom) return false;
    if (v.dateTo != null && dateKey > v.dateTo) return false;
  }
  return true;
}

function specificity(v: PriceVariantLike): number {
  let score = 0;
  if (hasDateRule(v)) {
    // Fecha puntual (from === to o rango de un solo día) pesa más que un rango.
    score += v.dateFrom != null && v.dateFrom === v.dateTo ? 8 : 4;
  }
  if (hasDayRule(v)) score += 2;
  if (hasQtyRule(v)) score += 1;
  return score;
}

export function effectiveUnitPrice(
  variants: PriceVariantLike[] | undefined | null,
  basePrice: number,
  qty: number,
  dateKey?: string,
): EffectivePrice {
  const applicable = (variants ?? []).filter((v) => matches(v, qty, dateKey));
  if (!applicable.length) return { unitPrice: basePrice, billableQty: qty };
  const winner = applicable.reduce((best, v) => {
    const sv = specificity(v);
    const sb = specificity(best);
    if (sv !== sb) return sv > sb ? v : best;
    // Misma especificidad: dentro de tiers por cantidad gana el rango más
    // alto (10+ sobre 5+); si sigue empatado, la más barata para el cliente.
    if ((v.minQty ?? 0) !== (best.minQty ?? 0))
      return (v.minQty ?? 0) > (best.minQty ?? 0) ? v : best;
    return (v.price ?? basePrice) < (best.price ?? basePrice) ? v : best;
  });
  return {
    unitPrice: winner.price ?? basePrice,
    billableQty: Math.max(1, qty - Math.max(0, winner.freeSpots ?? 0)),
    variant: winner,
  };
}
