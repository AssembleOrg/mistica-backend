/**
 * Backfill del TALLER regular (2026-07): la mesa grande del taller ocupa SÍ o SÍ
 * 10 lugares del salón (de los 40), aunque haya menos inscriptos. Además el
 * taller pasa a dictarse de MARTES a VIERNES en dos franjas (15:30–17:30 y
 * 18:00–20:00) y los próximos cupos abren en agosto.
 *
 * Qué hace:
 *  1. Setea `venueSeats: 10` en la experiencia "Taller mensual de cerámica".
 *     Si NO existe (el seed de coordinados nunca corrió en esa base), la CREA
 *     como servicio coordinado (bookableOnline=false).
 *  2. Actualiza su `description` con la nueva recurrencia/franjas.
 *  3. Propaga `venueSeats: 10` a sus turnos FUTUROS no borrados (snapshot).
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/set-taller-venue-seats.js            -> dry-run (no escribe)
 *   node scripts/set-taller-venue-seats.js --apply    -> escribe de verdad
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

const TALLER_NAME = 'Taller mensual de cerámica';
const VENUE_SEATS = 10;
const NEW_DESCRIPTION =
  'Cursada mensual en grupos reducidos, de martes a viernes en dos franjas: ' +
  '15:30 a 17:30 h o 18:00 a 20:00 h. Los próximos cupos se abren a partir de ' +
  'agosto: dejanos tu nombre, un teléfono de contacto, qué día te queda más ' +
  'cómodo y qué franja preferís, y apenas se liberen te contactamos con ' +
  'prioridad según la disponibilidad que nos indiques. La primera clase es de ' +
  'prueba y gratis (se reserva con anticipación). Cuota mensual $65.000 ' +
  '(efectivo/transferencia). Seña 50% + saldo antes del día 10. Coordinamos por acá.';

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
    const experiences = db.collection('experiences');
    const sessions = db.collection('experience_sessions');

    let exp = await experiences.findOne({
      name: TALLER_NAME,
      deletedAt: { $exists: false },
    });
    if (!exp) {
      console.log(`La experiencia "${TALLER_NAME}" no existe: se va a CREAR (coordinada).`);
      if (APPLY) {
        const now = new Date();
        const doc = {
          name: TALLER_NAME,
          description: NEW_DESCRIPTION,
          durationMinutes: 120,
          basePrice: 65000,
          defaultCapacity: 10,
          depositPct: 50,
          color: '#9d684e',
          images: [],
          bookableOnline: false,
          venueSeats: VENUE_SEATS,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };
        const ins = await experiences.insertOne(doc);
        console.log(`✓ Experiencia creada (${ins.insertedId}).`);
        return;
      }
      console.log('\nDry-run: no se escribió nada. Correr con --apply.');
      return;
    }
    console.log(
      `Experiencia: ${exp.name} (${exp._id}) — venueSeats actual: ${exp.venueSeats ?? 0}`,
    );

    const futureFilter = {
      experienceId: exp._id,
      deletedAt: { $exists: false },
      endAt: { $gt: new Date() },
    };
    const futureCount = await sessions.countDocuments(futureFilter);
    console.log(`Turnos futuros a propagar: ${futureCount}`);

    if (!APPLY) {
      console.log('\nDry-run: no se escribió nada. Correr con --apply.');
      return;
    }

    await experiences.updateOne(
      { _id: exp._id },
      {
        $set: {
          venueSeats: VENUE_SEATS,
          description: NEW_DESCRIPTION,
          updatedAt: new Date(),
        },
      },
    );
    console.log(`✓ Experiencia actualizada (venueSeats=${VENUE_SEATS} + descripción).`);

    const res = await sessions.updateMany(futureFilter, {
      $set: { venueSeats: VENUE_SEATS, updatedAt: new Date() },
    });
    console.log(`✓ Turnos futuros actualizados: ${res.modifiedCount}.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exitCode = 1;
});
