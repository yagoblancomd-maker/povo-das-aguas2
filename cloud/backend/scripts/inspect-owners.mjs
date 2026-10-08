import pg from 'pg';
import {Connector,IpAddressTypes,AuthTypes} from '@google-cloud/cloud-sql-connector';
const connector=new Connector();
const opts=await connector.getOptions({
  instanceConnectionName:'povo-das-aguas-2026-yago:southamerica-east1:povo-das-aguas-db',
  ipType:IpAddressTypes.PUBLIC,
  authType:AuthTypes.PASSWORD
});
const pool=new pg.Pool({...opts,user:'pda_migrator',password:process.env.PDA_MIGRATION_PASSWORD,database:'povo_das_aguas',max:2});
const q=await pool.query(`
  select n.nspname schema_name,c.relname table_name,r.rolname owner
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  join pg_roles r on r.oid=c.relowner
  where n.nspname='public' and c.relkind='r'
  order by c.relname
`);
console.log(JSON.stringify(q.rows,null,2));
await pool.end();connector.close();