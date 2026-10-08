import fs from 'node:fs/promises';
import {Storage} from '@google-cloud/storage';
import {getPool,closeDb} from '../src/db.mjs';
import {all,change,get,randomId,sha} from '../src/core.mjs';
import {permissions} from '../src/access.mjs';
import {executeAction} from '../src/actions.mjs';

const prefix='adj'+Date.now().toString().slice(-9);
const entity='ENTIDADE TESTE '+prefix.toUpperCase();
const emails={c1:prefix+'c1@example.invalid',c2:prefix+'c2@example.invalid',prof:prefix+'prof@example.invalid',del:prefix+'del@example.invalid'};
const ids={c1:'USR_'+prefix+'_c1',c2:'USR_'+prefix+'_c2',prof:'USR_'+prefix+'_prof',del:'USR_'+prefix+'_del'};
const taskIds=new Set();
const docIds=new Set();
const minutaIds=new Set();
const objectRefs=new Set();
const storage=new Storage();
const bucket=storage.bucket(process.env.STORAGE_BUCKET);
const pool=await getPool();
const out={prefix,checks:{},details:{}};
const assert=(name,value,detail='')=>{out.checks[name]=!!value;if(!value)throw new Error('ASSERT '+name+(detail?': '+detail:''));};

async function seedUser(client,id,email,perfil,nome,entidade=''){
  return change(client,null,'Usuarios',id,{email,perfil,ativo:true,nome,funcao:perfil==='COLONIA_PESCADOR'?'Agente de entidade':(perfil==='PROFESSOR_RESIDENTE'?'Professor':'Colaborador'),permissoes:[],permissoesVersao:1,nomeUsuario:email.split('@')[0],entidade});
}

async function cleanup(){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const tids=[...taskIds];
    if(tids.length){
      await client.query('delete from tarefa_mensagens where tarefa_id=any($1::text[])',[tids]);
      await client.query('delete from tarefa_anexos where tarefa_id=any($1::text[])',[tids]);
      await client.query('delete from tarefa_leituras where tarefa_id=any($1::text[])',[tids]);
      await client.query('delete from tarefas where id=any($1::text[])',[tids]);
    }
    const dids=[...docIds];
    if(dids.length)await client.query('delete from documentos where id=any($1::text[])',[dids]);
    const mids=[...minutaIds];
    if(mids.length)await client.query('delete from minutas where id=any($1::text[])',[mids]);
    const uids=Object.values(ids);
    await client.query('delete from sessoes where usuario_id=any($1::text[])',[uids]);
    await client.query('delete from recuperacoes where usuario_id=any($1::text[])',[uids]);
    await client.query("delete from configuracoes where chave=$1",['alertasTratados:'+sha(emails.prof).slice(0,24)]);
    await client.query("delete from usuarios where lower(email) like $1",[prefix+'%@example.invalid']);
    const recordIds=[...uids,...tids,...dids,...mids];
    if(recordIds.length)await client.query('delete from historico where registro_id=any($1::text[])',[recordIds]);
    await client.query("delete from historico where usuario_email like $1",[prefix+'%@example.invalid']);
    await client.query('COMMIT');
  }catch(e){try{await client.query('ROLLBACK')}catch{} throw e;}finally{client.release();}
  for(const ref of objectRefs){if(String(ref).startsWith('gcs:'))await bucket.file(String(ref).slice(4)).delete({ignoreNotFound:true}).catch(()=>{});}
}

