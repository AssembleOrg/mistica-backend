/**
 * Migración al modelo de TURNOS FIJOS + MESAS.
 *
 * Qué hace:
 *  1. Lleva a 120 min la duración de las experiencias reservables online (las
 *     de 180 min no entran en ningún turno de 150 min).
 *  2. Recalcula `durationMinutes` y `endAt` de los turnos ya generados de esas
 *     experiencias.
 *  3. Reporta los turnos que NO entran enteros en ningún bloque del día (una
 *     experiencia no puede cruzar de un turno al otro) para corregirlos a mano.
 *  4. Reporta reservas activas sin mesas asignadas (habría que asignarlas desde
 *     la agenda del admin).
 *  5. Reporta el estado del catálogo: experiencias legacy y `bookableOnline`
 *     sin definir. NO borra nada: la limpieza se decide a mano.
 *
 * NO toca `space_blocks` (queda para la fase de migración de bloqueos a mesas).
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/migrate-shift-model.js            -> dry-run
 *   node scripts/migrate-shift-model.js --apply    -> escribe de verdad
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

/** Duración objetivo de toda experiencia reservable online. */
const TARGET_DURATION = 120;

/** Turnos del día, en hora local. Debe coincidir con la env SHIFTS. */
const SHIFTS = [
  { key: 'T1', name: 'Turno 1', start: '15:00', end: '17:30' },
  { key: 'T2', name: 'Turno 2', start: '17:50', end: '20:00' },
];

const TZ = 'America/Argentina/Buenos_Aires';

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Minutos desde medianoche en hora del negocio. */
function localMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const m = Number(parts.find((p) => p.type === 'minute').value);
  return h * 60 + m;
}

function localDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Turno donde entra entera una actividad, o null. */
function resolveShift(startAt, durationMinutes) {
  const startMin = localMinutes(startAt);
  const endMin = startMin + durationMinutes;
  return (
    SHIFTS.find(
      (s) => startMin >= toMinutes(s.start) && endMin <= toMinutes(s.end),
    ) || null
  );
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

function hhmm(date) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
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
  console.log('Duración objetivo: ' + TARGET_DURATION + ' min');
  console.log('Turnos: ' + SHIFTS.map((s) => `${s.key} ${s.start}-${s.end}`).join(' · '));
  console.log('==========================================================\n');

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();
    const experiences = db.collection('experiences');
    const sessions = db.collection('experience_sessions');
    const reservations = db.collection('reservations');

    // ── 1. Duración de las experiencias reservables ──
    console.log('1) EXPERIENCIAS RESERVABLES CON DURACIÓN DISTINTA A ' + TARGET_DURATION);
    const toFix = await experiences
      .find({
        bookableOnline: true,
        durationMinutes: { $ne: TARGET_DURATION },
        deletedAt: { $exists: false },
      })
      .toArray();
    if (!toFix.length) console.log('   (ninguna)');
    for (const e of toFix) {
      console.log(`   ${e.durationMinutes} → ${TARGET_DURATION} min · ${e.name}`);
      if (APPLY) {
        await experiences.updateOne(
          { _id: e._id },
          { $set: { durationMinutes: TARGET_DURATION, updatedAt: new Date() } },
        );
      }
    }

    // ── 2. Turnos ya generados de esas experiencias ──
    console.log('\n2) TURNOS DE ESAS EXPERIENCIAS');
    const ids = toFix.map((e) => e._id);
    const affected = ids.length
      ? await sessions.find({ experienceId: { $in: ids } }).toArray()
      : [];
    console.log(`   ${affected.length} turnos a recalcular`);
    for (const s of affected) {
      const endAt = new Date(s.startAt.getTime() + TARGET_DURATION * 60_000);
      if (APPLY) {
        await sessions.updateOne(
          { _id: s._id },
          {
            $set: {
              durationMinutes: TARGET_DURATION,
              endAt,
              updatedAt: new Date(),
            },
          },
        );
      }
    }

    // ── 3. Turnos que no entran en ningún bloque del día ──
    console.log('\n3) TURNOS QUE NO ENTRAN EN NINGÚN BLOQUE DEL DÍA');
    const all = await sessions
      .find({ deletedAt: { $exists: false } })
      .sort({ startAt: 1 })
      .toArray();
    let bad = 0;
    for (const s of all) {
      // Después de la migración, las afectadas ya duran TARGET_DURATION.
      const dur = ids.some((id) => String(id) === String(s.experienceId))
        ? TARGET_DURATION
        : s.durationMinutes;
      if (resolveShift(s.startAt, dur)) continue;
      bad++;
      const future = s.startAt >= new Date() ? 'FUTURO' : 'pasado';
      console.log(
        `   [${future}] ${localDateKey(s.startAt)} ${hhmm(s.startAt)} · ${dur} min · ${s.experienceName} · estado ${s.status} · anotados ${s.seatsTaken}`,
      );
    }
    if (!bad) console.log('   (ninguno)');
    else
      console.log(
        `   ⚠ ${bad} turnos hay que reubicarlos a mano (o darlos de baja): no se pueden reservar así.`,
      );

    // ── 4. Reservas activas sin mesas ──
    console.log('\n4) RESERVAS ACTIVAS SIN MESAS ASIGNADAS');
    const orphan = await reservations
      .find({
        status: { $in: ['CONFIRMED', 'PENDING'] },
        deletedAt: { $exists: false },
        $or: [{ tableCodes: { $exists: false } }, { tableCodes: { $size: 0 } }],
      })
      .toArray();
    if (!orphan.length) console.log('   (ninguna)');
    for (const r of orphan) {
      console.log(
        `   ${r.code} · ${localDateKey(r.startAt)} ${hhmm(r.startAt)} · ${r.quantity} pers · ${r.experienceName}`,
      );
    }
    if (orphan.length)
      console.log(
        `   ⚠ ${orphan.length} reservas necesitan que se les asigne mesa desde la agenda del admin.`,
      );

    // ── 5. Estado del catálogo (sólo reporte) ──
    console.log('\n5) CATÁLOGO (reporte, no se toca nada)');
    const catalog = await experiences
      .find({ deletedAt: { $exists: false } })
      .sort({ name: 1 })
      .toArray();
    const sinFlag = catalog.filter((e) => e.bookableOnline === undefined);
    console.log(`   ${catalog.length} experiencias activas`);
    if (sinFlag.length) {
      console.log(
        `   ⚠ ${sinFlag.length} sin bookableOnline definido (docs viejos, el front las lee como no reservables):`,
      );
      for (const e of sinFlag) console.log(`      · ${e.name}`);
    }
    const dupes = new Map();
    for (const e of catalog) dupes.set(e.name, (dupes.get(e.name) || 0) + 1);
    for (const [name, n] of dupes) {
      if (n > 1) console.log(`   ⚠ nombre duplicado (${n} docs): ${name}`);
    }

    console.log(
      '\n' +
        (APPLY
          ? '✔ Migración aplicada.'
          : 'Dry-run: no se escribió nada. Agregá --apply para aplicar.'),
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
