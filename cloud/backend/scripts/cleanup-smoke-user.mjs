import pg from 'pg';
import {Connector,IpAddressTypes,AuthTypes} from '@google-cloud/cloud-sql-connector';

const connector=new Connector();
const opts=await connector.getOptions({
  instanceConnectionName:'povo-das-aguas-2026-yago:southamerica-east1:povo-das-aguas-db',
  ipType:IpAddressTypes.PUBLIC,
  authType:AuthTypes.PASSWORD
});

const pool=new pg.Pool({
  ...opts,
  user:'pda_migrator',
  password:process.env.PDA_MIGRATION_PASSWORD,
  database:'povo_das_aguas',
  max:2
});

const client=await pool.connect();

try{
  await client.query('SET ROLE povo_app');
  await client.query('BEGIN');

  const users=await client.query(
    "select id,email from usuarios where email like 'cloudtest%@example.invalid'"
  );

  for(const user of users.rows){
    await client.query('delete from sessoes where usuario_id=$1',[user.id]);
    await client.query('delete from recuperacoes where usuario_id=$1',[user.id]);
    await client.query(
      "delete from historico where entidade='Usuarios' and registro_id=$1",
      [user.id]
    );
    await client.query('delete from usuarios where id=$1',[user.id]);
  }

  await client.query('COMMIT');
  console.log('SMOKE_USERS_REMOVED='+users.rowCount);
}catch(error){
  await client.query('ROLLBACK');
  throw error;
}finally{
  client.release();
  await pool.end();
  connector.close();
}