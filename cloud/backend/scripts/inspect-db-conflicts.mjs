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
  await client.query('SET ROLE povo_app');
  const counts={};
  for(const table of ['pessoas','usuarios','documentos','tarefas','processos','historico']){
    const r=await client.query('select count(*)::int n from '+table);
    counts[table]=r.rows[0].n;
  }
  const people=await client.query("select id,cpf,nome,criado_em,alterado_em from pessoas order by criado_em nulls last");
  const conflict=await client.query("select id,cpf,nome,criado_em,alterado_em from pessoas where cpf='03767297086'");
  const refs=await client.query(`
    select
      (select count(*) from tarefas where pessoa_id=$1)::int tarefas,
      (select count(*) from processos where pessoa_id=$1)::int processos,
      (select count(*) from atendimentos where pessoa_id=$1)::int atendimentos
  `,[conflict.rows[0]?.id||'']);
  console.log(JSON.stringify({counts,people:people.rows,conflict:conflict.rows,refs:refs.rows[0]},null,2));
}finally{
  client.release();await pool.end();connector.close();
}