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
  max:1
});

const client=await pool.connect();

try{
  await client.query('REVOKE povo_app FROM pda_migrator');
  console.log('MIGRATOR_ROLE_REVOKED');
}finally{
  client.release();
  await pool.end();
  connector.close();
}