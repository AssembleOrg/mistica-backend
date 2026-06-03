/**
 * One-off: elimina el estado "seña" (PARTIAL) de las ventas.
 *
 * Las ventas PARTIAL se convierten a COMPLETED descontando el saldo NO cobrado:
 *   paid        = Σ payments[].amount
 *   autoDiscount = total − paid           (si > 0)
 *   discount    += autoDiscount
 *   total        = paid
 *   balanceDue   = 0
 *   status       = 'COMPLETED'
 *
 * Esto replica exactamente la lógica de "marcar como completada" del backend
 * (addPayments con markCompleted): el total pasa a ser lo efectivamente cobrado
 * y la diferencia queda como descuento, así la reportería queda coherente.
 *
 * IMPACTO EN LA CAJA: CERO. No se agrega, modifica ni re-fecha ningún pago.
 * La caja imputa por `payments[].createdAt`, que no se toca → la seña ya cobrada
 * sigue contando en la caja del día en que se creó, y el saldo impago (que nunca
 * entró a ninguna caja) simplemente desaparece como descuento. NO impacta la
 * caja de hoy.
 *
 * IDEMPOTENTE: sólo matchea status='PARTIAL'. Tras aplicarlo no quedan PARTIAL,
 * así que re-correrlo no hace nada.
 *
 * Uso:
 *   mongosh "<DATABASE_URL>" scripts/migrate-sena-to-pending.mongo.js
 *   mongosh "<DATABASE_URL>" --eval "var APPLY=true" scripts/migrate-sena-to-pending.mongo.js
 */

const apply = (typeof APPLY !== 'undefined' && APPLY === true);

print(apply ? '⚠️  MODO APPLY (se va a escribir)' : 'Modo dry-run (definí APPLY=true para escribir)');
print('DB: ' + db.getName());
print('==========================================================');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const sales = db.getCollection('sales');

const cursor = sales.find({
  status: 'PARTIAL',
  deletedAt: { $exists: false },
});

const partials = cursor.toArray();
print('Ventas PARTIAL (seña) a migrar: ' + partials.length);
print('---');

let migrated = 0;
let totalSaldoDescontado = 0;

for (const s of partials) {
  const paid = round2((s.payments || []).reduce(function (acc, p) {
    return acc + (p.amount || 0);
  }, 0));
  const oldTotal = round2(s.total || 0);
  const oldDiscount = round2(s.discount || 0);
  const autoDiscount = oldTotal - paid > 0.01 ? round2(oldTotal - paid) : 0;

  const newTotal = autoDiscount > 0 ? paid : oldTotal;
  const newDiscount = round2(oldDiscount + autoDiscount);

  totalSaldoDescontado = round2(totalSaldoDescontado + autoDiscount);

  print(
    (s.saleNumber || s._id) +
    ' | cliente: ' + (s.customerName || '-') +
    ' | creada: ' + (s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : '-') +
    ' | total ' + oldTotal + ' → ' + newTotal +
    ' | pagado ' + paid +
    ' | saldo descontado ' + autoDiscount +
    ' | discount ' + oldDiscount + ' → ' + newDiscount,
  );

  if (apply) {
    sales.updateOne(
      { _id: s._id },
      {
        $set: {
          status: 'COMPLETED',
          total: newTotal,
          discount: newDiscount,
          balanceDue: 0,
        },
      },
    );
    migrated++;
  }
}

print('---');
print('Total saldo no cobrado descontado: ' + totalSaldoDescontado);
if (apply) {
  print('✅ Ventas migradas a COMPLETED: ' + migrated);
} else {
  print('Dry-run: no se escribió nada. Re-ejecutá con --eval "var APPLY=true" para aplicar.');
}
print('==========================================================');