try{
  const users=await all('Usuarios');
  const admin=users.find(u=>u.ativo&&(permissions(u)||[]).includes('administracao'));
  if(!admin)throw new Error('Administrador ativo não localizado');
  out.details.admin=admin.email;

  {
    const client=await pool.connect();
    try{
      await seedUser(client,ids.c1,emails.c1,'COLONIA_PESCADOR','Agente Um',entity);
      await seedUser(client,ids.c2,emails.c2,'COLONIA_PESCADOR','Agente Dois',entity);
      await seedUser(client,ids.prof,emails.prof,'PROFESSOR_RESIDENTE','Professor Teste');
      const del=await seedUser(client,ids.del,emails.del,'COLABORADOR','Usuário Excluir');
      await change(client,null,'Sessoes','SES_'+prefix,{usuarioId:del.id,tokenHash:'h_'+prefix,expiraEm:new Date(Date.now()+3600000).toISOString(),sessionVersion:1,revogada:false});
      await change(client,null,'Recuperacoes','REC_'+prefix,{usuarioId:del.id,tokenHash:'r_'+prefix,expiraEm:new Date(Date.now()+3600000).toISOString(),sessionVersion:1,usada:false});
    }finally{client.release();}
  }

  const c1=await get('Usuarios',ids.c1);
  const c2=await get('Usuarios',ids.c2);
  const prof=await get('Usuarios',ids.prof);
  const del=await get('Usuarios',ids.del);

  const opts=await executeAction('tarefaCriarOpcoes',{},c1);
  assert('colony_only_same_entity_assignees',opts.usuarios.length>=2&&opts.usuarios.every(u=>String(u.entidade||'')===entity)&&!opts.usuarios.some(u=>u.email===prof.email));
  assert('colony_team_destination_available',opts.podeEncaminharEquipe===true&&opts.destinos.some(x=>x.value==='EQUIPE'));

  const internal=await executeAction('tarefaGeralCriar',{titulo:'Tarefa interna '+prefix,descricao:'Teste de responsabilidade interna',responsavel:c2.email,destino:'ENTIDADE'},c1);
  taskIds.add(internal.tarefa.id);
  assert('entity_internal_assigned',internal.tarefa.responsavel===c2.email&&internal.tarefa.situacao==='ATRIBUIDA');

  const forwarded=await executeAction('tarefaGeralEncaminharEquipe',{id:internal.tarefa.id,versao:internal.tarefa.versao},c1);
  assert('entity_forward_unassigned',!forwarded.tarefa.responsavel&&forwarded.tarefa.situacao==='PENDENTE_ATRIBUICAO'&&String(forwarded.tarefa.origem).startsWith('COLONIA_EQUIPE'));

  let colonyDirectBlocked=false;
  try{await executeAction('tarefaGeralReatribuir',{id:forwarded.tarefa.id,versao:forwarded.tarefa.versao,responsavel:prof.email},c1);}catch(e){colonyDirectBlocked=Number(e.statusCode||0)===403;}
  assert('colony_cannot_choose_professor',colonyDirectBlocked);

  const team=await executeAction('tarefaGeralCriar',{titulo:'Para equipe '+prefix,descricao:'Fila jurídica',destino:'EQUIPE'},c1);
  taskIds.add(team.tarefa.id);
  assert('entity_team_task_unassigned',!team.tarefa.responsavel&&team.tarefa.situacao==='PENDENTE_ATRIBUICAO');
  const mgmt=await executeAction('tarefasAbertasGestao',{busca:prefix,limit:50},admin);
  assert('team_task_visible_in_management',mgmt.tarefas.some(t=>t.id===team.tarefa.id));
  const assigned=await executeAction('tarefasAtribuirLote',{ids:[team.tarefa.id],responsavel:prof.email},admin);
  assert('team_assign_by_manager',assigned.alteradas===1&&assigned.tarefas[0].responsavel===prof.email);

  const alertTask=await executeAction('tarefaGeralCriar',{titulo:'Alerta '+prefix,descricao:'Teste alerta',responsavel:prof.email},admin);
  taskIds.add(alertTask.tarefa.id);
  const n1=await executeAction('notificacoesTarefas',{},prof);
  assert('alert_pending_initial',n1.pendentes.some(x=>x.id===alertTask.tarefa.id));
  const before=await get('Tarefas',alertTask.tarefa.id);
  await executeAction('notificacaoTarefaTratar',{id:alertTask.tarefa.id},prof);
  const n2=await executeAction('notificacoesTarefas',{},prof);
  const after=await get('Tarefas',alertTask.tarefa.id);
  assert('alert_treated',n2.tratados.some(x=>x.id===alertTask.tarefa.id));
  assert('alert_does_not_change_task',before.situacao===after.situacao&&before.responsavel===after.responsavel);
  await executeAction('notificacaoTarefaReabrir',{id:alertTask.tarefa.id},prof);
  const n3=await executeAction('notificacoesTarefas',{},prof);
  assert('alert_reopened',n3.pendentes.some(x=>x.id===alertTask.tarefa.id));

  const delResult=await executeAction('usuarioExcluir',{id:del.id,versao:del.versao},admin);
  const clientCheck=await pool.connect();
  try{
    const counts=await clientCheck.query('select (select count(*) from usuarios where id=$1)::int u,(select count(*) from sessoes where usuario_id=$1)::int s,(select count(*) from recuperacoes where usuario_id=$1)::int r',[del.id]);
    assert('admin_delete_user_cascade',counts.rows[0].u===0&&counts.rows[0].s===0&&counts.rows[0].r===0,JSON.stringify(counts.rows[0]));
    out.details.deleteResult=delResult;
  }finally{clientCheck.release();}

  const proc=await executeAction('processos',{limit:100},admin);
  assert('processes_load_without_filter',Array.isArray(proc.processos)&&proc.aguardandoFiltro!==true);
  out.details.processCount=proc.total;

  const models0=await executeAction('modelosDocumentosListar',{},admin);
  assert('hub_has_system_model',models0.modelos.some(m=>m.sistema));
  const template=await fs.readFile(new URL('../assets/default-template.docx',import.meta.url));
  const modelId='MOD_'+prefix;
  const savedModel=await executeAction('modeloDocumentoSalvar',{id:modelId,nome:'Modelo teste '+prefix,categoria:'MANIFESTACAO',finalidade:'Smoke test',base64:template.toString('base64'),mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',arquivoNome:'teste.docx',ativo:true},admin);
  if(savedModel.modelo?.fileId)objectRefs.add(savedModel.modelo.fileId);
  assert('hub_custom_model_saved',savedModel.modelo?.id===modelId&&(savedModel.modelo.placeholders||[]).length>0);
  const people=(await all('Pessoas')).filter(p=>p&&p.id);
  if(people.length){
    const generated=await executeAction('modeloDocumentoGerar',{pessoaId:people[0].id,modeloId:modelId},admin);
    for(const doc of generated.documentos||[]){docIds.add(doc.id);objectRefs.add(doc.fileId);}
    if(generated.minuta){minutaIds.add(generated.minuta.id);objectRefs.add(generated.minuta.fileId);objectRefs.add(generated.minuta.pdfFileId);}
    assert('hub_generation_pdf_docx',(generated.documentos||[]).some(d=>d.mime==='application/pdf')&&(generated.documentos||[]).some(d=>String(d.mime||'').includes('wordprocessingml')));
  }
  const off=await executeAction('modeloDocumentoAtivar',{id:modelId,ativo:false},admin);
  assert('hub_model_deactivate',off.modelo?.ativo===false);
  const on=await executeAction('modeloDocumentoAtivar',{id:modelId,ativo:true},admin);
  assert('hub_model_reactivate',on.modelo?.ativo===true);
  await executeAction('modeloDocumentoExcluir',{id:modelId},admin);
  const models1=await executeAction('modelosDocumentosListar',{},admin);
  assert('hub_model_delete',!models1.modelos.some(m=>m.id===modelId));

  out.ok=Object.values(out.checks).every(Boolean);
  console.log('ADJUSTMENTS_SMOKE='+JSON.stringify(out));
}finally{
  await cleanup().catch(e=>console.error('CLEANUP_ERROR',e.message));
  const check=await pool.query("select count(*)::int n from usuarios where lower(email) like $1",[prefix+'%@example.invalid']);
  console.log('ADJUSTMENTS_CLEANUP='+JSON.stringify({remainingUsers:check.rows[0].n}));
  await closeDb();
}