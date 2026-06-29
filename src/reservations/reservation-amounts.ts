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
