import {getPool,closeDb} from '../src/db.mjs';
const pool=await getPool();
const client=await pool.connect();
let removed=0;
try{
  await client.query('BEGIN');
  const users=await client.query("select id,email from usuarios where lower(email) like 'ux%@example.invalid'");
  for(const user of users.rows){
    await client.query('delete from sessoes where usuario_id=$1',[user.id]);
    await client.query('delete from recuperacoes where usuario_id=$1',[user.id]);
    await client.query("delete from historico where entidade='Usuarios' and registro_id=$1",[user.id]);
    await client.query('delete from usuarios where id=$1',[user.id]);
    removed++;
  }
  await client.query('COMMIT');
  const left=await pool.query("select count(*)::int n from usuarios where lower(email) like 'ux%@example.invalid'");
  console.log('UX_USERS_CLEANUP='+JSON.stringify({removed,remaining:left.rows[0].n}));
}catch(error){
  try{await client.query('ROLLBACK');}catch{}
  throw error;
}finally{
  client.release();
  await closeDb();
}