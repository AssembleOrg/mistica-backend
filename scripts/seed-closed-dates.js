/**
 * Seed de "días cerrados" para "Mística Auténtica".
 * Inserta/actualiza la colección `closed_dates`. Idempotente:
 *   - WEEKLY: upsert por {kind, weekday}.
 *   - DATE:   upsert por {kind, from, to}.
 * Correrlo dos veces no duplica.
 *
 * Reutiliza el driver `mongodb` del backend (vía @nestjs/mongoose) y lee
 * DATABASE_URL del .env del backend. No requiere instalar nada.
 *
 * Argentina no usa horario de verano ⇒ los días se acotan con offset fijo
 * -03:00, igual que como los guarda el backend (inicio/fin del día en su TZ).
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/seed-closed-dates.js            -> dry-run (muestra, no escribe)
 *   node scripts/seed-closed-dates.js --apply    -> escribe de verdad
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

const WEEKDAY_LABEL = {
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
  7: 'domingo',
};

// Inicio (00:00) y fin (23:59:59.999) del día en hora Argentina (UTC-3).
const dayStart = (ymd) => new Date(`${ymd}T00:00:00.000-03:00`);
const dayEnd = (ymd) => new Date(`${ymd}T23:59:59.999-03:00`);

// Reglas a sembrar. Los horarios del local son martes a domingo ⇒ el LUNES
// queda cerrado de forma recurrente. Más feriados de ejemplo (ajustá a gusto).
const RULES = [
  {
    kind: 'WEEKLY',
    weekday: 1, // lunes (1=lunes … 7=domingo, ISO)
    reason: 'Día de descanso (abrimos martes a domingo)',
  },
  {
    kind: 'DATE',
    from: '2026-12-24',
    to: '2026-12-26',
    reason: 'Fiestas (Navidad)',
  },
  {
    kind: 'DATE',
    from: '2026-12-31',
    to: '2027-01-01',
    reason: 'Fiestas (Año Nuevo)',
  },
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

function describe(r) {
  if (r.kind === 'WEEKLY') return `Todos los ${WEEKDAY_LABEL[r.weekday]}`;
  return r.from === r.to ? r.from : `${r.from} al ${r.to}`;
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
  console.log('Reglas a sembrar: ' + RULES.length);
  console.log('==========================================================');

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();
    const col = db.collection('closed_dates');
    console.log('DB: ' + db.databaseName);
    console.log('');

    let inserted = 0;
    let skipped = 0;
    for (const r of RULES) {
      const query =
        r.kind === 'WEEKLY'
          ? { kind: 'WEEKLY', weekday: r.weekday, deletedAt: { $exists: false } }
          : {
              kind: 'DATE',
              from: dayStart(r.from),
              to: dayEnd(r.to),
              deletedAt: { $exists: false },
            };

      const existing = await col.findOne(query);
      const tag = existing ? 'SKIP (ya existe)' : 'INSERT';
      console.log(
        `  [${tag}] ${describe(r)}` + (r.reason ? `  · ${r.reason}` : ''),
      );

      if (!APPLY || existing) {
        if (existing) skipped++;
        continue;
      }

      const now = new Date();
      const doc =
        r.kind === 'WEEKLY'
          ? { kind: 'WEEKLY', weekday: r.weekday, reason: r.reason }
          : {
              kind: 'DATE',
              from: dayStart(r.from),
              to: dayEnd(r.to),
              reason: r.reason,
            };
      doc.createdAt = now;
      doc.updatedAt = now;
      await col.insertOne(doc);
      inserted++;
    }

    console.log('');
    console.log('---');
    if (APPLY) {
      console.log('Insertadas: ' + inserted + ' · Ya existían: ' + skipped);
    } else {
      console.log('Dry-run: nada escrito. Corré con --apply para aplicar.');
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
