/**
 * One-off: vuelve a la semántica "INGRESO = plata nueva que entra a la caja".
 * Ahora un CASH income SUMA al `expectedClosingCash` (simétrico al egreso), NO
 * al `countedClosingCash`. Es el inverso del cambio que hizo
 * `migrate-income-semantic.mongo.js` (que había movido los ingresos al contado).
 *
 * Estado de partida asumido (v2, el que produce el código viejo):
 *   - expectedClosingCash EXCLUYE todos los ingresos.
 *   - countedClosingCash INCLUYE los ingresos cargados vía editSession
 *     (editHistory.addedIncomes), porque el código viejo los sumaba al contado.
 *   - Los ingresos cargados sobre la caja ABIERTA (createIncome) NO estaban en
 *     expected ni se sumaron al contado por código (sólo los contaba el cajero
 *     si la plata estaba físicamente).
 *
 * Para cada sesión CERRADA con CASH incomes en su ventana:
 *   sumWindowCashIncomes = Σ amount de CashIncome (CASH) con createdAt en
 *                          [openedAt, closedAt]  → todos los ingresos del período
 *   sumEditCashIncomes   = Σ amount de editHistory.addedIncomes (CASH)
 *                          → los que el código viejo había sumado al contado
 *
 *   expectedClosingCash += sumWindowCashIncomes   (ahora cuentan en el esperado)
 *   countedClosingCash  -= sumEditCashIncomes      (deshacer la inflación del contado)
 *   discrepancy          = countedClosingCash - expectedClosingCash
 *
 * Uso:
 *   mongosh "<DATABASE_URL>" scripts/migrate-income-to-expected.mongo.js
 *   mongosh "<DATABASE_URL>" --eval "var APPLY=true" scripts/migrate-income-to-expected.mongo.js
 *
 * NO ES IDEMPOTENTE: re-correrlo aplica el delta de nuevo. Sólo correr una vez
 * después del deploy del cambio de semántica.
 */

const apply = (typeof APPLY !== 'undefined' && APPLY === true);

print(apply ? '⚠️  MODO APPLY' : 'Modo dry-run (definí APPLY=true para escribir)');
print('DB: ' + db.getName());
print('==========================================================');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const incomeColl = db.getCollection('cash_incomes');

// Sólo sesiones cerradas: las abiertas recalculan el esperado en vivo.
const sessions = db.getCollection('cash_sessions')
  .find({ status: 'CLOSED' })
  .toArray();

print('Sesiones cerradas: ' + sessions.length);
print('---');

let changed = 0;
const ops = [];

for (const s of sessions) {
  const from = s.openedAt;
  const to = s.closedAt;
  if (!from || !to) {
    print('• ' + s._id + ' sin openedAt/closedAt — skip');
    continue;
  }

  // Todos los ingresos CASH del período (cubre createIncome + editSession).
  const windowIncomes = incomeColl.find({
    createdAt: { $gte: from, $lte: to },
    paymentMethod: 'CASH',
    deletedAt: { $exists: false },
  }).toArray();
  const sumWindowCashIncomes = windowIncomes.reduce(
    (acc, i) => acc + Number(i.amount || 0), 0,
  );

  // Ingresos CASH que el código viejo sumó al CONTADO (sólo los de editHistory).
  let sumEditCashIncomes = 0;
  for (const entry of (s.editHistory || [])) {
    for (const inc of (entry.addedIncomes || [])) {
      if (inc.paymentMethod === 'CASH') {
        sumEditCashIncomes += Number(inc.amount || 0);
      }
    }
  }

  if (sumWindowCashIncomes <= 0 && sumEditCashIncomes <= 0) {
    continue; // sesión sin ingresos CASH: v2 y v3 coinciden, no se toca
  }

  const oldExpected = Number(s.expectedClosingCash ?? 0);
  const oldCounted = Number(s.countedClosingCash ?? 0);
  const oldDiscrepancy = Number(s.discrepancy ?? 0);

  const newExpected = round2(oldExpected + sumWindowCashIncomes);
  const newCounted = round2(oldCounted - sumEditCashIncomes);
  const newDiscrepancy = round2(newCounted - newExpected);

  changed++;
  print(
    '→ ' + s._id +
    '  Σingresos(ventana)=' + sumWindowCashIncomes +
    '  Σingresos(edit)=' + sumEditCashIncomes +
    '  | expected ' + oldExpected + ' → ' + newExpected +
    '  | counted ' + oldCounted + ' → ' + newCounted +
    '  | discrepancy ' + oldDiscrepancy + ' → ' + newDiscrepancy,
  );

  ops.push({
    updateOne: {
      filter: { _id: s._id },
      update: {
        $set: {
          expectedClosingCash: newExpected,
          countedClosingCash: newCounted,
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
