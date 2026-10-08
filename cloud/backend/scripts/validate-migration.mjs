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

  const tables=[
    'pessoas','usuarios','sessoes','recuperacoes','configuracoes',
    'atendimentos','documentos','pendencias','minutas','historico',
    'distribuicao','tarefas','tarefa_mensagens','tarefa_anexos',
    'tarefa_leituras','tarefa_tags','processos','operacoes'
  ];

  const counts={};
  for(const table of tables){
    const q=await client.query('select count(*)::int n from '+table);
    counts[table]=q.rows[0].n;
  }

  const orphanChecks={
    tarefas:(await client.query(`
      select count(*)::int n
      from tarefas t
      left join pessoas p on p.id=t.pessoa_id
      where coalesce(t.pessoa_id,'')<>'' and p.id is null
    `)).rows[0].n,
    processos:(await client.query(`
      select count(*)::int n
      from processos pr
      left join pessoas p on p.id=pr.pessoa_id
      where coalesce(pr.pessoa_id,'')<>'' and p.id is null
    `)).rows[0].n,
    mensagens:(await client.query(`
      select count(*)::int n
      from tarefa_mensagens m
      left join tarefas t on t.id=m.tarefa_id
      where t.id is null
    `)).rows[0].n,
    anexos:(await client.query(`
      select count(*)::int n
      from tarefa_anexos a
      left join tarefas t on t.id=a.tarefa_id
      where t.id is null
    `)).rows[0].n,
    leituras:(await client.query(`
      select count(*)::int n
      from tarefa_leituras l
      left join tarefas t on t.id=l.tarefa_id
      where coalesce(l.tarefa_id,'')<>'' and t.id is null
    `)).rows[0].n
  };

  const users=(await client.query(`
    select id,email,nome,nome_usuario,perfil,ativo,entidade,senha_algoritmo,
           case when coalesce(senha_hash,'')<>'' then true else false end as possui_hash
    from usuarios
    order by nome,email
  `)).rows;

  const backups=(await client.query(`
    select
      (select count(*) from migration_backup_20261007.orphan_records)::int orphan_records,
      (select count(*) from migration_backup_20261007.pessoas)::int old_people,
      (select count(*) from migration_backup_20261007.documentos)::int old_documents,
      (select count(*) from migration_backup_20261007.historico)::int old_history
  `)).rows[0];

  const duplicateCpf=(await client.query(`
    select cpf,count(*)::int n
    from pessoas
    where coalesce(cpf,'')<>''
    group by cpf
    having count(*)>1
  `)).rows;

  console.log(JSON.stringify({
    ok:Object.values(orphanChecks).every(Number.isInteger)&&Object.values(orphanChecks).every(n=>n===0)&&duplicateCpf.length===0,
    counts,orphanChecks,duplicateCpf,users,backups
  },null,2));
}finally{
  client.release();
  await pool.end();
  connector.close();
}