import {getPool,closeDb} from '../src/db.mjs';
const tables=['pessoas','usuarios','sessoes','recuperacoes','configuracoes','atendimentos','documentos','pendencias','minutas','historico','distribuicao','tarefas','tarefa_mensagens','tarefa_anexos','tarefa_leituras','tarefa_tags','processos','operacoes'];
const pool=await getPool();
try{
  const out={};
  for(const table of tables){
    const q=await pool.query('select count(*)::int n from '+table);
    out[table]=q.rows[0].n;
  }
  console.log('CURRENT_COUNTS='+JSON.stringify(out));
}finally{await closeDb();}
