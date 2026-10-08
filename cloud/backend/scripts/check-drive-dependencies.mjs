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
  const result={
    documentosLegados:(await client.query("select count(*)::int n from documentos where coalesce(file_id,'')<>'' and file_id not like 'gcs:%'")).rows[0].n,
    anexosLegados:(await client.query("select count(*)::int n from tarefa_anexos where coalesce(file_id,'')<>'' and file_id not like 'gcs:%'")).rows[0].n,
    fotosLegadas:(await client.query("select count(*)::int n from usuarios where coalesce(foto_id,'')<>'' and foto_id not like 'gcs:%'")).rows[0].n,
    urlsDriveDocumentos:(await client.query("select count(*)::int n from documentos where coalesce(url,'') ilike '%drive.google%'")).rows[0].n,
    urlsDriveAnexos:(await client.query("select count(*)::int n from tarefa_anexos where coalesce(url,'') ilike '%drive.google%'")).rows[0].n,
    template:(await client.query("select valor from configuracoes where chave='templateId'")).rows[0]?.valor||null,
    usuarios:(await client.query("select id,email,nome_usuario,perfil,permissoes from usuarios order by email")).rows
  };
  console.log(JSON.stringify(result,null,2));
}finally{
  client.release();await pool.end();connector.close();
}