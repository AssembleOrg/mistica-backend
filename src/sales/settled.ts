/**
 * Cuánto cobró una venta de saldos de ventas ANTERIORES (sus `settledLines`).
 * Ese monto es parte del total de la venta pero no es un producto: no está en
 * `items` ni en `subtotal`, así que todo recálculo del total tiene que volver a
 * sumarlo.
 */
export function settledTotal(
  lines: ReadonlyArray<{ amount?: number | null }> | null | undefined,
): number {
  const sum = (lines ?? []).reduce(
    (acc, l) => acc + (Number(l?.amount) || 0),
    0,
  );
  return Number(sum.toFixed(2));
}
