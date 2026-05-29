/**
 * One-off: ajusta sesiones que ya fueron editadas con CASH incomes bajo la
 * semántica vieja (income SUMABA al esperado). La semántica nueva los suma
 * al CONTADO.
 *
 * Para cada sesión con CASH incomes en editHistory:
 *   sumCashIncomes = Σ amount de addedIncomes con paymentMethod='CASH'
 *   countedClosingCash += sumCashIncomes
 *   expectedClosingCash -= sumCashIncomes
 *   discrepancy = countedClosingCash - expectedClosingCash
 *
 * Ejemplo del caso real:
 *   counted=50.000, expected=87.000 (vieja, incluye income 18.500),
 *   discrepancy=-37.000.
 *   → counted=68.500, expected=68.500, discrepancy=0.
 *
 * Uso:
 *   mongosh "<DATABASE_URL>" scripts/migrate-income-semantic.mongo.js
 *   mongosh "<DATABASE_URL>" --eval "var APPLY=true" scripts/migrate-income-semantic.mongo.js
 *
 * NO ES IDEMPOTENTE: re-correrlo aplica el delta de nuevo. Sólo correr una
 * vez después del deploy del cambio de semántica.
 */

const apply = (typeof APPLY !== 'undefined' && APPLY === true);

print(apply ? '⚠️  MODO APPLY' : 'Modo dry-run (definí APPLY=true para escribir)');
print('DB: ' + db.getName());
print('==========================================================');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const sessions = db.getCollection('cash_sessions')
  .find({ 'editHistory.addedIncomes.0': { $exists: true } })
  .toArray();

print('Sesiones con CASH incomes en editHistory: ' + sessions.length);
print('---');

let changed = 0;
const ops = [];

for (const s of sessions) {
  let sumCashIncomes = 0;
  for (const entry of (s.editHistory || [])) {
    for (const inc of (entry.addedIncomes || [])) {
      if (inc.paymentMethod === 'CASH') {
        sumCashIncomes += Number(inc.amount || 0);
      }
    }
  }
  if (sumCashIncomes <= 0) {
    print('✓ ' + s._id + ' sin CASH incomes — skip');
    continue;
  }

  const oldCounted = Number(s.countedClosingCash ?? 0);
  const oldExpected = Number(s.expectedClosingCash ?? 0);
  const newCounted = round2(oldCounted + sumCashIncomes);
  const newExpected = round2(oldExpected - sumCashIncomes);
  const newDiscrepancy = round2(newCounted - newExpected);
  const oldDiscrepancy = Number(s.discrepancy ?? 0);

  changed++;
  print(
    '→ ' + s._id + '  CASH incomes Σ=' + sumCashIncomes +
    '  | counted ' + oldCounted + ' → ' + newCounted +
    '  | expected ' + oldExpected + ' → ' + newExpected +
    '  | discrepancy ' + oldDiscrepancy + ' → ' + newDiscrepancy,
  );

  ops.push({
    updateOne: {
      filter: { _id: s._id },
      update: {
        $set: {
          countedClosingCash: newCounted,
          expectedClosingCash: newExpected,
          discrepancy: newDiscrepancy,
        },
      },
    },
  });
}

print('---');
print('Sesiones a corregir: ' + changed + '/' + sessions.length);

if (apply && ops.length > 0) {
  const res = db.getCollection('cash_sessions').bulkWrite(ops, { ordered: false });
  print('   sesiones actualizadas: ' + res.modifiedCount);
}

print('');
print('==========================================================');
print(apply ? 'APPLY terminado.' : 'Dry-run terminado.');
