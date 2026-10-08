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
select member.rolname member, role.rolname role
from pg_auth_members m
join pg_roles member on member.oid=m.member
join pg_roles role on role.oid=m.roleid
where member.rolname in ('pda_migrator','povo_app')
order by member.rolname,role.rolname
`);
console.log(JSON.stringify(q.rows,null,2));
await pool.end();connector.close();