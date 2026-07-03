/**
 * Migración: dejar el catálogo alineado al MANUAL de Mística.
 *
 * RESERVABLES (bookableOnline=true) canónicas del Manual:
 *   - Arte & Degustación ($42.000)      → entrada / default
 *   - Cerámica & Brunch ($49.500)       → molde
 *   - Cerámica & Brunch Premium ($55.000) → modelado desde cero
 * COORDINADAS (bookableOnline=false) que agrega/asegura:
 *   - Cumpleaños · Eventos privados · Colonia de Arte
 *   (las ya existentes —Taller mensual, Escuelita, Facilitadores, Tienda— NO se tocan)
 *
 * Qué hace:
 *   1. Upsert de las 3 reservables canónicas (activa, bookableOnline=true).
 *   2. Upsert de las coordinadas nuevas (bookableOnline=false).
 *   3. DESACTIVA (isActive=false) toda experiencia RESERVABLE cuyo nombre NO sea
 *      canónico (las 6 actuales mismatch), y SOFT-BORRA sus turnos (deletedAt),
 *      para que el bot y el panel no las ofrezcan. Reversible desde el panel.
 *
 * NO borra reservas. Idempotente. Dry-run por default.
 *   node scripts/migrate-catalog-to-manual.js           -> dry-run
 *   node scripts/migrate-catalog-to-manual.js --apply    -> escribe
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

const RESERVABLES = [
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

// Coordinadas que agrega el Manual y que no cobran/reservan online (precio de
// referencia 0: la info va en la descripción y el bot capta la consulta).
const COORDINADAS = [
  {
    name: 'Cumpleaños',
    description:
      'Festejá distinto: cada invitado crea su pieza. Coordinamos temática, mesa, materiales y adicionales (por ejemplo, torta) para el grupo. Se organiza con el equipo por WhatsApp.',
    durationMinutes: 180,
    basePrice: 0,
    defaultCapacity: 20,
    depositPct: 50,
  },
  {
    name: 'Eventos privados',
    description:
      'Eventos privados y experiencias temáticas para grupos, empresas o celebraciones. Armamos una propuesta a medida. Se coordina con el equipo.',
    durationMinutes: 180,
    basePrice: 0,
    defaultCapacity: 40,
    depositPct: 50,
  },
  {
    name: 'Colonia de Arte',
    description:
      'Colonia de arte para niños durante las vacaciones. Cupos y fechas por temporada. Se coordina con el equipo.',
    durationMinutes: 180,
    basePrice: 0,
    defaultCapacity: 15,
    depositPct: 50,
  },
];

const RESERVABLE_NAMES = new Set(RESERVABLES.map((e) => e.name));

function loadMongoClient() {
  const nestMongoose = require.resolve('@nestjs/mongoose', {
    paths: [path.join(__dirname, '..')],
  });
  const mongodbPath = require.resolve('mongodb', { paths: [nestMongoose] });
  return require(mongodbPath).MongoClient;
}

function readDatabaseUrl() {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
  }
  throw new Error('No se encontró DATABASE_URL en .env');
}

const maskUrl = (u) => u.replace(/(:\/\/[^:]+:)([^@]+)(@)/, '$1****$3');
const isReservable = (e) =>
  e.bookableOnline !== false && e.isActive !== false && e.deletedAt == null;

async function upsert(col, e, bookableOnline) {
  const existing = await col.findOne({ name: e.name });
  console.log(
    `  [${existing ? 'UPDATE' : 'INSERT'}] ${e.name}  ($${e.basePrice} · ${
      bookableOnline ? 'reservable' : 'coordinada'
    })`,
  );
  if (!APPLY) return;
  const now = new Date();
  const set = {
    description: e.description,
    durationMinutes: e.durationMinutes,
    basePrice: e.basePrice,
    defaultCapacity: e.defaultCapacity,
    depositPct: e.depositPct ?? 50,
    bookableOnline,
    isActive: true,
    updatedAt: now,
  };
  if (e.images) set.images = e.images;
  if (existing) {
    await col.updateOne(
      { _id: existing._id },
      { $set: set, $unset: { deletedAt: '' } },
    );
  } else {
    await col.insertOne({ name: e.name, images: [], createdAt: now, ...set });
  }
}

async function main() {
  const url = readDatabaseUrl();
  const MongoClient = loadMongoClient();
  console.log(
    APPLY ? '⚠️  MODO APPLY (escribe)' : 'Modo dry-run (agregá --apply para escribir)',
  );
  console.log('URL: ' + maskUrl(url));
  console.log('==========================================================');

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();
    const exp = db.collection('experiences');
    const sess = db.collection('experience_sessions');
    console.log('DB: ' + db.databaseName + '\n');

    console.log('1) Reservables canónicas:');
    for (const e of RESERVABLES) await upsert(exp, e, true);

    console.log('\n2) Coordinadas (agrega/asegura):');
    for (const e of COORDINADAS) await upsert(exp, e, false);

    console.log('\n3) Reservables NO canónicas → desactivar + soft-borrar turnos:');
    const all = await exp.find({}).toArray();
    let deact = 0;
    let killedTurnos = 0;
    for (const e of all) {
      if (!isReservable(e)) continue;
      if (RESERVABLE_NAMES.has(e.name)) continue; // canónica: se mantiene
      const openTurnos = await sess.countDocuments({
        experienceId: e._id,
        deletedAt: { $exists: false },
      });
      console.log(`  [OFF] ${e.name}  (${openTurnos} turno/s a soft-borrar)`);
      deact++;
      killedTurnos += openTurnos;
      if (!APPLY) continue;
      const now = new Date();
      await exp.updateOne(
        { _id: e._id },
        { $set: { isActive: false, updatedAt: now } },
      );
      await sess.updateMany(
        { experienceId: e._id, deletedAt: { $exists: false } },
        { $set: { deletedAt: now, updatedAt: now } },
      );
    }

    console.log('\n---');
    console.log(
      `Desactivadas: ${deact} experiencia/s · turnos soft-borrados: ${killedTurnos}`,
    );
    if (!APPLY) {
      console.log('Dry-run: nada escrito. Revisá y corré con --apply.');
      console.log(
        'Después: node scripts/seed-turnos.js --apply  (turnos para las canónicas)',
      );
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
