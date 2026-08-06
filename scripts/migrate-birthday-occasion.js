/**
 * Migración: "Cumpleaños" pasa de experiencia con precio propio a OCASIÓN.
 *
 * · isBirthday: true — el backend usa sus priceVariants como beneficios de
 *   cualquier reserva marcada isBirthday, sobre el precio de la experiencia
 *   elegida (Arte & Degustación, Brunch, Premium...).
 * · Se les quita `price` a sus variantes: pasan a ser beneficios puros
 *   (lugares bonificados / regalos) que mantienen el precio heredado.
 *   Su basePrice/durationMinutes quedan pero ya no se usan para reservar.
 *
 * ⚠️ Correr JUNTO AL DEPLOY del backend nuevo: el backend viejo con variantes
 *   sin `price` mostraría precios $0 en el catálogo del bot.
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/migrate-birthday-occasion.js            -> dry-run
 *   node scripts/migrate-birthday-occasion.js --apply    -> escribe de verdad
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

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

    const variants = (exp.priceVariants || []).map((v) => {
      const { price: _drop, ...rest } = v;
      return rest;
    });
    console.log(`Experiencia: ${exp.name} (${exp._id})`);
    console.log(`  isBirthday: ${exp.isBirthday ?? false} -> true`);
    for (const v of variants) {
      console.log(
        `  [BENEFICIO] ${v.name}${v.freeSpots ? ` · ${v.freeSpots} lugar bonificado` : ''} (sin precio propio: hereda el de la experiencia elegida)`,
      );
    }

    if (!APPLY) {
      console.log('\nDry-run: no se escribió nada.');
      return;
    }
    await col.updateOne(
      { _id: exp._id },
      {
        $set: {
          isBirthday: true,
          priceVariants: variants,
          updatedAt: new Date(),
        },
      },
    );
    // A lo sumo un doc con isBirthday: apagamos cualquier otro por las dudas.
    await col.updateMany(
      { _id: { $ne: exp._id }, isBirthday: true },
      { $set: { isBirthday: false } },
    );
    console.log('\nListo: Cumpleaños es una ocasión con beneficios heredables.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
