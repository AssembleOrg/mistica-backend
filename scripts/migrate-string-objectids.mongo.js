/**
 * Migra documentos cuyos campos referenciales quedaron como string en vez de
 * ObjectId. Causa raíz documentada en mongoose-objectid-cast-bug (las @Schema
 * usaban Types.ObjectId en vez de SchemaTypes.ObjectId; ya está corregido).
 *
 * Uso (mongosh):
 *   mongosh "<DATABASE_URL>" scripts/migrate-string-objectids.mongo.js
 *   mongosh "<DATABASE_URL>" --eval "var APPLY=true" scripts/migrate-string-objectids.mongo.js
 *
 * También se puede pegar el contenido en la pestaña Script de Compass / Studio 3T.
 *
 * Por default es dry-run. Definí APPLY=true (o pasá --eval "var APPLY=true")
 * para escribir.
 */

const TARGETS = [
  { collection: 'prepaids',      fields: ['clientId'] },
  { collection: 'sales',         fields: ['clientId', 'prepaidId'] },
  { collection: 'cash_sessions', fields: ['openedByUserId', 'closedByUserId'] },
  { collection: 'audit_logs',    fields: ['userId'] },
  { collection: 'egresses',      fields: ['userId'] },
  { collection: 'credit_notes',  fields: ['saleId', 'issuedByUserId'] },
];

const apply = (typeof APPLY !== 'undefined' && APPLY === true);

print(apply ? '⚠️  MODO APPLY' : 'Modo dry-run (definí APPLY=true para escribir)');
print('DB: ' + db.getName());
print('---');

let total = 0;

for (const { collection, fields } of TARGETS) {
  const col = db.getCollection(collection);
  for (const field of fields) {
    const docs = col.find({ [field]: { $type: 'string' } }, { _id: 1, [field]: 1 }).toArray();
    if (docs.length === 0) {
      print('✓ ' + collection + '.' + field + ': 0 docs con string');
      continue;
    }

    const valid = docs.filter(function (d) { return ObjectId.isValid(d[field]); });
    const invalid = docs.length - valid.length;

    print('→ ' + collection + '.' + field + ': ' + docs.length + ' docs con string (' +
      valid.length + ' válidos' + (invalid ? ', ' + invalid + ' INVÁLIDOS — se omiten' : '') + ')');

    if (!apply) continue;

    const ops = valid.map(function (d) {
      return {
        updateOne: {
          filter: { _id: d._id },
          update: { $set: { [field]: new ObjectId(d[field]) } },
        },
      };
    });

    if (ops.length > 0) {
      const res = col.bulkWrite(ops, { ordered: false });
      total += res.modifiedCount;
      print('   migrados: ' + res.modifiedCount + '/' + ops.length);
    }
  }
}

print('---');
print(apply ? ('Total migrados: ' + total) : 'Dry-run terminado.');
