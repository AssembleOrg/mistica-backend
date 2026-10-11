import { settledTotal } from './settled';

describe('saldo de ventas anteriores cobrado en una venta', () => {
  it('sin líneas no suma nada', () => {
    expect(settledTotal(undefined)).toBe(0);
    expect(settledTotal(null)).toBe(0);
    expect(settledTotal([])).toBe(0);
  });

  it('suma lo cobrado de cada venta anterior', () => {
    expect(settledTotal([{ amount: 84000 }])).toBe(84000);
    expect(settledTotal([{ amount: 84000 }, { amount: 1500.5 }])).toBe(85500.5);
  });

  it('ignora montos vacíos y redondea a centavos', () => {
    expect(
      settledTotal([{ amount: null }, {}, { amount: 0.1 }, { amount: 0.2 }]),
    ).toBe(0.3);
  });

  // El caso del reclamo: productos por 18.000 + saldo de una reserva por 84.000.
  // Al editar la venta el total tiene que seguir siendo 102.000.
  it('al editar, el total es el de los productos más el saldo ya cobrado', () => {
    const productos = 2 * 7000 + 4000;
    expect(productos + settledTotal([{ amount: 84000 }])).toBe(102000);
  });
});
