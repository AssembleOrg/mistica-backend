/**
 * One-off CORRECTIVO: las 9 ventas que se migraron con migrate-sena-to-pending
 * quedaron con el saldo registrado como DESCUENTO (discount > 0) y el subtotal
 * en el precio de lista original. El criterio definitivo es "precio libre": la
 * cuenta queda saldada al monto cobrado, SIN descuento ni leyenda.
 *
 * Para cada una de las ventas listadas:
 *   total       = (se mantiene; ya es lo cobrado)
 *   subtotal    = total
 *   discount    = 0
 *   balanceDue  = 0
 *   items[]     = reescalados para sumar `total` (proporcional al subtotal
 *                 actual; el último absorbe el redondeo; unitPrice = share/qty;
 *                 bonifiedQty = 0). Igual que rescaleItemsToTotal del backend.
 *
 * Targeting por saleNumber (las 9 exactas que migró el script anterior) para no
 * tocar ventas con descuentos legítimos. Idempotente (re-correrlo deja lo mismo).
 *
 * Uso:
 *   mongosh "<DATABASE_URL>" scripts/fix-sena-clean-no-discount.mongo.js
 *   mongosh "<DATABASE_URL>" --eval "var APPLY=true" scripts/fix-sena-clean-no-discount.mongo.js
 */

const apply = (typeof APPLY !== 'undefined' && APPLY === true);

print(apply ? '⚠️  MODO APPLY (se va a escribir)' : 'Modo dry-run (definí APPLY=true para escribir)');
print('DB: ' + db.getName());
print('==========================================================');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function rescaleItems(items, target) {
  const list = items || [];
  const itemsSum = list.reduce(function (acc, it) { return acc + (it.subtotal || 0); }, 0);
  const n = list.length;
  let allocated = 0;
  return list.map(function (it, idx) {
    const isLast = idx === n - 1;
    let share;
    if (isLast) {
      share = round2(target - allocated);
    } else {
      share = itemsSum > 0 ? round2((it.subtotal / itemsSum) * target) : round2(target / n);
      allocated = round2(allocated + share);
    }
    const qty = it.quantity || 1;
    return Object.assign({}, it, {
      subtotal: share,
      unitPrice: round2(share / qty),
      bonifiedQty: 0,
    });
  });
}

const targetNumbers = [
  'V-2026-0602-001',
  'V-2026-0602-003',
  'V-2026-0602-004',
  'V-2026-0602-005',
  'V-2026-0603-001',
  'V-2026-0603-002',
  'V-2026-0603-003',
  'V-2026-0603-004',
  'V-2026-0603-013',
];

const sales = db.getCollection('sales');
const docs = sales.find({ saleNumber: { $in: targetNumbers } }).toArray();
print('Ventas encontradas: ' + docs.length + ' de ' + targetNumbers.length);
print('---');

let fixed = 0;
for (const s of docs) {
  const total = round2(s.total || 0);
  const newItems = rescaleItems(s.items, total);
  const itemsResumen = newItems
    .map(function (it) { return it.productName + ' $' + it.subtotal; })
    .join(', ');

  print(
    s.saleNumber +
    ' | discount ' + (s.discount || 0) + ' → 0' +
    ' | subtotal ' + (s.subtotal || 0) + ' → ' + total +
    ' | total ' + total + ' (sin cambio)' +
    ' | items: [' + itemsResumen + ']',
  );

  if (apply) {
    sales.updateOne(
      { _id: s._id },
      {
        $set: {
          subtotal: total,
          discount: 0,
          balanceDue: 0,
          items: newItems,
        },
      },
    );
    fixed++;
  }
}

print('---');
if (apply) {
  print('✅ Ventas corregidas: ' + fixed);
} else {
  print('Dry-run: no se escribió nada. Re-ejecutá con --eval "var APPLY=true" para aplicar.');
}
print('==========================================================');
