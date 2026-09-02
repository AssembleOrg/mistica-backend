/**
 * Datos DEMO, idempotentes y aislados para probar el flujo administrativo ↔
 * profesor del módulo Taller. Nunca toca alumnos, grupos ni cuentas reales.
 *
 * Crea:
 * - una cuenta de profesor con permisos mínimos (alumnos, piezas y equipo),
 * - su ficha de profesor vinculada,
 * - un grupo con tres alumnos,
 * - pagos en estados pagado, vencido y próximo a vencer,
 * - asistencia (incluye una recuperación) y piezas de los alumnos.
 *
 * Uso:
 *   node scripts/seed-taller-demo.js             # dry-run
 *   node scripts/seed-taller-demo.js --apply     # escribe
 *   node scripts/seed-taller-demo.js --apply --password='una-clave-segura'
 *
 * Si no se pasa --password, al crear por primera vez genera una clave segura
 * y la imprime una única vez. Guardala y cambiala luego desde Cuentas.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const passwordArg = process.argv.find((arg) => arg.startsWith('--password='));
const PASSWORD = passwordArg ? passwordArg.slice('--password='.length) : null;
const DEMO_EMAIL = 'profesor.prueba.taller@mistica.local';
const PREFIX = '[PRUEBA TALLER]';

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
    const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (match) return match[1].trim().replace(/^['"]|['"]$/g, '');
  }
  throw new Error('No se encontró DATABASE_URL en .env');
}

function maskUrl(url) {
  return url.replace(/(:\/\/[^:]+:)([^@]+)(@)/, '$1****$3');
}

async function upsertStudent(students, name, phone, now) {
  const key = `${PREFIX} ${name}`;
  const result = await students.findOneAndUpdate(
    { name: key, deletedAt: { $exists: false } },
    {
      $set: {
        phone,
        joinedAt: now,
        practicalNotes: 'Registro creado para probar el seguimiento del profesor.',
        adminNotes: 'Dato de prueba: se puede borrar sin afectar información real.',
        isActive: true,
        updatedAt: now,
      },
      $setOnInsert: { name: key, createdAt: now },
    },
    { upsert: true, returnDocument: 'after', includeResultMetadata: true },
  );
  return result.value;
}

async function main() {
  const url = readDatabaseUrl();
  const MongoClient = loadMongoClient();
  console.log(APPLY ? '⚠️ MODO APPLY' : 'Modo dry-run (no escribe)');
  console.log(`URL: ${maskUrl(url)}`);
  console.log(`Cuenta demo: ${DEMO_EMAIL}`);

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();
    const users = db.collection('users');
    const professors = db.collection('professors');
    const students = db.collection('students');
    const groups = db.collection('groups');
    const payments = db.collection('student_payments');
    const attendance = db.collection('attendance');
    const pieces = db.collection('pieces');

    const existingUser = await users.findOne({ email: DEMO_EMAIL, deletedAt: { $exists: false } });
    const existingGroup = await groups.findOne({ name: `${PREFIX} Cerámica martes` });
    console.log(`Cuenta profesor: ${existingUser ? 'ya existe' : 'se creará'}`);
    console.log(`Grupo demo: ${existingGroup ? 'ya existe / se actualizará' : 'se creará'}`);
    console.log('Alumnos demo: Ana, Bruno y Camila.');
    if (!APPLY) {
      console.log('\nDry-run terminado. Corré con --apply para escribir.');
      return;
    }

    const now = new Date();
    let demoPassword = null;
    let user = existingUser;
    if (!user) {
      demoPassword = PASSWORD || crypto.randomBytes(12).toString('base64url');
      const bcrypt = require('bcryptjs');
      const insert = await users.insertOne({
        email: DEMO_EMAIL,
        name: `${PREFIX} Profesora Martina`,
        password: await bcrypt.hash(demoPassword, 12),
        role: 'user',
        allowedViews: ['alumnos', 'equipo', 'reservas:piezas'],
        createdAt: now,
        updatedAt: now,
      });
      user = await users.findOne({ _id: insert.insertedId });
    } else {
      await users.updateOne({ _id: user._id }, {
        $set: { allowedViews: ['alumnos', 'equipo', 'reservas:piezas'], updatedAt: now },
      });
    }

    const professor = await professors.findOneAndUpdate(
      { userId: user._id, deletedAt: { $exists: false } },
      {
        $set: { name: `${PREFIX} Profesora Martina`, email: DEMO_EMAIL, active: true, updatedAt: now },
        $setOnInsert: { userId: user._id, phone: '5491100000001', createdAt: now },
      },
      { upsert: true, returnDocument: 'after', includeResultMetadata: true },
    );

    const [ana, bruno, camila] = await Promise.all([
      upsertStudent(students, 'Ana Regular', '5491100000002', now),
      upsertStudent(students, 'Bruno Vencido', '5491100000003', now),
      upsertStudent(students, 'Camila Recupera', '5491100000004', now),
    ]);
    const studentIds = [ana._id, bruno._id, camila._id];
    const group = await groups.findOneAndUpdate(
      { name: `${PREFIX} Cerámica martes`, deletedAt: { $exists: false } },
      {
        $set: {
          description: 'Grupo de prueba para validar permisos de profesor.',
          professorId: professor.value._id,
          professorName: professor.value.name,
          schedule: [{ weekday: 2, start: '15:30', end: '17:30' }],
          studentIds,
          notes: 'Se puede eliminar completo después de la prueba.',
          isActive: true,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: 'after', includeResultMetadata: true },
    );

    const overdue = new Date(now);
    overdue.setDate(overdue.getDate() - 2);
    const soon = new Date(now);
    soon.setDate(soon.getDate() + 2);
    const paid = new Date(now);
    paid.setDate(paid.getDate() - 1);
    const paymentSeed = [
      [ana, 'Cuota demo pagada', 'PAID', paid, paid],
      [bruno, 'Cuota demo vencida', 'PENDING', null, overdue],
      [camila, 'Cuota demo próxima a vencer', 'PENDING', null, soon],
    ];
    for (const [student, concept, status, paidAt, dueDate] of paymentSeed) {
      await payments.updateOne(
        { studentId: student._id, concept, deletedAt: { $exists: false } },
        { $set: { amount: 1000, status, paidAt, dueDate, method: status === 'PAID' ? 'CASH' : undefined, updatedAt: now }, $setOnInsert: { studentId: student._id, concept, createdAt: now } },
        { upsert: true },
      );
    }

    const dateKey = now.toISOString().slice(0, 10);
    await attendance.updateOne(
      { groupId: group.value._id, dateKey },
      {
        $set: {
          records: [
            { studentId: ana._id, status: 'PRESENT' },
            { studentId: bruno._id, status: 'ABSENT', notes: 'Prueba de ausencia' },
            { studentId: camila._id, status: 'MAKEUP', notes: 'Recupera clase' },
          ],
          takenById: user._id,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );

    for (const [student, status, notes] of [
      [ana, 'SECADO', 'Taza de prueba'],
      [bruno, 'ESMALTADO', 'Cuenco de prueba'],
      [camila, 'LISTA', 'Plato de prueba'],
    ]) {
      await pieces.updateOne(
        { studentId: student._id, notes, deletedAt: { $exists: false } },
        {
          $set: {
            studentName: student.name,
            customerName: student.name,
            customerPhone: student.phone,
            quantity: 1,
            status,
            professorId: professor.value._id,
            professorName: professor.value.name,
            photos: [],
            readyAt: status === 'LISTA' ? now : undefined,
          },
          $setOnInsert: { studentId: student._id, notes, createdAt: now },
        },
        { upsert: true },
      );
    }

    console.log('\n✓ Seed de taller listo.');
    console.log(`Profesor: ${DEMO_EMAIL}`);
    if (demoPassword) console.log(`Contraseña generada: ${demoPassword}`);
    else console.log('La cuenta ya existía: conserva su contraseña actual.');
    console.log(`Grupo: ${group.value.name}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exitCode = 1;
});
