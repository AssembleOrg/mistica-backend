/**
 * Backfill de `color` en experiencias de "Mística Auténtica".
 *
 * El color pasó a ser OBLIGATORIO en Experience (se usa para pintar la agenda).
 * Este script asigna un color de la paleta a cada experiencia que no tenga uno,
 * rotando la paleta en orden alfabético de nombre. Idempotente: no toca las
 * experiencias que ya tienen color.
 *
 * Reutiliza el driver `mongodb` del backend (vía @nestjs/mongoose) y lee
 * DATABASE_URL del .env del backend. No requiere instalar nada.
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/backfill-experience-colors.js            -> dry-run
 *   node scripts/backfill-experience-colors.js --apply    -> escribe de verdad
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

// Paleta de marca (misma que ofrece el picker del panel admin).
const PALETTE = [
  '#9d684e', // terracota
  '#455a54', // verde mística
  '#cc844a', // ocre
  '#7a8c5c', // oliva
  '#4a7a8c', // petróleo
  '#8c6f9d', // lavanda
  '#c47a6d', // arcilla rosada
  '#c2a24b', // mostaza
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
      ? '⚠️  MODO APPLY (se escribirá en la base)'
      : 'Modo dry-run (agregá --apply para escribir)',
  );
  console.log('URL: ' + maskUrl(url));
  console.log('==========================================================');

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();
    const col = db.collection('experiences');
    console.log('DB: ' + db.databaseName);
    console.log('');

    const pending = await col
      .find({
        $or: [{ color: { $exists: false } }, { color: null }, { color: '' }],
      })
      .sort({ name: 1 })
      .toArray();

    if (pending.length === 0) {
      console.log('Todas las experiencias ya tienen color. Nada que hacer.');
      return;
    }

    let i = 0;
    for (const exp of pending) {
      const color = PALETTE[i % PALETTE.length];
      i += 1;
      console.log(`${color}  ${exp.name}${exp.deletedAt ? ' (baja)' : ''}`);
      if (APPLY) {
        await col.updateOne(
          { _id: exp._id },
          { $set: { color, updatedAt: new Date() } },
        );
      }
    }

    console.log('');
    console.log(
      APPLY
        ? `Listo: ${pending.length} experiencia(s) actualizadas.`
        : `Dry-run: ${pending.length} experiencia(s) quedarían con color. Corré con --apply.`,
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
