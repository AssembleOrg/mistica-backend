process.loadEnvFile(process.cwd()+"/.env");
const { MongoClient } = require('mongoose').mongo;
(async () => {
  const c = new MongoClient(process.env.DATABASE_URL); await c.connect();
  const db = c.db('test');
  console.log('users:', (await db.collection('users').find({}, {projection:{email:1,role:1,allowedViews:1,professorId:1,deletedAt:1}}).toArray()).map(u=>`${u.role} | ${u.email} | views=${JSON.stringify(u.allowedViews||[])} | prof=${u.professorId||''}${u.deletedAt?' | DELETED':''}`));
  console.log('groups:', (await db.collection('groups').find({}, {projection:{name:1,isActive:1,studentIds:1,professorId:1,deletedAt:1}}).toArray()).map(g=>`${g.name} | active=${g.isActive} | students=${(g.studentIds||[]).length} | prof=${g.professorId||''}${g.deletedAt?' | DELETED':''}`));
  console.log('students:', await db.collection('students').countDocuments({}));
  const s1 = await db.collection('students').findOne({}); console.log('student keys:', s1 && Object.keys(s1));
  console.log('pieces by source:', await db.collection('pieces').aggregate([{$group:{_id:{$ifNull:['$source','$kind']},n:{$sum:1}}}]).toArray());
  await c.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
