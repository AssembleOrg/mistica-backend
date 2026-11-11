/**
 * Cálculo puro de montos de una reserva (seña / saldo). Aislado para poder
 * testearlo sin Mongo ni Nest.
 */
export interface ReservationAmounts {
  total: number;
  deposit: number;
  balanceDue: number;
}

/**
 * total = unitPrice * quantity; deposit = seña según `depositPct` (redondeada);
 * balanceDue = lo que falta. `pct` se clampa a [0, 100]; 100 = se cobra todo.
 */
export function computeReservationAmounts(
  unitPrice: number,
  quantity: number,
  depositPct: number,
): ReservationAmounts {
  const total = Math.max(0, unitPrice) * Math.max(0, quantity);
  const pct = Math.min(100, Math.max(0, depositPct ?? 50));
  const deposit = Math.round((total * pct) / 100);
  const balanceDue = Math.max(0, total - deposit);
  return { total, deposit, balanceDue };
}

/**
 * Cómo queda la reserva al cobrarle el saldo con una venta del POS. Si la
 * venta descontó algo nuevo (promo cargada a mano, redondeo), ese descuento
 * baja el total de la reserva: no es plata cobrada. `planDiscount` es el que
 * ya traía el plan de cobro (ya estaba fuera del saldo) y no se resta dos veces.
 */
export function checkoutAmounts(
  balance: number,
  saleDiscount: number,
  planDiscount: number,
): { discount: number; paid: number } {
  const discount = Math.min(
    balance,
    Math.max(0, (saleDiscount ?? 0) - (planDiscount ?? 0)),
  );
  return {
    discount: Number(discount.toFixed(2)),
    paid: Number((balance - discount).toFixed(2)),
  };
}
