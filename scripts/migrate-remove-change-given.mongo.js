/**
 * Corrige los históricos afectados por el bug del "vuelto" (changeGiven).
 *
 * Causa raíz: en una venta/seña en CASH, `amount` ya es el neto que entra a la
 * caja. El cálculo de `expectedClosingCash` además restaba `changeGiven`, con
 * lo que descontaba el vuelto DOS veces y dejaba el esperado (y por ende el
 * faltante/sobrante) mal. El cálculo ya fue corregido en cashbox.service.ts:
 *   expectedClosingCash = openingCash + ventas CASH (amount)
 *                       + prepaids CASH (amount) - egresos CASH (amount)
 *
 * Este script hace dos cosas:
 *   A) Recalcula expectedClosingCash y discrepancy de TODAS las sesiones
 *      CERRADAS con la fórmula correcta (sin restar changeGiven).
 *   B) Borra los campos changeGiven / receivedAmount de ventas (en cada pago)
 *      y de prepaids, que ya no existen en el modelo.
 *
 * Uso (mongosh):
 *   mongosh "<DATABASE_URL>" scripts/migrate-remove-change-given.mongo.js
 *   mongosh "<DATABASE_URL>" --eval "var APPLY=true" scripts/migrate-remove-change-given.mongo.js
 *
 * También se puede pegar el contenido en la pestaña Script de Compass / Studio 3T.
 *
 * Por default es dry-run. Definí APPLY=true (o pasá --eval "var APPLY=true")
 * para escribir.
 */

const apply = (typeof APPLY !== 'undefined' && APPLY === true);

print(apply ? '⚠️  MODO APPLY' : 'Modo dry-run (definí APPLY=true para escribir)');
print('DB: ' + db.getName());
print('==========================================================');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sumCash(collection, match) {
  const agg = db.getCollection(collection).aggregate(match).toArray();
  return agg.length > 0 && agg[0].amount ? agg[0].amount : 0;
}

// --------------------------------------------------------------------------
// PARTE A — Recalcular esperado y discrepancia de sesiones CERRADAS
// --------------------------------------------------------------------------
print('');
print('PARTE A — Recálculo de sesiones cerradas');
print('---');

const sessions = db.getCollection('cash_sessions')
  .find({ status: 'CLOSED' })
  .sort({ openedAt: 1 })
  .toArray();

print('Sesiones cerradas: ' + sessions.length);

let sessionOps = [];
let changedSessions = 0;

for (const s of sessions) {
  const from = s.openedAt;
  const to = s.closedAt;
  if (!from || !to) {
    print('  ⚠️  sesión ' + s._id + ' sin openedAt/closedAt — se omite');
    continue;
  }

  const salesCashAmount = sumCash('sales', [
    { $match: { createdAt: { $gte: from, $lte: to }, deletedAt: { $exists: false }, status: { $ne: 'CANCELLED' } } },
    { $unwind: '$payments' },
    { $match: { 'payments.method': 'CASH' } },
    { $group: { _id: null, amount: { $sum: '$payments.amount' } } },
  ]);

  const prepaidsAmount = sumCash('prepaids', [
    { $match: { createdAt: { $gte: from, $lte: to }, deletedAt: { $exists: false }, paymentMethod: 'CASH' } },
    { $group: { _id: null, amount: { $sum: '$amount' } } },
  ]);

  const egressAmount = sumCash('egresses', [
    { $match: { createdAt: { $gte: from, $lte: to }, deletedAt: { $exists: false }, paymentMethod: 'CASH', status: { $ne: 'CANCELLED' } } },
    { $group: { _id: null, amount: { $sum: '$amount' } } },
  ]);

  const newExpected = round2(s.openingCash + salesCashAmount + prepaidsAmount - egressAmount);
  const counted = (s.countedClosingCash != null) ? s.countedClosingCash : 0;
  const newDiscrepancy = round2(counted - newExpected);

  const oldExpected = (s.expectedClosingCash != null) ? s.expectedClosingCash : 0;
  const delta = round2(newExpected - oldExpected);

  if (delta !== 0) {
    changedSessions++;
    print('→ ' + s._id + ' [' + (s.closureType || '?') + ']  esperado ' +
      oldExpected + ' → ' + newExpected + '  (Δ +' + delta + ')  | discrepancia ' +
      ((s.discrepancy != null) ? s.discrepancy : 0) + ' → ' + newDiscrepancy);

    sessionOps.push({
      updateOne: {
        filter: { _id: s._id },
        update: { $set: { expectedClosingCash: newExpected, discrepancy: newDiscrepancy } },
      },
    });
  } else {
    print('✓ ' + s._id + '  sin cambios (esperado ' + oldExpected + ')');
  }
}

print('---');
print('Sesiones a corregir: ' + changedSessions + '/' + sessions.length);

if (apply && sessionOps.length > 0) {
  const res = db.getCollection('cash_sessions').bulkWrite(sessionOps, { ordered: false });
  print('   sesiones actualizadas: ' + res.modifiedCount);
}

// --------------------------------------------------------------------------
// PARTE B — Borrar changeGiven / receivedAmount de ventas y prepaids
// --------------------------------------------------------------------------
print('');
print('PARTE B — Limpieza de campos changeGiven / receivedAmount');
print('---');

const salesFilter = {
  $or: [
    { 'payments.changeGiven': { $exists: true } },
    { 'payments.receivedAmount': { $exists: true } },
  ],
};
const salesCount = db.getCollection('sales').countDocuments(salesFilter);
print('Ventas con changeGiven/receivedAmount: ' + salesCount);

const prepaidsFilter = {
  $or: [
    { changeGiven: { $exists: true } },
    { receivedAmount: { $exists: true } },
  ],
};
const prepaidsCount = db.getCollection('prepaids').countDocuments(prepaidsFilter);
print('Prepaids con changeGiven/receivedAmount: ' + prepaidsCount);

if (apply) {
  if (salesCount > 0) {
    const resSales = db.getCollection('sales').updateMany(
      salesFilter,
      { $unset: { 'payments.$[].changeGiven': '', 'payments.$[].receivedAmount': '' } },
    );
    print('   ventas limpiadas: ' + resSales.modifiedCount);
  }
  if (prepaidsCount > 0) {
    const resPrepaids = db.getCollection('prepaids').updateMany(
      prepaidsFilter,
      { $unset: { changeGiven: '', receivedAmount: '' } },
    );
    print('   prepaids limpiados: ' + resPrepaids.modifiedCount);
  }
}

print('');
print('==========================================================');
print(apply ? 'APPLY terminado.' : 'Dry-run terminado (nada se escribió).');
