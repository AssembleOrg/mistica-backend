/**
 * Seed de las MESAS del salón (colección `tables`).
 *
 * El salón tiene 10 mesas de 2 personas (M1..M10) y 2 mesas grandes de 10
 * (G1, G2). Las mesas se mueven y se unen, así que no se guarda posición: sólo
 * cuántas hay, de qué tipo y en qué orden se asignan.
 *
 * Idempotente: upsert por `code`. NO toca ocupación ni reservas.
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/seed-tables.js            -> dry-run (muestra, no escribe)
 *   node scripts/seed-tables.js --apply    -> escribe de verdad
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

const SMALL_COUNT = 10;
const LARGE_COUNT = 2;

/** M1..M10 primero (se llenan antes), después G1 y G2. */
function buildTables() {
  const tables = [];
  for (let i = 1; i <= SMALL_COUNT; i++) {
    tables.push({ code: `M${i}`, kind: 'SMALL', seats: 2, order: i });
  }
  for (let i = 1; i <= LARGE_COUNT; i++) {
    tables.push({
      code: `G${i}`,
      kind: 'LARGE',
      seats: 10,
      order: 100 + i,
    });
  }
  return tables;
}

function loadMongoClient() {
  const nestMongoose = require.resolve('@nestjs/mongoose', {
    paths: [path.join(__dirname, '..')],
  });
  const mongodbPath = require.resolve('mongodb', { paths: [nestMongoose] });
  return require(mongodbPath).MongoClient;
}

function readDatabaseUrl() {
  const envPath = path.join(__dirname, '..', '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
  }
  throw new Error('No se encontró DATABASE_URL en ' + envPath);
}

function maskUrl(url) {
  return url.replace(/(:\/\/[^:]+:)([^@]+)(@)/, '$1****$3');
}

async function main() {
  const url = readDatabaseUrl();
  const MongoClient = loadMongoClient();
  const TABLES = buildTables();

  console.log(
    APPLY
      ? '⚠️  MODO APPLY (se escribirá en la base)'
      : 'Modo dry-run (agregá --apply para escribir)',
  );
  console.log('URL: ' + maskUrl(url));
  console.log(
    `Mesas a sembrar: ${TABLES.length} (${SMALL_COUNT} de 2 + ${LARGE_COUNT} grandes)`,
  );
  console.log('==========================================================');

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();
    const col = db.collection('tables');
    console.log('DB: ' + db.databaseName + '\n');

    let inserted = 0;
    let updated = 0;
    for (const t of TABLES) {
      const existing = await col.findOne({ code: t.code });
      console.log(
        `  [${existing ? 'UPDATE' : 'INSERT'}] ${t.code.padEnd(3)} ${t.kind.padEnd(5)} ${t.seats} lugares`,
      );
      if (!APPLY) continue;
      const now = new Date();
      await col.updateOne(
        { code: t.code },
        {
          $set: { ...t, active: true, updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
      if (existing) updated++;
      else inserted++;
    }

    if (APPLY) {
      await col.createIndex({ code: 1 }, { unique: true });
      await col.createIndex({ active: 1, order: 1 });
      // La ocupación diaria necesita el único por fecha para que la asignación
      // atómica no pueda duplicar el documento del día.
      await db
        .collection('day_occupancy')
        .createIndex({ date: 1 }, { unique: true });
      await db
        .collection('day_occupancy')
        .createIndex({ 'slots.reservationId': 1 });
      console.log(`\n✔ ${inserted} insertadas, ${updated} actualizadas.`);
      console.log('✔ Índices de tables y day_occupancy creados.');
    } else {
      console.log('\nDry-run: no se escribió nada.');
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
