import {getPool,closeDb} from '../src/db.mjs';

const pool=await getPool();
const out={};

try{
  const currentUser=await pool.query("select current_user, session_user, pg_has_role(current_user,'povo_app','member') as member_povo_app, has_schema_privilege(current_user,'migration_backup_20261007','USAGE') as backup_usage");
  out.role=currentUser.rows[0];

  const incident=await pool.query(`
    select id,criado_em,usuario_email,entidade,registro_id,operacao,antes,depois
    from historico
    where operacao='EXCLUIR'
      and criado_em >= timestamptz '2026-10-08T02:16:20Z'
      and criado_em <= timestamptz '2026-10-08T02:17:10Z'
    order by criado_em,entidade,registro_id
  `);
  out.entries=incident.rows;

  const refs=[];
  for(const row of incident.rows){
    const before=row.antes||{};
    for(const key of ['fileId','pdfFileId']){
      const value=String(before[key]||'');
      if(value)refs.push({entidade:row.entidade,registroId:row.registro_id,key,value});
    }
  }
  out.fileRefs=refs;

  const tables={
    Pessoas:'pessoas',
    Atendimentos:'atendimentos',
    Documentos:'documentos',
    Minutas:'minutas',
    Tarefas:'tarefas',
    Processos:'processos'
  };
  out.existing={};
  for(const row of incident.rows){
    const table=tables[row.entidade];
    if(!table)continue;
    const q=await pool.query('select exists(select 1 from '+table+' where id=$1) as present',[row.registro_id]);
    out.existing[row.registro_id]=q.rows[0].present;
  }

  try{
    await pool.query('BEGIN');
    await pool.query('SET LOCAL ROLE povo_app');
    const q=await pool.query(`
      select
        (select count(*)::int from migration_backup_20261007.pessoas) pessoas,
        (select count(*)::int from migration_backup_20261007.documentos) documentos,
        (select count(*)::int from migration_backup_20261007.tarefas) tarefas,
        (select count(*)::int from migration_backup_20261007.tarefa_leituras) tarefa_leituras,
        (select count(*)::int from migration_backup_20261007.processos) processos,
        (select count(*)::int from migration_backup_20261007.minutas) minutas
    `);
    out.backup=q.rows[0];
    await pool.query('ROLLBACK');
  }catch(e){
    try{await pool.query('ROLLBACK');}catch{}
    out.backupError=e.message;
  }

  console.log('INCIDENT_DRYRUN='+JSON.stringify(out));
}finally{
  await closeDb();
}
