import pg from 'pg';
import {Connector,IpAddressTypes,AuthTypes} from '@google-cloud/cloud-sql-connector';
const connector=new Connector();
const opts=await connector.getOptions({
  instanceConnectionName:'povo-das-aguas-2026-yago:southamerica-east1:povo-das-aguas-db',
  ipType:IpAddressTypes.PUBLIC,
  authType:AuthTypes.PASSWORD
});
const pool=new pg.Pool({...opts,user:'pda_migrator',password:process.env.PDA_MIGRATION_PASSWORD,database:'povo_das_aguas',max:2});
const client=await pool.connect();
try{
  await client.query('GRANT povo_app TO pda_migrator');
  await client.query('SET ROLE povo_app');
  const q=await client.query('select current_user, session_user');
  console.log(JSON.stringify(q.rows[0]));
}finally{
  client.release();
  await pool.end();
  connector.close();
}