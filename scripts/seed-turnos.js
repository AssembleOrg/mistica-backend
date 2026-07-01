/**
 * Seed de TURNOS (experience_sessions) para "Mística Auténtica".
 * Crea al menos 2 turnos futuros OPEN por cada experiencia RESERVABLE
 * (bookableOnline !== false, activa, no borrada). Las coordinadas se saltean
 * (no tienen turnos online). Pensado para tener datos con qué probar el flujo.
 *
 * Reutiliza el driver `mongodb` del backend y lee DATABASE_URL del .env. No
 * instala nada. Idempotente: no duplica un turno que ya exista para la misma
 * experiencia + fecha/hora exacta.
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/seed-turnos.js            -> dry-run (no escribe)
 *   node scripts/seed-turnos.js --apply    -> escribe de verdad
 *
 * Las fechas son días hábiles próximos (evita lunes, que el local cierra). Los
 * horarios/cupos salen de cada experiencia; editá o borrá turnos desde el panel.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

// Zona del negocio: GMT-3 fijo (sin horario de verano). El backend guarda UTC;
// para un horario local H convertimos a UTC sumando 3 h.
const AR_OFFSET_HOURS = 3;

// Turnos a crear por experiencia: días hacia adelante + hora local (24h).
const SLOTS = [
  { daysAhead: 4, hour: 18 },
  { daysAhead: 11, hour: 20 },
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

// Componentes de fecha (año/mes/día) en hora AR, `daysAhead` días desde hoy.
function arDateParts(daysAhead) {
  const nowAr = new Date(Date.now() - AR_OFFSET_HOURS * 3600 * 1000);
  nowAr.setUTCDate(nowAr.getUTCDate() + daysAhead);
  return {
    y: nowAr.getUTCFullYear(),
    m: nowAr.getUTCMonth(),
    d: nowAr.getUTCDate(),
  };
}

// Date (UTC) para un horario local AR. Si cae lunes (local cerrado), corre al
// martes. Devuelve un Date que representa {y-m-d hour:00} hora de Argentina.
function arStartAt(daysAhead, hour) {
  let { y, m, d } = arDateParts(daysAhead);
  // getUTCDay del mediodía local evita cruces de día por la conversión.
  const weekday = new Date(Date.UTC(y, m, d, 12)).getUTCDay(); // 0=dom,1=lun
  if (weekday === 1) {
    const bumped = new Date(Date.UTC(y, m, d + 1, 12));
    y = bumped.getUTCFullYear();
    m = bumped.getUTCMonth();
    d = bumped.getUTCDate();
  }
  return new Date(Date.UTC(y, m, d, hour + AR_OFFSET_HOURS, 0, 0, 0));
}

function fmtAr(date) {
  const local = new Date(date.getTime() - AR_OFFSET_HOURS * 3600 * 1000);
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const yy = local.getUTCFullYear();
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mi = String(local.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mi} hs`;
}

function isReservable(exp) {
  const active = exp.isActive !== false;
  const notDeleted = exp.deletedAt == null;
  const bookable = exp.bookableOnline !== false;
  return active && notDeleted && bookable;
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
    const experiences = db.collection('experiences');
    const sessionsCol = db.collection('experience_sessions');
    console.log('DB: ' + db.databaseName + '\n');

    const all = await experiences.find({}).toArray();
    const reservables = all.filter(isReservable);
    const coordinadas = all.filter((e) => !isReservable(e));

    console.log(
      `Experiencias: ${all.length} total · ${reservables.length} reservables · ` +
        `${coordinadas.length} coordinadas/inactivas (se saltean)`,
    );
    if (coordinadas.length) {
      for (const e of coordinadas) console.log('  [skip] ' + e.name);
    }
    console.log('');

    let inserted = 0;
    let skipped = 0;
    const now = new Date();

    for (const exp of reservables) {
      console.log('• ' + exp.name);
      const duration = Number(exp.durationMinutes) || 120;
      const price = Number(exp.basePrice) || 0;
      const depositPct =
        exp.depositPct == null ? 50 : Number(exp.depositPct);
      const capacity = Number(exp.defaultCapacity) || 8;

      for (const slot of SLOTS) {
        const startAt = arStartAt(slot.daysAhead, slot.hour);
        const endAt = new Date(startAt.getTime() + duration * 60 * 1000);

        const dup = await sessionsCol.findOne({
          experienceId: exp._id,
          startAt,
          deletedAt: null,
        });
        if (dup) {
          console.log('    [dup ] ' + fmtAr(startAt) + ' (ya existe)');
          skipped++;
          continue;
        }

        console.log(
          '    [' +
            (APPLY ? 'INSERT' : 'plan') +
            '] ' +
            fmtAr(startAt) +
            ` · ${capacity} lugares · $${price} p/p · seña ${depositPct}%`,
        );

        if (!APPLY) continue;

        await sessionsCol.insertOne({
          experienceId: exp._id,
          experienceName: exp.name,
          durationMinutes: duration,
          price,
          depositPct,
          startAt,
          endAt,
          capacity,
          seatsTaken: 0,
          status: 'OPEN',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        inserted++;
      }
    }

    console.log('\n---');
    if (APPLY) {
      console.log('Turnos insertados: ' + inserted + ' · ya existentes: ' + skipped);
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
