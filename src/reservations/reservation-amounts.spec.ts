import { checkoutAmounts, computeReservationAmounts } from './reservation-amounts';

describe('computeReservationAmounts (seña / saldo de reservas)', () => {
  it('seña 50% de un turno simple', () => {
    expect(computeReservationAmounts(42000, 1, 50)).toEqual({
      total: 42000,
      deposit: 21000,
      balanceDue: 21000,
    });
  });

  it('seña 50% para varias personas', () => {
    expect(computeReservationAmounts(49500, 2, 50)).toEqual({
      total: 99000,
      deposit: 49500,
      balanceDue: 49500,
    });
  });

  it('100% = se cobra todo, sin saldo', () => {
    expect(computeReservationAmounts(55000, 1, 100)).toEqual({
      total: 55000,
      deposit: 55000,
      balanceDue: 0,
    });
  });

  it('redondea la seña y el saldo cierra contra el total', () => {
    const r = computeReservationAmounts(49500, 1, 50); // 24750
    expect(r.deposit).toBe(24750);
    expect(r.deposit + r.balanceDue).toBe(r.total);
  });

  it('redondeo con total impar: deposit + balanceDue === total', () => {
    const r = computeReservationAmounts(333, 1, 50); // 166.5 → 167
    expect(r.deposit).toBe(167);
    expect(r.balanceDue).toBe(166);
    expect(r.deposit + r.balanceDue).toBe(333);
  });

  it('clamp de pct fuera de rango', () => {
    expect(computeReservationAmounts(1000, 1, 150).deposit).toBe(1000);
    expect(computeReservationAmounts(1000, 1, -10).deposit).toBe(0);
  });

  it('default 50 cuando pct es undefined', () => {
    expect(
      computeReservationAmounts(1000, 1, undefined as unknown as number).deposit,
    ).toBe(500);
  });
});

describe('checkoutAmounts (cobrar el saldo desde el POS)', () => {
  it('sin descuento: se cobra todo el saldo', () => {
    expect(checkoutAmounts(70000, 0, 0)).toEqual({ discount: 0, paid: 70000 });
  });

  it('descuento al cobrar (MMP149: cumpleañero no paga)', () => {
    expect(checkoutAmounts(70000, 42000, 0)).toEqual({ discount: 42000, paid: 28000 });
  });

  it('el descuento nunca supera el saldo', () => {
    expect(checkoutAmounts(10000, 15000, 0)).toEqual({ discount: 10000, paid: 0 });
  });

  it('el descuento del plan ya estaba fuera del saldo: no se resta dos veces', () => {
    expect(checkoutAmounts(84000, 42000, 42000)).toEqual({ discount: 0, paid: 84000 });
    expect(checkoutAmounts(84000, 50000, 42000)).toEqual({ discount: 8000, paid: 76000 });
  });

  it('recargo (descuento negativo) no cambia la reserva', () => {
    expect(checkoutAmounts(70000, -5000, 0)).toEqual({ discount: 0, paid: 70000 });
  });
});
