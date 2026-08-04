/**
 * Migración al modelo de HORARIOS LIBRES (agosto 2026).
 *
 * Antes: las mesas se bloqueaban por turno (slot.shift = 'T1'/'T2') y las
 * sesiones se identificaban por (experienceId, dateKey, shiftKey).
 *
 * Ahora: las mesas se bloquean por intervalo (startAt–busyUntil, donde
 * busyUntil = endAt + limpieza) y las sesiones por (experienceId, dateKey,
 * startKey 'HH:mm'). Los turnos quedan como sugerencia.
 *
 * Qué hace:
 *  1. day_occupancy: a cada slot le completa startAt/endAt (si le faltan, usa
 *     los límites de su turno viejo) y calcula busyUntil = endAt + limpieza.
 *     Los bloqueos manuales (sin reservationId) no suman limpieza.
 *  2. experience_sessions: a cada sesión con dateKey le calcula startKey
 *     ('HH:mm' local de startAt).
 *  3. Droppea el índice único viejo (experienceId, dateKey, shiftKey) y crea
 *     el nuevo (experienceId, dateKey, startKey).
 *
 * Idempotente: los slots/sesiones ya migrados se saltean.
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/migrate-free-times.js            -> dry-run
 *   node scripts/migrate-free-times.js --apply    -> escribe de verdad
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

const TZ_OFFSET_MINUTES = -180; // America/Argentina/Buenos_Aires (sin DST)
const CLEANING_MINUTES = Number(process.env.CLEANING_BUFFER_MINUTES || 10);

/** Turnos del modelo viejo, para slots sin horas. */
const LEGACY_SHIFTS = {
  T1: { start: '15:00', end: '17:30' },
  T2: { start: '17:50', end: '20:00' },
};

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

/** Instante absoluto de 'YYYY-MM-DD' + 'HH:mm' en hora de Argentina. */
function atLocal(dateKey, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const utcMinutes = h * 60 + m - TZ_OFFSET_MINUTES;
  const base = new Date(`${dateKey}T00:00:00.000Z`);
  return new Date(base.getTime() + utcMinutes * 60_000);
}

/** 'HH:mm' local (AR) de un Date. */
function localHHmm(date) {
  const shifted = new Date(date.getTime() + TZ_OFFSET_MINUTES * 60_000);
  const h = String(shifted.getUTCHours()).padStart(2, '0');
  const m = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

async function migrateOccupancy(db) {
  const col = db.collection('day_occupancy');
  const days = await col.find({}).toArray();
  let touchedDays = 0;
  let touchedSlots = 0;
  let skipped = 0;

  for (const day of days) {
    const slots = day.slots || [];
    let changed = false;

    for (const slot of slots) {
      if (slot.busyUntil) {
        skipped++;
        continue; // ya migrado
      }

      let startAt = slot.startAt ? new Date(slot.startAt) : null;
      let endAt = slot.endAt ? new Date(slot.endAt) : null;

      // Bloqueo manual o slot viejo sin horas: usar el rango del turno.
      if (!startAt || !endAt || startAt.getTime() === endAt.getTime()) {
        const legacy = LEGACY_SHIFTS[slot.shift] || {
          start: '15:00',
          end: '20:00',
        };
        if (!startAt) startAt = atLocal(day.date, legacy.start);
        if (!endAt || (slot.startAt && String(slot.startAt) === String(slot.endAt))) {
          endAt = atLocal(day.date, legacy.end);
        }
      }

      const isBlock = !slot.reservationId;
      const busyUntil = isBlock
        ? endAt
        : new Date(endAt.getTime() + CLEANING_MINUTES * 60_000);

      console.log(
        `  [SLOT] ${day.date} ${String(slot.table).padEnd(3)} ` +
          `${slot.shift || '--'} → ${localHHmm(startAt)}-${localHHmm(endAt)}` +
          `${isBlock ? ' (bloqueo)' : ` +${CLEANING_MINUTES}m limpieza`}`,
      );

      slot.startAt = startAt;
      slot.endAt = endAt;
      slot.busyUntil = busyUntil;
      changed = true;
      touchedSlots++;
    }

    if (changed) {
      touchedDays++;
      if (APPLY) {
        await col.updateOne({ _id: day._id }, { $set: { slots } });
      }
    }
  }
  console.log(
    `\nday_occupancy: ${touchedSlots} slots migrados en ${touchedDays} días (${skipped} ya estaban).`,
  );
}

async function migrateSessions(db) {
  const col = db.collection('experience_sessions');
  const sessions = await col
    .find({ dateKey: { $type: 'string' }, startKey: { $exists: false } })
    .toArray();

  for (const s of sessions) {
    const startKey = localHHmm(new Date(s.startAt));
    console.log(
      `  [SESSION] ${s.dateKey} ${s.shiftKey || '--'} ${s.experienceName} → startKey ${startKey}`,
    );
    if (APPLY) {
      await col.updateOne({ _id: s._id }, { $set: { startKey } });
    }
  }
  console.log(`\nexperience_sessions: ${sessions.length} sesiones migradas.`);

  // Índices: fuera el único viejo por shiftKey, adentro el nuevo por startKey.
  const indexes = await col.indexes();
  const old = indexes.find(
    (i) =>
      i.key &&
      i.key.experienceId === 1 &&
      i.key.dateKey === 1 &&
      i.key.shiftKey === 1,
  );
  if (old) {
    console.log(`Índice viejo encontrado: ${old.name}`);
    if (APPLY) {
      await col.dropIndex(old.name);
      console.log('  → droppeado.');
    }
  } else {
    console.log('Índice viejo (shiftKey) no está: nada que droppear.');
  }
  if (APPLY) {
    await col.createIndex(
      { experienceId: 1, dateKey: 1, startKey: 1 },
      {
        unique: true,
        partialFilterExpression: { startKey: { $type: 'string' } },
      },
    );
    console.log('Índice nuevo (startKey) creado.');
  }
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
  console.log(`Limpieza por reserva: ${CLEANING_MINUTES} min`);
  console.log('==========================================================');

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();
    console.log('DB: ' + db.databaseName + '\n');
    await migrateOccupancy(db);
    console.log('');
    await migrateSessions(db);
    console.log('\nListo.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
