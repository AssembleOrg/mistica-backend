/**
 * Seed de experiencias (plantillas) para "Mística Auténtica".
 * Inserta/actualiza la colección `experiences`. Idempotente: upsert por `name`,
 * así correrlo dos veces no duplica. NO toca turnos ni reservas.
 *
 * Reutiliza el driver `mongodb` que el backend ya tiene (vía @nestjs/mongoose)
 * y lee DATABASE_URL del .env del backend. No requiere instalar nada.
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/seed-experiences.js            -> dry-run (muestra, no escribe)
 *   node scripts/seed-experiences.js --apply    -> escribe de verdad
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

// Plantillas. Precio por persona en ARS. Duración en minutos.
// SOLO las experiencias RESERVABLES online (turno único, por persona, con seña).
// Los servicios que se coordinan (cumpleaños, taller mensual, escuelita,
// facilitadores, tienda) NO van acá: el bot los informa y capta como lead.
// depositPct = 50: toda reserva es con seña del 50%.
const EXPERIENCES = [
  {
    name: 'Arte & Degustación',
    description:
      'Pintás una pieza a elección (cerámica con esmaltado y horneado, o cuadro/yeso/tote bag para llevar en el día), sin necesidad de experiencia previa. Incluye buffet libre dulce y salado + infusiones. Te acompañamos durante toda la experiencia.',
    durationMinutes: 120,
    basePrice: 42000,
    defaultCapacity: 12,
    depositPct: 50,
    images: ['/landing/exp-1.webp'],
  },
  {
    name: 'Cerámica & Brunch',
    description:
      'Intervenís una pieza fresca elaborada en nuestro taller con sellos, texturas y técnicas decorativas. Cada pieza es única. Incluye buffet libre + infusiones. Entrega en 3 a 4 semanas. Solo con reserva previa.',
    durationMinutes: 180,
    basePrice: 49500,
    defaultCapacity: 12,
    depositPct: 50,
    images: ['/landing/exp-2.webp'],
  },
  {
    name: 'Cerámica & Brunch Premium',
    description:
      'Creás tu propia pieza desde cero con arcilla, modelando con acompañamiento paso a paso. Nosotros la horneamos y esmaltamos. Incluye buffet libre + infusiones. Entrega en 3 a 4 semanas.',
    durationMinutes: 180,
    basePrice: 55000,
    defaultCapacity: 10,
    depositPct: 50,
    images: ['/landing/exp-3.webp'],
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
  console.log('Experiencias a sembrar: ' + EXPERIENCES.length);
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
    for (const e of EXPERIENCES) {
      const existing = await col.findOne({ name: e.name });
      const tag = existing ? 'UPDATE' : 'INSERT';
      console.log(
        '  [' +
          tag +
          '] ' +
          e.name +
          '  ($' +
          e.basePrice +
          ' · ' +
          e.durationMinutes +
          'min · cupo ' +
          e.defaultCapacity +
          ')',
      );

      if (!APPLY) continue;

      const now = new Date();
      if (existing) {
        await col.updateOne(
          { _id: existing._id },
          {
            $set: {
              description: e.description,
              durationMinutes: e.durationMinutes,
              basePrice: e.basePrice,
              defaultCapacity: e.defaultCapacity,
              depositPct: e.depositPct ?? 50,
              images: e.images,
              isActive: true,
              deletedAt: null,
              updatedAt: now,
            },
          },
        );
        updated++;
      } else {
        await col.insertOne({
          name: e.name,
          description: e.description,
          durationMinutes: e.durationMinutes,
          basePrice: e.basePrice,
          defaultCapacity: e.defaultCapacity,
          depositPct: e.depositPct ?? 50,
          images: e.images,
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
      console.log('Insertadas: ' + inserted + ' · Actualizadas: ' + updated);
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
