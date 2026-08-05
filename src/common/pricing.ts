/**
 * Precio efectivo de una experiencia según la cantidad de personas.
 *
 * Los TIERS por cantidad (unit=PER_PERSON con rango minQty/maxQty) se aplican
 * solos: para un grupo de `qty`, gana el tier activo cuyo rango lo contiene;
 * si hay varios, el de `minQty` más alto (el más específico). Las variantes
 * FLAT o sin rango son modalidades informativas y nunca se auto-aplican.
 *
 * Función pura, sin Mongo: la usan el hold, el alta admin y el preview (así
 * el bot y la landing muestran el MISMO número que después se cobra).
 */

export interface PriceVariantLike {
  name: string;
  price: number;
  unit: 'PER_PERSON' | 'FLAT';
  minQty?: number;
  maxQty?: number;
  description?: string;
  active?: boolean;
}

export interface EffectivePrice {
  /** Precio por persona a cobrar. */
  unitPrice: number;
  /** Tier aplicado, si alguno (para mostrarlo en el resumen). */
  variant?: PriceVariantLike;
}

export function effectiveUnitPrice(
  variants: PriceVariantLike[] | undefined | null,
  basePrice: number,
  qty: number,
): EffectivePrice {
  const tiers = (variants ?? []).filter(
    (v) =>
      v.active !== false &&
      v.unit === 'PER_PERSON' &&
      (v.minQty != null || v.maxQty != null) &&
      (v.minQty == null || qty >= v.minQty) &&
      (v.maxQty == null || qty <= v.maxQty),
  );
  if (!tiers.length) return { unitPrice: basePrice };
  const winner = tiers.reduce((best, v) =>
    (v.minQty ?? 0) > (best.minQty ?? 0) ? v : best,
  );
  return { unitPrice: winner.price, variant: winner };
}
