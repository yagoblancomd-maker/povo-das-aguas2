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

const tables=[
  'pessoas','usuarios','sessoes','recuperacoes','configuracoes',
  'atendimentos','documentos','pendencias','minutas','historico',
  'distribuicao','tarefas','tarefa_mensagens','tarefa_anexos',
  'tarefa_leituras','tarefa_tags','processos','operacoes'
];

const client=await pool.connect();

try{
  await client.query('SET ROLE povo_app');
  await client.query('BEGIN');
  await client.query('CREATE SCHEMA IF NOT EXISTS migration_backup_20261007');

  const counts={};

  for(const table of tables){
    const reg=await client.query(
      'select to_regclass($1) as reg',
      ['public.'+table]
    );

    if(!reg.rows[0].reg)continue;

    await client.query(
      'DROP TABLE IF EXISTS migration_backup_20261007.'+table
    );

    await client.query(
      'CREATE TABLE migration_backup_20261007.'+table+
      ' AS TABLE public.'+table
    );

    const q=await client.query(
      'SELECT count(*)::int n FROM migration_backup_20261007.'+table
    );

    counts[table]=q.rows[0].n;
  }

  await client.query('COMMIT');
  console.log('BACKUP_COUNTS='+JSON.stringify(counts));
}catch(error){
  await client.query('ROLLBACK');
  throw error;
}finally{
  client.release();
  await pool.end();
  connector.close();
}