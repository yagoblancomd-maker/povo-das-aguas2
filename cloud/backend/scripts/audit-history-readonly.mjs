import {getPool,closeDb} from '../src/db.mjs';

const pool=await getPool();
const out={};

try{
  const counts=await pool.query(`
    select
      (select count(*)::int from pessoas) pessoas,
      (select count(*)::int from documentos) documentos,
      (select count(*)::int from processos) processos,
      (select count(*)::int from tarefas) tarefas,
      (select count(*)::int from historico) historico,
      (select count(*)::int from minutas) minutas
  `);
  out.current=counts.rows[0];

  const deletes=await pool.query(`
    select entidade,count(*)::int quantidade
    from historico
    where operacao='EXCLUIR'
      and criado_em >= now() - interval '3 hours'
    group by entidade
    order by quantidade desc,entidade
  `);
  out.deleteCounts=deletes.rows;

  const recentDeletes=await pool.query(`
    select criado_em,usuario_email,entidade,registro_id,operacao,
           antes->>'nome' as nome,
           antes->>'cpf' as cpf,
           antes->>'categoria' as categoria,
           antes->>'titulo' as titulo,
           antes->>'numero' as numero
    from historico
    where operacao='EXCLUIR'
      and criado_em >= now() - interval '3 hours'
    order by criado_em desc
    limit 120
  `);
  out.recentDeletes=recentDeletes.rows;

  const recentPersonHistory=await pool.query(`
    select criado_em,usuario_email,entidade,registro_id,operacao,
           coalesce(depois->>'nome',antes->>'nome') as nome,
           coalesce(depois->>'cpf',antes->>'cpf') as cpf
    from historico
    where entidade='Pessoas'
      and criado_em >= now() - interval '3 hours'
    order by criado_em desc
    limit 60
  `);
  out.personHistory=recentPersonHistory.rows;

  const people=await pool.query(`
    select id,nome,cpf,criado_em,alterado_em,criado_por,origem_cadastro
    from pessoas
    order by criado_em,id
  `);
  out.people=people.rows;

  try{
    const backup=await pool.query(`
      select
        (select count(*)::int from migration_backup_20261007.pessoas) pessoas,
        (select count(*)::int from migration_backup_20261007.documentos) documentos,
        (select count(*)::int from migration_backup_20261007.processos) processos,
        (select count(*)::int from migration_backup_20261007.tarefas) tarefas,
        (select count(*)::int from migration_backup_20261007.historico) historico
    `);
    out.backup=backup.rows[0];
  }catch(e){
    out.backupError=e.message;
  }

  console.log('PDA_AUDIT='+JSON.stringify(out));
}finally{
  await closeDb();
}
