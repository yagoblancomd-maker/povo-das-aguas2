import fs from 'node:fs/promises';
import pg from 'pg';
import {Storage} from '@google-cloud/storage';
import {Connector,IpAddressTypes,AuthTypes} from '@google-cloud/cloud-sql-connector';

const manifestPath=process.argv[2];
if(!manifestPath)throw new Error('Informe o arquivo de manifesto.');

const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const items=Array.isArray(manifest.items)?manifest.items:[];
if(!items.length)throw new Error('Manifesto sem arquivos.');

const bucketName='povo-das-aguas-arquivos-2026';
const storage=new Storage();
const bucket=storage.bucket(bucketName);

const uploaded=[];

for(const item of items){
  const response=await fetch(item.downloadUrl);
  if(!response.ok)throw new Error('Falha ao baixar '+item.id+': HTTP '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(!bytes.length)throw new Error('Arquivo vazio: '+item.id);

  await bucket.file(item.object).save(bytes,{
    contentType:item.mime||'application/octet-stream',
    resumable:false,
    metadata:{
      metadata:{
        legacyDriveId:String(item.driveId||''),
        originalName:String(item.name||''),
        migratedAt:new Date().toISOString()
      }
    }
  });

  uploaded.push({...item,bytes:bytes.length});
  console.log('UPLOAD_OK '+item.id+' '+bytes.length+' bytes -> '+item.object);
}

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

  for(const item of uploaded){
    const ref='gcs:'+item.object;

    if(item.type==='document'){
      const q=await client.query(
        `update documentos
         set file_id=$1,url=$2,alterado_em=now(),versao=versao+1
         where id=$3
         returning id`,
        [ref,'/api/v1/files/'+item.id,item.id]
      );
      if(!q.rowCount)throw new Error('Documento não localizado no banco: '+item.id);
    }else if(item.type==='taskAttachment'){
      const q=await client.query(
        `update tarefa_anexos
         set file_id=$1,url=$2,bytes=$3,alterado_em=now(),versao=versao+1
         where id=$4
         returning id`,
        [ref,'/api/v1/task-attachments/'+item.id,String(item.bytes),item.id]
      );
      if(!q.rowCount)throw new Error('Anexo não localizado no banco: '+item.id);
    }else if(item.type==='userPhoto'){
      const q=await client.query(
        `update usuarios
         set foto_id=$1,alterado_em=now(),versao=versao+1
         where id=$2
         returning id`,
        [ref,item.id]
      );
      if(!q.rowCount)throw new Error('Usuário não localizado no banco: '+item.id);
    }else if(item.type==='template'){
      const q=await client.query(
        `update configuracoes
         set valor=$1::jsonb,alterado_em=now(),versao=versao+1
         where chave='templateId'
         returning id`,
        [JSON.stringify(ref)]
      );
      if(!q.rowCount)throw new Error('Configuração templateId não localizada.');
      await client.query(
        `update configuracoes
         set valor='true'::jsonb,alterado_em=now(),versao=versao+1
         where chave='templateAprovado'`
      );
    }else if(item.type==='visual'){
      // O objeto já foi salvo no prefixo visuals/. Não há referência de banco necessária.
    }else{
      throw new Error('Tipo de ativo desconhecido: '+item.type);
    }
  }

  await client.query('COMMIT');
  console.log('ASSET_BATCH_OK '+uploaded.length);
}catch(error){
  await client.query('ROLLBACK');
  throw error;
}finally{
  client.release();
  await pool.end();
  connector.close();
}