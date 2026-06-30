/**
 * Seed de SERVICIOS COORDINADOS para "Mística Auténtica".
 * Son experiencias con `bookableOnline=false`: el bot/web NO generan turnos ni
 * cobran online; solo informan (desde la descripción/precio) y captan la consulta.
 * Inserta/actualiza la colección `experiences`. Idempotente: upsert por `name`.
 *
 * Reutiliza el driver `mongodb` del backend (vía @nestjs/mongoose) y lee
 * DATABASE_URL del .env del backend. No requiere instalar nada.
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/seed-coordinated-services.js            -> dry-run (no escribe)
 *   node scripts/seed-coordinated-services.js --apply    -> escribe de verdad
 *
 * Los datos (precios/horarios) son los publicados de referencia: revisalos y
 * editalos desde el panel (Experiencias) si cambiaron.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

// durationMinutes y defaultCapacity son orientativos (no se generan turnos);
// el schema los exige >= 1. La info real para el cliente va en `description`.
const SERVICES = [
  {
    name: 'Taller mensual de cerámica',
    description:
      'Cursada mensual en grupos reducidos. Día nuevo: martes de 18 a 20 h (otros días suelen estar completos). La primera clase es de prueba y gratis (se reserva con anticipación). Cuota mensual $65.000 (efectivo/transferencia). Seña 50% + saldo antes del día 10. Coordinamos por acá.',
    durationMinutes: 120,
    basePrice: 65000,
    defaultCapacity: 10,
    depositPct: 50,
  },
  {
    name: 'Escuelita de Arte (niños 7 a 13)',
    description:
      'Taller mensual para niños de 7 a 13 años. Miércoles de 18:00 a 19:45 h. Incluye materiales, merienda y horneado. Cupos limitados. Mensual: $66.000 un niño / $110.000 dos hermanos. Seña 50% + saldo antes del día 10. Coordinamos por acá.',
    durationMinutes: 105,
    basePrice: 66000,
    defaultCapacity: 10,
    depositPct: 50,
  },
  {
    name: 'Facilitadores (alquiler del espacio)',
    description:
      'Alquiler del espacio para que facilitadores den su propio taller a su comunidad. Desde $42.000 por persona (2:30 h con coffee break). Disponible de martes a viernes de 13 a 20 h. Se coordina con el equipo.',
    durationMinutes: 150,
    basePrice: 42000,
    defaultCapacity: 20,
    depositPct: 50,
  },
  {
    name: 'Tienda',
    description:
      'Kits para pintar en casa y productos artesanales. Se ven y se compran en el local (Videla 57, Quilmes). Consultá disponibilidad por acá.',
    durationMinutes: 1,
    basePrice: 0,
    defaultCapacity: 1,
    depositPct: 0,
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

async function main() {
  const url = readDatabaseUrl();
  const MongoClient = loadMongoClient();

  console.log(
    APPLY
      ? '⚠️  MODO APPLY (se escribirá en la base)'
      : 'Modo dry-run (agregá --apply para escribir)',
  );
  console.log('URL: ' + maskUrl(url));
  console.log('Servicios coordinados a sembrar: ' + SERVICES.length);
  console.log('==========================================================');

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();
    const col = db.collection('experiences');
    console.log('DB: ' + db.databaseName);
    console.log('');

    let inserted = 0;
    let updated = 0;
    for (const s of SERVICES) {
      const existing = await col.findOne({ name: s.name });
      const tag = existing ? 'UPDATE' : 'INSERT';
      console.log(
        '  [' + tag + '] ' + s.name + '  ($' + s.basePrice + ' · coordinado)',
      );

      if (!APPLY) continue;

      const now = new Date();
      if (existing) {
        await col.updateOne(
          { _id: existing._id },
          {
            $set: {
              description: s.description,
              durationMinutes: s.durationMinutes,
              basePrice: s.basePrice,
              defaultCapacity: s.defaultCapacity,
              depositPct: s.depositPct,
              bookableOnline: false,
              isActive: true,
              deletedAt: null,
              updatedAt: now,
            },
          },
        );
        updated++;
      } else {
        await col.insertOne({
          name: s.name,
          description: s.description,
          durationMinutes: s.durationMinutes,
          basePrice: s.basePrice,
          defaultCapacity: s.defaultCapacity,
          depositPct: s.depositPct,
          images: [],
          bookableOnline: false,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        inserted++;
      }
    }

    console.log('');
    console.log('---');
    if (APPLY) {
      console.log('Insertados: ' + inserted + ' · Actualizados: ' + updated);
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
