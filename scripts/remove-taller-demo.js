/** Elimina únicamente los datos creados por seed-taller-demo.js.
 * Uso: node scripts/remove-taller-demo.js --apply */
'use strict';

const fs = require('fs');
const path = require('path');
const APPLY = process.argv.includes('--apply');
const EMAIL = 'profesor.prueba.taller@mistica.local';
const PREFIX = '[PRUEBA TALLER]';

function loadMongoClient() {
  const nestMongoose = require.resolve('@nestjs/mongoose', { paths: [path.join(__dirname, '..')] });
  return require(require.resolve('mongodb', { paths: [nestMongoose] })).MongoClient;
}
function readDatabaseUrl() {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const line = raw.split(/\r?\n/).find((value) => /^\s*DATABASE_URL\s*=/.test(value));
  if (!line) throw new Error('No se encontró DATABASE_URL en .env');
  return line.replace(/^\s*DATABASE_URL\s*=\s*/, '').trim().replace(/^['"]|['"]$/g, '');
}

async function main() {
  const client = new (loadMongoClient())(readDatabaseUrl());
  await client.connect();
  try {
    const db = client.db();
    const user = await db.collection('users').findOne({ email: EMAIL });
    const professor = user && await db.collection('professors').findOne({ userId: user._id });
    const students = await db.collection('students').find({ name: { $regex: `^\\[PRUEBA TALLER\\]` } }).toArray();
    const groups = await db.collection('groups').find({ name: { $regex: `^\\[PRUEBA TALLER\\]` } }).toArray();
    console.log(APPLY ? '⚠️ MODO APPLY' : 'Modo dry-run (no escribe)');
    console.log(`Cuenta: ${user ? '1' : '0'} · Profesor: ${professor ? '1' : '0'} · Alumnos: ${students.length} · Grupos: ${groups.length}`);
    if (!APPLY) return;
    const studentIds = students.map((student) => student._id);
    const groupIds = groups.map((group) => group._id);
    await Promise.all([
      db.collection('attendance').deleteMany({ groupId: { $in: groupIds } }),
      db.collection('student_payments').deleteMany({ studentId: { $in: studentIds } }),
      db.collection('student_regularity_events').deleteMany({ studentId: { $in: studentIds } }),
      db.collection('pieces').deleteMany({ studentId: { $in: studentIds } }),
      db.collection('groups').deleteMany({ _id: { $in: groupIds } }),
      db.collection('students').deleteMany({ _id: { $in: studentIds } }),
      professor ? db.collection('professors').deleteOne({ _id: professor._id }) : Promise.resolve(),
      user ? db.collection('users').deleteOne({ _id: user._id }) : Promise.resolve(),
    ]);
    console.log('✓ Datos demo eliminados.');
  } finally { await client.close(); }
}
main().catch((error) => { console.error('Error:', error); process.exitCode = 1; });
