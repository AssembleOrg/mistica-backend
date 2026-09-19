/**
 * One-off: actualiza el índice único parcial de `conversations` para que las
 * charlas del bot (status 'BOT') también cuenten como "vivas".
 *
 * Antes: única viva por teléfono = status ∈ {WAITING, HUMAN}.
 * Ahora: única viva por teléfono = status ∈ {BOT, WAITING, HUMAN}.
 *
 * Mongoose NO reemplaza un índice cuya clave ya existe con otras opciones, así
 * que hay que dropear el viejo (mismo key {phone:1,status:1}) y recrearlo con
 * el partialFilter nuevo. Correr JUNTO al deploy del backend nuevo.
 *
 * Uso:
 *   mongosh "<DATABASE_URL>" scripts/migrate-conversation-bot-index.mongo.js
 *   mongosh "<DATABASE_URL>" --eval "var APPLY=true" scripts/migrate-conversation-bot-index.mongo.js
 *
 * Idempotente: si el índice nuevo ya está, no hace nada.
 */

const apply = typeof APPLY !== 'undefined' && APPLY === true;

print(apply ? '⚠️  MODO APPLY' : 'Modo dry-run (definí APPLY=true para escribir)');
print('DB: ' + db.getName());
print('==========================================================');

const coll = db.getCollection('conversations');
const NEW_NAME = 'phone_1_status_1';
const NEW_PARTIAL = { status: { $in: ['BOT', 'WAITING', 'HUMAN'] } };

const indexes = coll.getIndexes();
const existing = indexes.find(
  (ix) => JSON.stringify(ix.key) === JSON.stringify({ phone: 1, status: 1 }),
);

function samePartial(ix) {
  return (
    ix &&
    ix.partialFilterExpression &&
    JSON.stringify(ix.partialFilterExpression) === JSON.stringify(NEW_PARTIAL)
  );
}

if (samePartial(existing)) {
  print('✓ El índice ya tiene el partialFilter nuevo — nada que hacer.');
} else {
  if (existing) {
    print('• Índice viejo encontrado: ' + existing.name);
    print('  partialFilter actual: ' + JSON.stringify(existing.partialFilterExpression || {}));
    if (apply) {
      coll.dropIndex(existing.name);
      print('  → dropeado');
    } else {
      print('  → (dry-run) se dropearía');
    }
  } else {
    print('• No hay índice previo {phone:1,status:1} — sólo se crea el nuevo.');
  }

  if (apply) {
    coll.createIndex(
      { phone: 1, status: 1 },
      { unique: true, partialFilterExpression: NEW_PARTIAL, name: NEW_NAME },
    );
    print('  → creado ' + NEW_NAME + ' con partialFilter ' + JSON.stringify(NEW_PARTIAL));
  } else {
    print('  → (dry-run) se crearía ' + NEW_NAME);
  }
}

print('==========================================================');
print(apply ? '✅ Listo.' : 'Dry-run terminado. Nada se escribió.');
