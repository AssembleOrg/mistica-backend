/**
 * Resetea la BD a "cero" para un testeo limpio, conservando SOLO la colección
 * `users` (login). Vacía el CONTENIDO de todas las demás colecciones, pero NO
 * borra las colecciones ni sus índices: usa deleteMany({}), no drop().
 * La estructura de la base queda igual, solo sin documentos.
 *
 * No requiere instalar nada: reutiliza el driver `mongodb` que el backend ya
 * tiene (resuelto vía @nestjs/mongoose) y lee DATABASE_URL del .env del backend.
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/reset-demo-keep-users.js            -> dry-run (no borra, solo muestra)
 *   node scripts/reset-demo-keep-users.js --apply    -> borra de verdad (IRREVERSIBLE)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const KEEP = ['users'];

// --- Resolver el driver `mongodb` a través de @nestjs/mongoose (dep directa) ---
// pnpm con hoisting estricto no deja require('mongodb') desde un script suelto.
function loadMongoClient() {
  const nestMongoose = require.resolve('@nestjs/mongoose', {
    paths: [path.join(__dirname, '..')],
  });
  const mongodbPath = require.resolve('mongodb', { paths: [nestMongoose] });
  return require(mongodbPath).MongoClient;
}

// --- Leer DATABASE_URL parseando el .env a mano (sin dotenv) ---
function readDatabaseUrl() {
  const envPath = path.join(__dirname, '..', '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) {
      return m[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  throw new Error('No se encontró DATABASE_URL en ' + envPath);
}

function maskUrl(url) {
  return url.replace(/(:\/\/[^:]+:)([^@]+)(@)/, '$1****$3');
}

async function main() {
  const url = readDatabaseUrl();
  const MongoClient = loadMongoClient();

  console.log(
    APPLY
      ? '⚠️  MODO APPLY (se borrará el contenido)'
      : 'Modo dry-run (agregá --apply para borrar)',
  );
  console.log('URL: ' + maskUrl(url));
  console.log('Conservando (intactas): ' + KEEP.join(', '));
  console.log('==========================================================');

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();
    console.log('DB: ' + db.databaseName);

    const all = await db.listCollections({}, { nameOnly: true }).toArray();
    const cols = all
      .map((c) => c.name)
      .filter((n) => n.indexOf('system.') !== 0 && KEEP.indexOf(n) === -1)
      .sort();

    let total = 0;
    console.log('');
    console.log('Colecciones a vaciar (deleteMany, conserva índices):');
    for (const c of cols) {
      const n = await db.collection(c).countDocuments({});
      total += n;
      console.log('  ' + c + ': ' + n + (APPLY ? '  → borrando' : ''));
    }

    console.log('');
    for (const k of KEEP) {
      const exists = all.some((c) => c.name === k);
      const n = exists ? await db.collection(k).countDocuments({}) : 0;
      console.log(k + ' (CONSERVADA): ' + n + (exists ? '' : '  (no existe)'));
    }
    console.log('---');
    console.log('Total documentos a borrar: ' + total);

    if (APPLY) {
      console.log('');
      console.log('Aplicando borrado de contenido...');
      for (const c of cols) {
        const res = await db.collection(c).deleteMany({});
        console.log('  ' + c + ': borrados ' + res.deletedCount);
      }
    }

    console.log('');
    console.log('==========================================================');
    console.log(
      APPLY ? 'APPLY terminado.' : 'Dry-run terminado (nada se escribió).',
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
