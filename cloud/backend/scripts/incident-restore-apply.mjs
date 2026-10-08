import {change} from '../src/core.mjs';
import {tx,closeDb} from '../src/db.mjs';

const RESTORE_ACTOR='SYSTEM_RESTORE_INCIDENT_20261007';
const expected={Pessoas:3,Documentos:23,Tarefas:3,Processos:1};
const tableMap={
  Pessoas:'pessoas',
  Documentos:'documentos',
  Tarefas:'tarefas',
  Processos:'processos'
};
const order=['Pessoas','Processos','Tarefas','Documentos'];

function iso(value){
  if(!value)return new Date().toISOString();
  return new Date(value).toISOString();
}

try{
  const result=await tx(async client=>{
    const incident=await client.query(`
      select entidade,registro_id,antes,criado_em
      from historico
      where operacao='EXCLUIR'
        and criado_em >= timestamptz '2026-10-08T02:16:20Z'
        and criado_em <= timestamptz '2026-10-08T02:17:10Z'
        and entidade = any($1::text[])
      order by criado_em,entidade,registro_id
    `,[Object.keys(expected)]);

    const counts={};
    for(const row of incident.rows)counts[row.entidade]=(counts[row.entidade]||0)+1;
    for(const [entity,n] of Object.entries(expected)){
      if(Number(counts[entity]||0)!==n){
        throw new Error('Contagem inesperada para '+entity+': '+Number(counts[entity]||0)+'; esperado '+n);
      }
    }
    if(incident.rows.length!==30)throw new Error('Incidente deve conter exatamente 30 registros; encontrados '+incident.rows.length);

    for(const row of incident.rows){
      const table=tableMap[row.entidade];
      const exists=await client.query('select exists(select 1 from '+table+' where id=$1) as present',[row.registro_id]);
      if(exists.rows[0].present)throw new Error('Restauração abortada: ID já existe '+row.registro_id);
      if(!row.antes||row.antes.id!==row.registro_id)throw new Error('Snapshot inválido para '+row.registro_id);
    }

    const restored=[];
    for(const entity of order){
      for(const row of incident.rows.filter(r=>r.entidade===entity)){
        const before=row.antes;
        await change(client,{email:RESTORE_ACTOR},entity,row.registro_id,before);
        await client.query(
          'update '+tableMap[entity]+' set versao=$2,criado_em=$3,alterado_em=$4,usuario_email=$5 where id=$1',
          [
            row.registro_id,
            Number(before.versao||1),
            iso(before.criadoEm),
            iso(before.alteradoEm||before.criadoEm),
            String(before.usuario||RESTORE_ACTOR)
          ]
        );
        restored.push({entity,id:row.registro_id});
      }
    }

    const after={};
    for(const table of ['pessoas','documentos','tarefas','processos']){
      const q=await client.query('select count(*)::int n from '+table);
      after[table]=q.rows[0].n;
    }

    return {restored:restored.length,counts,after};
  });

  console.log('INCIDENT_RESTORE='+JSON.stringify(result));
}finally{
  await closeDb();
}
