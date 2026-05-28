/**
 * Backfill de `payments[].createdAt` en ventas históricas.
 *
 * Causa: a partir del feature de PAGO PARCIAL, cada pago lleva su propio
 * `createdAt`. El arqueo de caja y el resumen de finanzas ahora agregan
 * pagos filtrando por `payments.createdAt` (no por `sale.createdAt`), así
 * los pagos que entran después (completando una seña) cuentan para la caja
 * del día en que se ingresan.
 *
 * Ventas históricas pre-feature: todos los pagos ocurrieron al mismo tiempo
 * que la venta. Asignamos `payment.createdAt = sale.createdAt` para preservar
 * el comportamiento original.
 *
 * Como bonus, también seteamos:
 *   - `balanceDue = 0` en ventas sin el campo (corresponde con el default
 *     del schema; ninguna venta histórica es PARTIAL).
 *   - `items[].bonifiedQty = 0` en items sin el campo (default del schema).
 *
 * Uso (mongosh):
 *   mongosh "<DATABASE_URL>" scripts/migrate-payment-createdAt.mongo.js
 *   mongosh "<DATABASE_URL>" --eval "var APPLY=true" scripts/migrate-payment-createdAt.mongo.js
 *
 * Por default es dry-run. Definí APPLY=true (o pasá --eval "var APPLY=true")
 * para escribir.
 */

const apply = (typeof APPLY !== 'undefined' && APPLY === true);

print(apply ? '⚠️  MODO APPLY' : 'Modo dry-run (definí APPLY=true para escribir)');
print('DB: ' + db.getName());
print('==========================================================');

const sales = db.getCollection('sales');

// --------------------------------------------------------------------------
// PARTE A — Backfill de payments[].createdAt
// --------------------------------------------------------------------------
print('');
print('PARTE A — Backfill payments[].createdAt');
print('---');

const filterPayments = { 'payments.createdAt': { $exists: false } };
const salesWithoutCreatedAt = sales.countDocuments(filterPayments);
print('Ventas con algún pago sin createdAt: ' + salesWithoutCreatedAt);

if (apply && salesWithoutCreatedAt > 0) {
  // Pipeline-update: mapea cada pago y rellena createdAt con el de la venta
  // si no lo tiene. Mantiene los pagos que ya tienen createdAt como están.
  const resA = sales.updateMany(filterPayments, [
    {
      $set: {
        payments: {
          $map: {
            input: '$payments',
            as: 'p',
            in: {
              $mergeObjects: [
                '$$p',
                { createdAt: { $ifNull: ['$$p.createdAt', '$createdAt'] } },
              ],
            },
          },
        },
      },
    },
  ]);
  print('   ventas actualizadas: ' + resA.modifiedCount);
}

// --------------------------------------------------------------------------
// PARTE B — balanceDue por default
// --------------------------------------------------------------------------
print('');
print('PARTE B — balanceDue por default');
print('---');

const filterBalance = { balanceDue: { $exists: false } };
const salesWithoutBalance = sales.countDocuments(filterBalance);
print('Ventas sin balanceDue: ' + salesWithoutBalance);

if (apply && salesWithoutBalance > 0) {
  const resB = sales.updateMany(filterBalance, { $set: { balanceDue: 0 } });
  print('   ventas actualizadas: ' + resB.modifiedCount);
}

// --------------------------------------------------------------------------
// PARTE C — bonifiedQty por default en items
// --------------------------------------------------------------------------
print('');
print('PARTE C — items[].bonifiedQty por default');
print('---');

const filterBonif = { 'items.bonifiedQty': { $exists: false }, 'items.0': { $exists: true } };
const salesWithItemsMissingBonif = sales.countDocuments(filterBonif);
print('Ventas con items sin bonifiedQty: ' + salesWithItemsMissingBonif);

if (apply && salesWithItemsMissingBonif > 0) {
  const resC = sales.updateMany(
    filterBonif,
    { $set: { 'items.$[itm].bonifiedQty': 0 } },
    { arrayFilters: [{ 'itm.bonifiedQty': { $exists: false } }] },
  );
  print('   ventas actualizadas: ' + resC.modifiedCount);
}

print('');
print('==========================================================');
print(apply ? 'APPLY terminado.' : 'Dry-run terminado (nada se escribió).');
