/**
 * Seed de las VARIANTES DE PRECIO reales del Cumpleaños (agosto 2026):
 *
 *   ✨ Desde 10 personas → mini torta simbólica de regalo
 *   ✨ Martes a viernes, desde 6 personas → 1 lugar bonificado
 *   ✨ Sábados, desde 8 personas → 1 lugar bonificado
 *   ✨ Desde 20 personas → beneficios adicionales (a coordinar)
 *
 * Todas al precio base de la experiencia (el beneficio es el extra o el lugar
 * bonificado, no un precio por persona distinto). Editables desde el panel.
 *
 * Idempotente: pisa por nombre dentro de priceVariants; las variantes con otro
 * nombre que ya existan quedan como están.
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/seed-cumple-variants.js            -> dry-run
 *   node scripts/seed-cumple-variants.js --apply    -> escribe de verdad
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

// Días ISO: 1=lunes … 7=domingo.
const VARIANTS = (basePrice) => [
  {
    name: 'Mini torta de regalo (10 o más)',
    price: basePrice,
    unit: 'PER_PERSON',
    minQty: 10,
    description: 'Mini torta simbólica de regalo',
    active: true,
  },
  {
    name: 'Martes a viernes: 1 lugar bonificado',
    price: basePrice,
    unit: 'PER_PERSON',
    minQty: 6,
    days: [2, 3, 4, 5],
    freeSpots: 1,
    description: '1 lugar bonificado (entran todos, se cobra uno menos)',
    active: true,
  },
  {
    name: 'Sábados: 1 lugar bonificado',
    price: basePrice,
    unit: 'PER_PERSON',
    minQty: 8,
    days: [6],
    freeSpots: 1,
    description: '1 lugar bonificado (entran todos, se cobra uno menos)',
    active: true,
  },
  {
    name: 'Beneficios desde 20 personas',
    price: basePrice,
    unit: 'PER_PERSON',
    minQty: 20,
    description: 'Beneficios adicionales a coordinar con el equipo',
    active: true,
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
  console.log('==========================================================');

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();
    const col = db.collection('experiences');
    console.log('DB: ' + db.databaseName + '\n');

    const exp = await col.findOne({
      name: /cumple/i,
      deletedAt: { $exists: false },
    });
    if (!exp) throw new Error('No se encontró la experiencia "Cumpleaños".');

    console.log(
      `Experiencia: ${exp.name} (${exp._id})  basePrice=${exp.basePrice}`,
    );
    const nuevas = VARIANTS(exp.basePrice);
    const nombresNuevos = new Set(nuevas.map((v) => v.name));
    const previas = exp.priceVariants || [];
    const conservadas = previas.filter((v) => !nombresNuevos.has(v.name));
    const pisadas = previas.length - conservadas.length;
    const merged = [...conservadas, ...nuevas];

    console.log(`Variantes previas: ${previas.length} (${pisadas} se pisan por nombre)`);
    for (const v of nuevas) {
      const cond = [
        v.minQty ? `desde ${v.minQty} pers.` : null,
        v.days ? `días ISO [${v.days.join(',')}]` : null,
        v.freeSpots ? `${v.freeSpots} lugar bonificado` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      console.log(`  [SEED] ${v.name}  →  $${v.price} p/p · ${cond}`);
    }

    if (!APPLY) {
      console.log('\nDry-run: no se escribió nada.');
      return;
    }
    await col.updateOne(
      { _id: exp._id },
      { $set: { priceVariants: merged, updatedAt: new Date() } },
    );
    console.log(`\nListo: ${merged.length} variantes en "${exp.name}".`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
