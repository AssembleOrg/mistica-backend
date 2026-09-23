/**
 * Seed de las PLANTILLAS DE TURNO (colección `shift_templates`).
 *
 * Son los bloques fijos del día. El equipo los define UNA VEZ y después no
 * carga más turnos a mano: el turno concreto de cada (experiencia, día, bloque)
 * se crea solo la primera vez que alguien reserva ahí. Los turnos no son de una
 * experiencia: en un mismo bloque conviven reservas de experiencias distintas,
 * porque lo que se comparte es el salón (las mesas).
 *
 * Sin `weekday` la plantilla aplica a todos los días. Con `experienceIds` vacío
 * la acepta cualquier experiencia reservable.
 *
 * Idempotente: upsert por (key, weekday).
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/seed-shift-templates.js            -> dry-run
 *   node scripts/seed-shift-templates.js --apply    -> escribe de verdad
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

/** Debe coincidir con el default de la env SHIFTS. */
const TEMPLATES = [
  { key: 'T1', name: 'Turno 1', start: '15:00', end: '17:30', order: 1 },
  { key: 'T2', name: 'Turno 2', start: '17:40', end: '20:00', order: 2 },
];

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
  console.log('==========================================================\n');

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();
    const col = db.collection('shift_templates');

    let inserted = 0;
    let updated = 0;
    for (const t of TEMPLATES) {
      const existing = await col.findOne({ key: t.key, weekday: null });
      console.log(
        `  [${existing ? 'UPDATE' : 'INSERT'}] ${t.key} · ${t.name} · ${t.start}–${t.end} · todos los días`,
      );
      if (!APPLY) continue;
      const now = new Date();
      await col.updateOne(
        { key: t.key, weekday: null },
        {
          $set: {
            ...t,
            weekday: null,
            experienceIds: [],
            active: true,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
      if (existing) updated++;
      else inserted++;
    }

    if (APPLY) {
      await col.createIndex({ key: 1, weekday: 1 }, { unique: true });
      await col.createIndex({ active: 1, order: 1 });
      // Índice que hace idempotente la creación automática de turnos.
      await db.collection('experience_sessions').createIndex(
        { experienceId: 1, dateKey: 1, shiftKey: 1 },
        { unique: true, partialFilterExpression: { dateKey: { $type: 'string' } } },
      );
      console.log(`\n✔ ${inserted} insertadas, ${updated} actualizadas.`);
      console.log('✔ Índices de shift_templates y experience_sessions creados.');
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
