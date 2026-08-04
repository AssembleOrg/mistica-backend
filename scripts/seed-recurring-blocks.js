/**
 * Seed de los BLOQUEOS FIJOS semanales (colección `recurring_blocks`).
 *
 * Agenda real del cliente (agosto 2026). Ambas actividades usan la mesa
 * grande G1 (la "mesa de taller" de 10 lugares); se puede cambiar desde el
 * panel de Bloqueos fijos.
 *
 * Taller de cerámica:
 *   martes 18:00–20:00 · miércoles 15:30–17:30 · jueves 15:30–17:30 y
 *   18:00–20:00 · viernes 15:30–17:30 y 18:00–20:00
 * Escuelita (colonia):
 *   miércoles 18:00–19:45
 *
 * Idempotente: upsert por (label, weekday, start). NO toca reservas.
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/seed-recurring-blocks.js            -> dry-run
 *   node scripts/seed-recurring-blocks.js --apply    -> escribe de verdad
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

// Día ISO: 1=lunes … 7=domingo.
const BLOCKS = [
  { label: 'Taller de cerámica', weekday: 2, start: '18:00', end: '20:00' },
  { label: 'Taller de cerámica', weekday: 3, start: '15:30', end: '17:30' },
  { label: 'Taller de cerámica', weekday: 4, start: '15:30', end: '17:30' },
  { label: 'Taller de cerámica', weekday: 4, start: '18:00', end: '20:00' },
  { label: 'Taller de cerámica', weekday: 5, start: '15:30', end: '17:30' },
  { label: 'Taller de cerámica', weekday: 5, start: '18:00', end: '20:00' },
  { label: 'Escuelita (colonia)', weekday: 3, start: '18:00', end: '19:45' },
].map((b) => ({ ...b, tableCodes: ['G1'], active: true }));

const DIAS = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

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

  console.log(
    APPLY
      ? '⚠️  MODO APPLY (se escribirá en la base)'
      : 'Modo dry-run (agregá --apply para escribir)',
  );
  console.log('URL: ' + maskUrl(url));
  console.log(`Bloqueos fijos a sembrar: ${BLOCKS.length}`);
  console.log('==========================================================');

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();
    const col = db.collection('recurring_blocks');
    console.log('DB: ' + db.databaseName + '\n');

    let inserted = 0;
    let updated = 0;
    for (const b of BLOCKS) {
      const key = { label: b.label, weekday: b.weekday, start: b.start };
      const existing = await col.findOne({
        ...key,
        deletedAt: { $exists: false },
      });
      console.log(
        `  [${existing ? 'UPDATE' : 'INSERT'}] ${DIAS[b.weekday]} ${b.start}–${b.end}  ${b.label} (${b.tableCodes.join(', ')})`,
      );
      if (!APPLY) continue;
      const now = new Date();
      await col.updateOne(
        key,
        {
          $set: { ...b, updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
      if (existing) updated++;
      else inserted++;
    }

    if (APPLY) {
      await col.createIndex({ weekday: 1, active: 1 });
      console.log(`\nListo: ${inserted} nuevos, ${updated} actualizados.`);
    } else {
      console.log('\nDry-run: no se escribió nada.');
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
