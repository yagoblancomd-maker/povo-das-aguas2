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
  const documentos=(await client.query(`
    select id,categoria,nome,mime,file_id,url,atendimento_id
    from documentos
    order by criado_em,id
  `)).rows;
  const anexos=(await client.query(`
    select id,tarefa_id,nome,mime,file_id,url,bytes
    from tarefa_anexos
    order by criado_em,id
  `)).rows;
  const usuarios=(await client.query(`
    select id,email,nome,nome_usuario,foto_id,perfil,permissoes
    from usuarios
    order by email
  `)).rows;
  const configuracoes=(await client.query(`
    select id,chave,valor
    from configuracoes
    order by chave
  `)).rows;
  console.log(JSON.stringify({documentos,anexos,usuarios,configuracoes},null,2));
}finally{
  client.release();await pool.end();connector.close();
}