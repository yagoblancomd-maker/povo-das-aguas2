import {Storage} from '@google-cloud/storage';
import {tx} from './db.mjs';
import {
  all,whereAll,get,findOne,change,remove,config,id,randomId,now,bool,required,httpError,
  causeValue,address,personOwnerKey,personIdFromOwner,docLabel,canRetify,
  canWritePersonContent,requirePermission,STORAGE_BUCKET,MAX_FILE_BYTES,sha,
  personInUserScope,authorizePersonScope,isColonyUser,normalizeEntityScope
} from './core.mjs';
import {has,permissions,publicUser,ROLES} from './access.mjs';

const storage=new Storage();
const bucket=storage.bucket(STORAGE_BUCKET);

export const DISTRIBUTION_TASK_TYPE='DISTRIBUICAO_PROCESSO';
export const GENERAL_TASK_TYPE='TAREFA_GERAL';
export const TASK_PENDING='PENDENTE_ATRIBUICAO';
export const TASK_ASSIGNED='ATRIBUIDA';
export const TASK_DONE='CONCLUIDA';

const DEFAULT_TASK_TAGS=Object.freeze([
  {nome:'URGENTE',cor:'#c65349'},
  {nome:'DOCUMENTAÇÃO',cor:'#d49a42'},
  {nome:'PROCESSO',cor:'#176e7d'},
  {nome:'CRIADO PELA COLÔNIA',cor:'#4f7f72'},
  {nome:'RETORNO',cor:'#7a5aa6'},
  {nome:'FINANCEIRO',cor:'#2f8b65'}
]);

const PRIORITIES=['BAIXA','NORMAL','ALTA','URGENTE'];

function emailOf(user){return String(user?.email||'').trim().toLowerCase();}
function cpfDisplay(value){
  const d=String(value||'').replace(/\D/g,'');
  return d.length===11?d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'):String(value||'');
}
function visiblePeople(user,people){return (people||[]).filter(p=>personInUserScope(user,p));}
function page(rows,q,defaultLimit=30){
  const offset=Math.max(0,Number(q?.offset)||0);
  const limit=Math.min(500,Math.max(1,Number(q?.limit)||defaultLimit));
  return {rows:rows.slice(offset,offset+limit),total:rows.length,offset,limit,hasMore:offset+limit<rows.length};
}
function tagsParse(value){
  if(Array.isArray(value))return [...new Set(value.map(v=>String(v||'').trim()).filter(Boolean))].slice(0,8);
  const text=String(value||'').trim();
  if(!text)return [];
  try{
    const parsed=JSON.parse(text);
    if(Array.isArray(parsed))return tagsParse(parsed);
  }catch{}
  return [...new Set(text.split(',').map(v=>v.trim()).filter(Boolean))].slice(0,8);
}
function dueState(task){
  const due=String(task?.prazo||'').trim();
  if(!due)return {estado:'SEM_PRAZO',horas:null};
  const end=new Date(due+'T23:59:59');
  const hours=(end.getTime()-Date.now())/3600000;
  if(Number.isNaN(hours))return {estado:'SEM_PRAZO',horas:null};
  if(hours<0)return {estado:'VENCIDA',horas:Math.round(hours)};
  if(hours<=24)return {estado:'ATE_24H',horas:Math.round(hours)};
  if(hours<=96)return {estado:'ATE_96H',horas:Math.round(hours)};
  return {estado:'NORMAL',horas:Math.round(hours)};
}
function safeDate(value){
  const text=String(value||'').trim();
  if(!text)return '';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw httpError(400,'Prazo inválido.');
  const d=new Date(text+'T12:00:00Z');
  if(Number.isNaN(d.getTime()))throw httpError(400,'Prazo inválido.');
  return text;
}
function priority(value){
  const p=String(value||'NORMAL').trim().toUpperCase();
  if(!PRIORITIES.includes(p))throw httpError(400,'Prioridade inválida.');
  return p;
}
function historyInRange(value,from,to){
  const day=String(value||'').slice(0,10);
  if(!day)return !from&&!to;
  if(from&&day<from)return false;
  if(to&&day>to)return false;
  return true;
}

export async function personListLite(q,user){
  q=q||{};
  const term=String(q.busca||'').trim().toLowerCase();
  const offset=Math.max(0,Number(q.offset)||0);
  const limit=Math.min(100,Math.max(10,Number(q.limit)||30));

  if(!term){
    return {pessoas:[],total:0,offset,limit,hasMore:false,aguardandoFiltro:true};
  }

  const [people,users,processes,tasks]=await Promise.all([
    all('Pessoas'),all('Usuarios'),all('Processos'),all('Tarefas')
  ]);
  const usersByEmail=new Map(users.map(u=>[emailOf(u),u]));
  const procCount=new Map();
  const openCount=new Map();

  for(const p of processes){
    if(p.pessoaId)procCount.set(p.pessoaId,(procCount.get(p.pessoaId)||0)+1);
  }
  for(const t of tasks){
    if(t.pessoaId&&t.situacao!==TASK_DONE)openCount.set(t.pessoaId,(openCount.get(t.pessoaId)||0)+1);
  }

  const typedCpf=term.replace(/\D/g,'');
  const city=String(q.cidade||'').trim().toLowerCase();
  const jurisdiction=String(q.jurisdicao||'').trim().toLowerCase();
  const entity=String(q.entidade||'').trim().toLowerCase();

  let rows=visiblePeople(user,people).filter(person=>{
    const cpf=String(person.cpf||'').replace(/\D/g,'');
    const hay=[person.nome,person.cidade,person.jurisdicao,person.entidade,person.criadoPor].join(' ').toLowerCase();
    if(!hay.includes(term)&&!(typedCpf&&cpf.includes(typedCpf)))return false;
    if(city&&String(person.cidade||'').toLowerCase()!==city)return false;
    if(jurisdiction&&String(person.jurisdicao||'').toLowerCase()!==jurisdiction)return false;
    if(entity&&String(person.entidade||'').toLowerCase()!==entity)return false;
    return true;
  });

  rows.sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR',{sensitivity:'base'}));
  const total=rows.length;

  const mapped=rows.slice(offset,offset+limit).map(person=>{
    const creatorEmail=String(person.criadoPor||person.usuario||'').toLowerCase();
    const creator=usersByEmail.get(creatorEmail);
    return {
      id:person.id,versao:person.versao,nome:person.nome||'',cpf:person.cpf||'',
      cpfFormatado:cpfDisplay(person.cpf),cidade:person.cidade||'',uf:person.uf||'',
      jurisdicao:person.jurisdicao||'',entidade:person.entidade||'',
      outraEntidade:person.outraEntidade||'',parcelasNaoRecebidas:person.parcelasNaoRecebidas||'',
      criadoPor:creatorEmail,criadoPorNome:creator?.nome||creatorEmail,criadoEm:person.criadoEm||'',
      documentos:null,processos:Number(procCount.get(person.id)||0),
      tarefasAbertas:Number(openCount.get(person.id)||0),tarefasConcluidas:null
    };
  });

  return {pessoas:mapped,total,offset,limit,hasMore:offset+limit<total};
}

async function relatedDocs(personId){
  const attendances=await whereAll('Atendimentos','pessoa_id=$1',[personId]);
  const owners=[personOwnerKey(personId),...attendances.map(a=>a.id)];
  return whereAll('Documentos','atendimento_id = ANY($1::text[])',[owners]);
}

export async function personQuickSummary(q,user){
  const person=await get('Pessoas',required(q.id||q.pessoaId,'pessoa'));
  authorizePersonScope(user,person);

  const [users,docs,tasks,processes]=await Promise.all([
    all('Usuarios'),
    relatedDocs(person.id),
    whereAll('Tarefas','pessoa_id=$1',[person.id]),
    whereAll('Processos','pessoa_id=$1',[person.id])
  ]);
  const creatorEmail=String(person.criadoPor||person.usuario||'').toLowerCase();
  const creator=users.find(u=>emailOf(u)===creatorEmail);
  const personTasks=tasks.filter(t=>t.pessoaId===person.id);
  const open=personTasks.filter(t=>t.situacao!==TASK_DONE);
  const done=personTasks.filter(t=>t.situacao===TASK_DONE);

  return {
    id:person.id,versao:person.versao,nome:person.nome||'',cpf:person.cpf||'',
    cpfFormatado:cpfDisplay(person.cpf),cidade:person.cidade||'',uf:person.uf||'',
    jurisdicao:person.jurisdicao||'',entidade:person.entidade||'',outraEntidade:person.outraEntidade||'',
    parcelasNaoRecebidas:person.parcelasNaoRecebidas||'',criadoPor:creatorEmail,
    criadoPorNome:creator?.nome||creatorEmail,criadoEm:person.criadoEm||'',telefone:person.telefone||'',
    email:person.email||'',nascimento:person.nascimento||'',cep:person.cep||'',tipoVia:person.tipoVia||'',
    endereco:person.via||'',numero:person.numero||'',complemento:person.complemento||'',bairro:person.bairro||'',
    documentos:docs.filter(d=>bool(d.vigente)).length,
    processos:processes.filter(p=>p.pessoaId===person.id).length,
    tarefasAbertas:open.length,tarefasConcluidas:done.length,
    podeRetificar:canRetify(user,person),podeGerenciarConteudo:canWritePersonContent(user,person),
    podeCriarTarefa:has(user,'gestao_distribuicao')||has(user,'criar_tarefa_entidade'),
    podeExcluir:has(user,'administracao')
  };
}

function publicDocument(doc){
  return {
    id:doc.id,versao:doc.versao,categoria:doc.categoria||'',nome:doc.nome||'',mime:doc.mime||'',
    vigente:doc.vigente,conferido:doc.conferido,vencimento:doc.vencimento||'',
    observacoes:doc.observacoes||'',criadoEm:doc.criadoEm||'',alteradoEm:doc.alteradoEm||''
  };
}

export async function personDocumentsPage(q,user){
  const person=await get('Pessoas',required(q.pessoaId,'pessoa'));
  authorizePersonScope(user,person);
  let rows=await relatedDocs(person.id);
  const seen=new Set();
  rows=rows.filter(r=>!seen.has(r.id)&&seen.add(r.id));
  if(q.apenasVigentes!==false)rows=rows.filter(r=>bool(r.vigente));
  rows.sort((a,b)=>String(b.criadoEm||b.alteradoEm||'').localeCompare(String(a.criadoEm||a.alteradoEm||'')));
  const pg=page(rows,q,20);
  return {documentos:pg.rows.map(publicDocument),total:pg.total,offset:pg.offset,limit:pg.limit,hasMore:pg.hasMore};
}

export async function personDocumentContent(q,user){
  const person=await get('Pessoas',required(q.pessoaId,'pessoa'));
  authorizePersonScope(user,person);
  const doc=await get('Documentos',required(q.id,'documento'));
  const docs=await relatedDocs(person.id);
  if(!docs.some(d=>d.id===doc.id))throw httpError(400,'O documento não pertence ao cadastro informado.');
  if(!bool(doc.vigente))throw httpError(400,'Esta versão do documento não está mais vigente.');
  if(!String(doc.fileId||'').startsWith('gcs:')){
    throw httpError(409,'Documento legado ainda não migrado para o Cloud Storage.');
  }
  const file=bucket.file(String(doc.fileId).slice(4));
  const [exists]=await file.exists();
  if(!exists)throw httpError(404,'Arquivo não localizado no Cloud Storage.');
  const [bytes]=await file.download();
  return {id:doc.id,nome:doc.nome||'documento',categoria:doc.categoria||'',mime:doc.mime||'application/octet-stream',base64:bytes.toString('base64')};
}

export async function personProcessesPage(q,user){
  const person=await get('Pessoas',required(q.pessoaId,'pessoa'));
  authorizePersonScope(user,person);
  const rows=(await whereAll('Processos','pessoa_id=$1',[person.id]))
    .sort((a,b)=>String(b.distribuidoEm||b.criadoEm||'').localeCompare(String(a.distribuidoEm||a.criadoEm||'')));
  const pg=page(rows,q,20);
  return {processos:pg.rows,total:pg.total,offset:pg.offset,limit:pg.limit,hasMore:pg.hasMore};
}

export async function personAttendancesPage(q,user){
  const person=await get('Pessoas',required(q.pessoaId,'pessoa'));
  authorizePersonScope(user,person);
  const rows=(await whereAll('Atendimentos','pessoa_id=$1',[person.id]))
    .sort((a,b)=>String(b.criadoEm||b.alteradoEm||'').localeCompare(String(a.criadoEm||a.alteradoEm||'')));
  const pg=page(rows,q,20);
  return {atendimentos:pg.rows,total:pg.total,offset:pg.offset,limit:pg.limit,hasMore:pg.hasMore};
}

export async function personHistoryPage(q,user){
  const person=await get('Pessoas',required(q.pessoaId,'pessoa'));
  authorizePersonScope(user,person);
  const [attendances,docs,processes,tasks]=await Promise.all([
    whereAll('Atendimentos','pessoa_id=$1',[person.id]),
    relatedDocs(person.id),
    whereAll('Processos','pessoa_id=$1',[person.id]),
    whereAll('Tarefas','pessoa_id=$1',[person.id])
  ]);
  const related=[
    person.id,
    ...attendances.map(a=>a.id),
    ...docs.map(d=>d.id),
    ...processes.map(p=>p.id),
    ...tasks.map(t=>t.id)
  ];
  const history=await whereAll('Historico','registro_id = ANY($1::text[])',[related]);
  const rows=history
    .sort((a,b)=>String(b.alteradoEm||b.criadoEm||'').localeCompare(String(a.alteradoEm||a.criadoEm||'')));
  const pg=page(rows,q,30);
  return {historico:pg.rows,total:pg.total,offset:pg.offset,limit:pg.limit,hasMore:pg.hasMore};
}

export async function personDrawerInitial(q,user){
  const pessoaId=required(q.pessoaId||q.id,'pessoa');
  const pessoa=await get('Pessoas',pessoaId);
  authorizePersonScope(user,pessoa);
  const [resumo,documentos,atendimentos,processos]=await Promise.all([
    personQuickSummary({id:pessoaId},user),
    personDocumentsPage({pessoaId,limit:20,offset:0},user),
    personAttendancesPage({pessoaId,limit:20,offset:0},user),
    personProcessesPage({pessoaId,limit:20,offset:0},user)
  ]);
  return {pessoa,resumo,documentos,atendimentos,processos};
}

export async function globalHistory(q,user){
  q=q||{};
  const type=String(q.tipo||'cadastros').toLowerCase();
  const from=String(q.de||''),to=String(q.ate||'');
  const userFilter=String(q.usuario||'').trim().toLowerCase();
  const personFilter=String(q.pessoa||'').trim().toLowerCase();
  const search=String(q.busca||'').trim().toLowerCase();
  const [allPeople,attendances,documents,processes,tasks,history]=await Promise.all([
    all('Pessoas'),all('Atendimentos'),all('Documentos'),all('Processos'),all('Tarefas'),all('Historico')
  ]);
  const people=visiblePeople(user,allPeople);
  const visible=new Set(people.map(p=>p.id));
  const peopleById=new Map(people.map(p=>[p.id,p]));
  const attendancePerson=new Map(attendances.map(a=>[a.id,a.pessoaId]));
  const personFromDoc=d=>personIdFromOwner(d.atendimentoId)||attendancePerson.get(d.atendimentoId)||'';

  let rows=[];
  if(type==='cadastros'){
    rows=people.map(p=>({
      id:p.id,tipo:'Cadastro',data:p.criadoEm||p.alteradoEm||'',usuario:p.criadoPor||p.usuario||'',
      pessoaId:p.id,pessoa:p.nome||'',cpf:p.cpf||'',detalhe:[p.cidade,p.jurisdicao,p.entidade].filter(Boolean).join(' · ')
    }));
  }else if(type==='documentos'){
    rows=documents.filter(d=>visible.has(personFromDoc(d))).map(d=>{
      const personId=personFromDoc(d),p=peopleById.get(personId);
      return {id:d.id,tipo:'Documento',data:d.criadoEm||d.alteradoEm||'',usuario:d.usuario||'',pessoaId:personId,pessoa:p?.nome||'',cpf:p?.cpf||'',detalhe:[d.categoria,d.nome,bool(d.vigente)?'vigente':'versão anterior'].filter(Boolean).join(' · ')};
    });
  }else if(type==='processos'){
    rows=processes.filter(p=>visible.has(p.pessoaId)).map(pr=>{
      const p=peopleById.get(pr.pessoaId);
      return {id:pr.id,tipo:'Processo',data:pr.distribuidoEm||pr.criadoEm||pr.alteradoEm||'',usuario:pr.responsavel||pr.usuario||'',pessoaId:pr.pessoaId,pessoa:p?.nome||'',cpf:p?.cpf||'',detalhe:[pr.numero,pr.juizo].filter(Boolean).join(' · ')};
    });
  }else{
    const docsById=new Map(documents.map(d=>[d.id,d]));
    const procById=new Map(processes.map(p=>[p.id,p]));
    const taskById=new Map(tasks.map(t=>[t.id,t]));
    rows=history.map(h=>{
      let personId='';
      if(visible.has(h.registroId))personId=h.registroId;
      const d=docsById.get(h.registroId);if(!personId&&d)personId=personFromDoc(d);
      const pr=procById.get(h.registroId);if(!personId&&pr)personId=pr.pessoaId||'';
      const t=taskById.get(h.registroId);if(!personId&&t)personId=t.pessoaId||'';
      if(isColonyUser(user)&&!visible.has(personId))return null;
      const p=peopleById.get(personId);
      return {id:h.id,tipo:h.entidade||'Atividade',data:h.alteradoEm||h.criadoEm||'',usuario:h.usuario||'',pessoaId:personId,pessoa:p?.nome||'',cpf:p?.cpf||'',detalhe:'Registro '+String(h.registroId||'')};
    }).filter(Boolean);
  }

  rows=rows.filter(row=>{
    if(!historyInRange(row.data,from,to))return false;
    if(userFilter&&!String(row.usuario||'').toLowerCase().includes(userFilter))return false;
    if(personFilter&&!([row.pessoa,row.cpf].join(' ').toLowerCase().includes(personFilter)))return false;
    if(search&&!([row.tipo,row.usuario,row.pessoa,row.cpf,row.detalhe].join(' ').toLowerCase().includes(search)))return false;
    return true;
  }).sort((a,b)=>String(b.data||'').localeCompare(String(a.data||'')));

  const pg=page(rows,q,50);
  return {tipo:type,itens:pg.rows,total:pg.total,offset:pg.offset,limit:pg.limit,hasMore:pg.hasMore};
}

async function taskTagCatalog(){
  const persisted=await all('TarefaTags');
  const byName=new Map(DEFAULT_TASK_TAGS.map(tag=>[
    tag.nome.toUpperCase(),
    {id:'DEFAULT_'+sha(tag.nome).slice(0,10),...tag,ativo:true,padrao:true}
  ]));
  for(const tag of persisted.filter(t=>bool(t.ativo))){
    const name=String(tag.nome||'').trim();
    if(name)byName.set(name.toUpperCase(),{id:tag.id,nome:name,cor:tag.cor||'#176e7d',ativo:true,padrao:false});
  }
  return [...byName.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR',{sensitivity:'base'}));
}

async function tagColorMap(){
  return new Map((await taskTagCatalog()).map(t=>[t.nome.toUpperCase(),t.cor||'#176e7d']));
}

async function assignableUsers(actor,distributionOnly=false){
  const users=(await all('Usuarios')).filter(u=>bool(u.ativo)&&has(u,distributionOnly?'distribuicao':'consulta'));
  return users.filter(user=>{
    if(!isColonyUser(actor))return true;
    const role=String(user.perfil||'').toUpperCase();
    return role==='COLONIA_PESCADOR'&&
      normalizeEntityScope(user.entidade)===normalizeEntityScope(actor.entidade);
  }).sort((a,b)=>String(a.nome||a.email).localeCompare(String(b.nome||b.email),'pt-BR',{sensitivity:'base'}))
    .map(u=>({id:u.id,nome:u.nome||u.email,funcao:u.funcao||'',email:u.email,perfil:u.perfil||'',entidade:u.entidade||''}));
}

function isTeamQueueTask(task){
  return String(task?.origem||'').toUpperCase().startsWith('COLONIA_EQUIPE');
}

function teamAssignable(user){
  const role=String(user?.perfil||'').toUpperCase();
  const fn=String(user?.funcao||'').trim().toLowerCase();
  return bool(user?.ativo)&&(
    role==='PROFESSOR_RESIDENTE'||
    role==='ADMIN'||
    fn==='professor'||
    fn==='residente'||
    has(user,'gestao_distribuicao')
  )&&!isColonyUser(user);
}

function countMap(rows){
  const map=new Map();
  for(const row of rows){
    if(row.tarefaId)map.set(row.tarefaId,(map.get(row.tarefaId)||0)+1);
  }
  return map;
}

function displayUser(email,usersByEmail){
  const u=usersByEmail.get(String(email||'').toLowerCase());
  return u?.nome||u?.email||String(email||'');
}

async function taskMaps(user,light=false){
  const [users,people,messages,attachments,reads,tags]=await Promise.all([
    all('Usuarios'),all('Pessoas'),
    light?Promise.resolve([]):all('TarefaMensagens'),
    light?Promise.resolve([]):all('TarefaAnexos'),
    light?Promise.resolve([]):all('TarefaLeituras'),
    taskTagCatalog()
  ]);
  const usersByEmail=new Map(users.map(u=>[emailOf(u),u]));
  const peopleById=new Map(people.map(p=>[p.id,p]));
  const messageCounts=countMap(messages),attachmentCounts=countMap(attachments);
  const tagColors=new Map(tags.map(t=>[t.nome.toUpperCase(),t.cor||'#176e7d']));
  const last=new Map();
  const bump=(id,when)=>{if(id&&when&&String(when)>String(last.get(id)||''))last.set(id,String(when));};
  if(!light){
    for(const m of messages)bump(m.tarefaId,m.criadoEm||m.alteradoEm);
    for(const a of attachments)bump(a.tarefaId,a.criadoEm||a.alteradoEm);
  }
  const readByTask=new Map(
    reads.filter(r=>emailOf({email:r.usuario})===emailOf(user)&&r.tarefaId)
      .map(r=>[r.tarefaId,r.ultimoVistoEm||''])
  );
  const globalSeen=reads
    .filter(r=>emailOf({email:r.usuario})===emailOf(user)&&!r.tarefaId)
    .sort((a,b)=>String(b.ultimoVistoEm||'').localeCompare(String(a.ultimoVistoEm||'')))[0]?.ultimoVistoEm||'';
  return {usersByEmail,peopleById,messageCounts,attachmentCounts,tagColors,last,readByTask,globalSeen};
}

function taskSummary(task,maps,user){
  const p=maps.peopleById.get(task.pessoaId);
  const responsible=maps.usersByEmail.get(String(task.responsavel||'').toLowerCase());
  const creator=maps.usersByEmail.get(String(task.criadoPor||'').toLowerCase());
  const due=dueState(task);
  const tagNames=task.tipo===DISTRIBUTION_TASK_TYPE
    ?(tagsParse(task.tags).length?tagsParse(task.tags):['PROCESSO'])
    :tagsParse(task.tags);
  const decorated=tagNames.map(nome=>({nome,cor:maps.tagColors.get(nome.toUpperCase())||'#176e7d'}));
  const lastMovement=maps.last.get(task.id)||task.alteradoEm||task.atribuidaEm||task.criadoEm||'';
  const seen=maps.readByTask.get(task.id)||'';
  const baseline=seen||task.atribuidaEm||task.criadoEm||'';

  const base={
    id:task.id,versao:task.versao,tipo:task.tipo,
    tipoLabel:task.tipo===DISTRIBUTION_TASK_TYPE?'Distribuição processual':'Tarefa interna',
    titulo:task.titulo||(task.tipo===DISTRIBUTION_TASK_TYPE?'Distribuir processo':'Tarefa'),
    descricao:task.descricao||'',pessoaId:task.pessoaId||'',pessoa:p?.nome||'',
    cpf:p?.cpf||'',pessoaCpf:p?.cpf||'',cidade:p?.cidade||'',pessoaCidade:p?.cidade||'',
    jurisdicao:task.jurisdicao||p?.jurisdicao||'',pessoaJurisdicao:p?.jurisdicao||'',
    pessoaEntidade:p?.entidade||'',valorCausa:Number(task.valorCausa||causeValue(p?.parcelasNaoRecebidas)),
    responsavel:task.responsavel||'',responsavelNome:responsible?.nome||responsible?.email||task.responsavel||'',
    criadoPor:task.criadoPor||'',criadoPorNome:creator?.nome||creator?.email||task.criadoPor||'',
    situacao:task.situacao||TASK_ASSIGNED,prioridade:task.prioridade||(task.tipo===DISTRIBUTION_TASK_TYPE?'ALTA':'NORMAL'),
    prazo:task.prazo||'',criadoEm:task.criadoEm||'',atribuidaEm:task.atribuidaEm||'',concluidaEm:task.concluidaEm||'',
    alteradoEm:task.alteradoEm||'',processoId:task.processoId||'',tags:decorated,
    modoDistribuicao:task.modoDistribuicao||'MANUAL',origem:task.origem||(task.tipo===DISTRIBUTION_TASK_TYPE?'CADASTRO':'INTERNA'),
    mensagens:Number(maps.messageCounts.get(task.id)||0),anexos:Number(maps.attachmentCounts.get(task.id)||0),
    vencimentoEstado:due.estado,horasRestantes:due.horas,dataDistribuicao:task.atribuidaEm||task.criadoEm||'',
    ultimaMovimentacaoEm:lastMovement,ultimoVistoEm:seen,
    novaManifestacao:!!(lastMovement&&baseline&&lastMovement>baseline),
    novaParaUsuario:emailOf(user)===String(task.responsavel||'').toLowerCase()||emailOf(user)===String(task.criadoPor||'').toLowerCase()
  };
  return base;
}

async function taskCollection(q,mode,user,{light=false}={}){
  q=q||{};
  const clauses=[],params=[];
  const bind=(sql,value)=>{params.push(value);clauses.push(sql.replace('$?','$'+params.length));};
  if(mode==='open')bind("COALESCE(situacao,'')<>$?",TASK_DONE);
  if(mode==='history')bind('situacao=$?',TASK_DONE);
  if(q.pessoaId)bind('pessoa_id=$?',q.pessoaId);
  if(q.responsavel)bind("lower(COALESCE(responsavel,''))=lower($?)",q.responsavel);
  if(q.tipo)bind('tipo=$?',q.tipo);
  const tasks=await whereAll('Tarefas',clauses.join(' AND ')||'TRUE',params);
  const maps=await taskMaps(user,light);
  const visibleIds=new Set(visiblePeople(user,[...maps.peopleById.values()]).map(p=>p.id));
  const done=t=>t.situacao===TASK_DONE;
  let rows=tasks.filter(task=>{
    if(task.pessoaId&&!visibleIds.has(task.pessoaId))return false;
    if(mode==='open'&&done(task))return false;
    if(mode==='history'&&!done(task))return false;
    if(q.pessoaId&&task.pessoaId!==q.pessoaId)return false;
    if(q.responsavel&&String(task.responsavel||'').toLowerCase()!==String(q.responsavel).toLowerCase())return false;
    if(q.participante){
      const e=String(q.participante).toLowerCase();
      if(e!==String(task.responsavel||'').toLowerCase()&&e!==String(task.criadoPor||'').toLowerCase())return false;
    }
    if(q.tipo&&task.tipo!==q.tipo)return false;
    const assigned=String(task.atribuidaEm||task.criadoEm||'').slice(0,10);
    const due=String(task.prazo||'').slice(0,10);
    if(q.atribuidaDe&&assigned<q.atribuidaDe)return false;
    if(q.atribuidaAte&&assigned>q.atribuidaAte)return false;
    if(q.prazoDe&&due<q.prazoDe)return false;
    if(q.prazoAte&&due>q.prazoAte)return false;
    return true;
  }).map(t=>taskSummary(t,maps,user));

  const term=String(q.busca||'').trim().toLowerCase();
  if(term){
    rows=rows.filter(t=>[
      t.titulo,t.descricao,t.pessoa,t.cpf,t.jurisdicao,t.responsavelNome,t.criadoPorNome,
      ...(t.tags||[]).map(tag=>tag.nome||tag)
    ].join(' ').toLowerCase().includes(term));
  }

  rows.sort((a,b)=>{
    if(mode==='history')return String(b.concluidaEm||b.alteradoEm||'').localeCompare(String(a.concluidaEm||a.alteradoEm||''));
    const weight={VENCIDA:0,ATE_24H:1,ATE_96H:2,NORMAL:3,SEM_PRAZO:4};
    if((weight[a.vencimentoEstado]??5)!==(weight[b.vencimentoEstado]??5))return (weight[a.vencimentoEstado]??5)-(weight[b.vencimentoEstado]??5);
    return String(a.prazo||'9999-12-31').localeCompare(String(b.prazo||'9999-12-31'));
  });

  const pg=page(rows,q,200);
  return {tarefas:pg.rows,total:pg.total,offset:pg.offset,limit:pg.limit,hasMore:pg.hasMore};
}

export async function tasksManagementOpen(q,user){
  requirePermission(user,'gestao_distribuicao');
  const result=await taskCollection(q,'open',user,{light:true});
  const c=await config();
  return {
    ...result,
    usuariosTarefas:await assignableUsers(user,false),
    usuariosDistribuicao:await assignableUsers(user,true),
    tags:await taskTagCatalog(),
    distribuicaoAutomatica:bool(c.distribuicaoAutomatica),
    indicadores:{
      totalAbertas:result.total,
      geraisAbertas:result.tarefas.filter(t=>t.tipo===GENERAL_TASK_TYPE).length,
      distribuicoesAbertas:result.tarefas.filter(t=>t.tipo===DISTRIBUTION_TASK_TYPE).length,
      semResponsavel:result.tarefas.filter(t=>!String(t.responsavel||'').trim()).length,
      ate96h:result.tarefas.filter(t=>['ATE_96H','ATE_24H','VENCIDA'].includes(t.vencimentoEstado)).length
    }
  };
}

export async function tasksHistory(q,user){
  requirePermission(user,'gestao_distribuicao');
  const result=await taskCollection(q,'history',user);
  return {...result,usuariosTarefas:await assignableUsers(user,false),tags:await taskTagCatalog()};
}

export async function myTasksOpen(q,user){
  const query=isColonyUser(user)
    ?{...(q||{}),participante:emailOf(user)}
    :{...(q||{}),responsavel:emailOf(user)};
  const result=await taskCollection(query,'open',user,{light:true});
  const available=has(user,'distribuicao')
    ?(await whereAll(
      'Tarefas',
      "tipo=$1 AND COALESCE(situacao,'')<>$2 AND btrim(COALESCE(responsavel,''))=''",
      [DISTRIBUTION_TASK_TYPE,TASK_DONE]
    )).length
    :0;
  return {...result,tags:await taskTagCatalog(),podeAssumirDistribuicao:has(user,'distribuicao'),distribuicoesDisponiveis:available};
}

export async function myTasksHistory(q,user){
  const query=isColonyUser(user)
    ?{...(q||{}),participante:emailOf(user)}
    :{...(q||{}),responsavel:emailOf(user)};
  const result=await taskCollection(query,'history',user);
  return {...result,tags:await taskTagCatalog()};
}

export async function personTasks(q,user){
  const person=await get('Pessoas',required(q.pessoaId,'pessoa'));
  authorizePersonScope(user,person);
  const result=await taskCollection({...q,pessoaId:person.id},bool(q.historico)?'history':'open',user);
  return {...result,tags:await taskTagCatalog()};
}

export async function taskCreateOptions(user){
  if(!has(user,'gestao_distribuicao')&&!has(user,'criar_tarefa_entidade'))throw httpError(403,'Você não possui permissão para criar tarefas.');
  return {
    usuarios:await assignableUsers(user,false),
    tags:await taskTagCatalog(),
    entidade:isColonyUser(user)?String(user.entidade||''):'',
    podeEncaminharEquipe:isColonyUser(user),
    destinos:isColonyUser(user)
      ?[
        {value:'ENTIDADE',label:'Atribuir dentro da minha entidade'},
        {value:'EQUIPE',label:'Encaminhar para a equipe Povo das Águas'}
      ]
      :[]
  };
}

async function requireGeneralTask(task,user){
  if(!task||task.tipo!==GENERAL_TASK_TYPE)throw httpError(400,'Tarefa interna inválida.');
  if(task.pessoaId){
    const p=await get('Pessoas',task.pessoaId);
    authorizePersonScope(user,p);
  }
  const email=emailOf(user);
  if(email!==String(task.criadoPor||'').toLowerCase()&&email!==String(task.responsavel||'').toLowerCase()&&!has(user,'gestao_distribuicao')){
    throw httpError(403,'Você não participa desta tarefa.');
  }
  return task;
}

export async function generalTaskDetail(q,user){
  const task=await requireGeneralTask(await get('Tarefas',required(q.id,'tarefa')),user);
  const maps=await taskMaps(user,false);
  const email=emailOf(user),creator=email===String(task.criadoPor||'').toLowerCase(),responsible=email===String(task.responsavel||'').toLowerCase();
  const [mov,users]=await Promise.all([generalTaskMovements({id:task.id},user),assignableUsers(user,false)]);
  return {
    tarefa:taskSummary(task,maps,user),
    mensagens:mov.mensagens,
    anexos:mov.anexos,
    usuarios:(creator||has(user,'gestao_distribuicao'))?users:[],
    permissoes:{
      gerenciar:creator||has(user,'gestao_distribuicao'),
      concluir:responsible||has(user,'gestao_distribuicao'),
      encaminharEquipe:isColonyUser(user)&&task.situacao!==TASK_DONE&&!isTeamQueueTask(task)&&(creator||responsible),
      conversar:true,
      anexar:true
    }
  };
}

export async function generalTaskMovements(q,user){
  const task=await requireGeneralTask(await get('Tarefas',required(q.id,'tarefa')),user);
  const [users,messages,attachments]=await Promise.all([all('Usuarios'),all('TarefaMensagens'),all('TarefaAnexos')]);
  const byEmail=new Map(users.map(u=>[emailOf(u),u]));
  return {
    mensagens:messages.filter(m=>m.tarefaId===task.id).sort((a,b)=>String(a.criadoEm||'').localeCompare(String(b.criadoEm||''))).map(m=>({
      id:m.id,autor:m.autor,autorNome:displayUser(m.autor,byEmail),mensagem:m.mensagem,criadoEm:m.criadoEm
    })),
    anexos:attachments.filter(a=>a.tarefaId===task.id).sort((a,b)=>String(b.criadoEm||'').localeCompare(String(a.criadoEm||''))).map(a=>({
      id:a.id,nome:a.nome,mime:a.mime,bytes:Number(a.bytes||0),enviadoPor:a.enviadoPor,enviadoPorNome:displayUser(a.enviadoPor,byEmail),criadoEm:a.criadoEm
    }))
  };
}

export async function generalTaskAttachmentContent(q,user){
  const task=await requireGeneralTask(await get('Tarefas',required(q.id,'tarefa')),user);
  const att=await get('TarefaAnexos',required(q.anexoId,'anexo'));
  if(att.tarefaId!==task.id)throw httpError(400,'O anexo não pertence à tarefa.');
  if(!String(att.fileId||'').startsWith('gcs:'))throw httpError(409,'Anexo legado ainda não migrado.');
  const file=bucket.file(String(att.fileId).slice(4));
  const [bytes]=await file.download();
  return {id:att.id,nome:att.nome||'anexo.pdf',mime:att.mime||'application/pdf',base64:bytes.toString('base64')};
}

async function saveRead(client,user,taskId=''){
  const email=emailOf(user);
  const existing=await findOne('TarefaLeituras','lower(usuario)=lower($1) AND coalesce(tarefa_id,\'\')=$2',[email,taskId],client);
  return change(client,{email},'TarefaLeituras',existing?.id||id('LEI',email+':'+taskId),{usuario:email,ultimoVistoEm:now(),tarefaId:taskId||null},existing?.versao);
}

export async function markTaskViewed(q,user){
  return tx(async client=>{
    const task=await get('Tarefas',required(q.id,'tarefa'),client);
    if(task.tipo===GENERAL_TASK_TYPE)await requireGeneralTask(task,user);
    else{
      const owner=emailOf(user)===String(task.responsavel||'').toLowerCase();
      if(!owner&&!has(user,'gestao_distribuicao'))throw httpError(403,'Você não possui acesso a esta tarefa.');
    }
    const saved=await saveRead(client,user,task.id);
    return {tarefaId:task.id,ultimoVistoEm:saved.ultimoVistoEm};
  });
}

function alertStateKey_(user){
  return 'alertasTratados:'+sha(emailOf(user)).slice(0,24);
}

async function alertState_(user,client){
  const key=alertStateKey_(user);
  const row=await findOne('Configuracoes','chave=$1',[key],client);
  let state={};
  if(row){
    try{state=typeof row.valor==='string'?JSON.parse(row.valor):row.valor||{};}catch{state={};}
  }
  if(!state||typeof state!=='object'||Array.isArray(state))state={};
  return {key,row,state};
}

async function saveAlertState_(user,state,client){
  const current=await alertState_(user,client);
  return change(
    client,
    {email:emailOf(user)},
    'Configuracoes',
    current.row?.id||id('CFG',current.key),
    {chave:current.key,valor:JSON.stringify(state)},
    current.row?.versao
  );
}

async function authorizeAlertTask_(task,user){
  if(task.tipo===GENERAL_TASK_TYPE){
    await requireGeneralTask(task,user);
    return;
  }
  const owner=emailOf(user)===String(task.responsavel||'').toLowerCase();
  if(!owner&&!has(user,'gestao_distribuicao'))throw httpError(403,'Você não possui acesso a este alerta.');
}

export async function notifications(user){
  const query=isColonyUser(user)
    ?{participante:emailOf(user),limit:60}
    :{responsavel:emailOf(user),limit:60};
  const [result,maps,stateData]=await Promise.all([
    taskCollection(query,'open',user),
    taskMaps(user,false),
    alertState_(user)
  ]);
  const globalSeen=maps.globalSeen||'';
  const itens=result.tarefas.map(item=>{
    const assigned=item.atribuidaEm||item.criadoEm||'';
    const nova=!!(assigned&&assigned>globalSeen)||!!item.novaManifestacao;
    const treated=stateData.state[item.id]||null;
    return {
      ...item,
      nova,
      tratado:!!treated,
      tratadoEm:treated?.tratadoEm||'',
      tratadoPor:treated?.tratadoPor||''
    };
  });
  const pendentes=itens.filter(item=>!item.tratado);
  const tratados=itens.filter(item=>item.tratado);
  return {
    itens,
    pendentes,
    tratados,
    naoLidas:pendentes.filter(item=>item.nova).length,
    naoTratados:pendentes.length,
    total:itens.length
  };
}

export async function markNotificationsSeen(user){
  return tx(async client=>{
    const saved=await saveRead(client,user,'');
    return {ok:true,ultimoVistoEm:saved.ultimoVistoEm};
  });
}

export async function treatNotification(q,user){
  return tx(async client=>{
    const task=await get('Tarefas',required(q.id,'alerta'),client);
    await authorizeAlertTask_(task,user);
    const current=await alertState_(user,client);
    current.state[task.id]={tratadoEm:now(),tratadoPor:emailOf(user)};
    await saveAlertState_(user,current.state,client);
    return {ok:true,id:task.id,tratado:true,tratadoEm:current.state[task.id].tratadoEm};
  });
}

export async function treatNotificationsBatch(q,user){
  const ids=[...new Set((Array.isArray(q.ids)?q.ids:[]).map(x=>String(x||'').trim()).filter(Boolean))].slice(0,100);
  if(!ids.length)throw httpError(400,'Selecione pelo menos um alerta.');
  return tx(async client=>{
    const current=await alertState_(user,client);
    const treatedAt=now();
    let count=0;
    for(const taskId of ids){
      const task=await get('Tarefas',taskId,client);
      await authorizeAlertTask_(task,user);
      current.state[task.id]={tratadoEm:treatedAt,tratadoPor:emailOf(user)};
      count++;
    }
    await saveAlertState_(user,current.state,client);
    return {ok:true,tratados:count,mensagem:count+' alerta(s) marcado(s) como tratado(s).'};
  });
}

export async function reopenNotification(q,user){
  return tx(async client=>{
    const task=await get('Tarefas',required(q.id,'alerta'),client);
    await authorizeAlertTask_(task,user);
    const current=await alertState_(user,client);
    delete current.state[task.id];
    await saveAlertState_(user,current.state,client);
    return {ok:true,id:task.id,tratado:false,mensagem:'Alerta reaberto.'};
  });
}

function taskTagsValue(tags){return tagsParse(tags);}

export async function generalTaskCreate(q,user){
  if(!has(user,'gestao_distribuicao')&&!has(user,'criar_tarefa_entidade'))throw httpError(403,'Você não possui permissão para criar tarefas.');
  return tx(async client=>{
    const title=String(required(q.titulo,'título da tarefa')).trim();
    if(title.length>160)throw httpError(400,'O título da tarefa deve ter no máximo 160 caracteres.');
    const description=String(q.descricao||'').trim();
    if(description.length>6000)throw httpError(400,'As informações da tarefa devem ter no máximo 6.000 caracteres.');

    const colony=isColonyUser(user);
    const destination=colony?String(q.destino||'ENTIDADE').trim().toUpperCase():'INTERNA';
    if(colony&&!['ENTIDADE','EQUIPE'].includes(destination))throw httpError(400,'Destino da tarefa inválido.');

    let pessoaId=String(q.pessoaId||'').trim();
    let person=null;
    if(pessoaId){
      person=await get('Pessoas',pessoaId,client);
      authorizePersonScope(user,person);
    }

    let responsible='',target=null,situation=TASK_PENDING,assignedAt='';
    if(!colony||destination==='ENTIDADE'){
      responsible=String(required(q.responsavel,'responsável')).trim().toLowerCase();
      target=await findOne('Usuarios','lower(email)=lower($1) AND ativo=true',[responsible],client);
      if(!target||!has(target,'consulta'))throw httpError(400,'Usuário responsável não localizado ou inativo.');
      const allowed=await assignableUsers(user,false);
      if(!allowed.some(u=>emailOf(u)===responsible))throw httpError(403,'Responsável fora do escopo permitido.');
      if(person&&isColonyUser(target)&&!personInUserScope(target,person))throw httpError(403,'O responsável informado não pode acessar este cadastro.');
      situation=TASK_ASSIGNED;
      assignedAt=now();
    }

    const entityKey=colony?normalizeEntityScope(user.entidade):'';
    const origin=colony
      ?(destination==='EQUIPE'?'COLONIA_EQUIPE:'+entityKey:'COLONIA_INTERNA:'+entityKey)
      :'INTERNA';
    const selectedTags=taskTagsValue(q.tags);
    if(colony&&!selectedTags.some(t=>String(t).toUpperCase()==='CRIADO PELA COLÔNIA')){
      selectedTags.push('CRIADO PELA COLÔNIA');
    }

    const taskId=id('TAR','GERAL:'+String(q.op||randomId('OP')));
    const task=await change(client,{email:user.email},'Tarefas',taskId,{
      tipo:GENERAL_TASK_TYPE,pessoaId,responsavel,situacao:situation,jurisdicao:person?.jurisdicao||'',valorCausa:'',
      atribuidaEm:assignedAt,concluidaEm:'',processoId:String(q.processoId||''),observacoes:'',
      titulo:title,descricao:description,criadoPor:emailOf(user),prazo:safeDate(q.prazo),
      prioridade:priority(q.prioridade),tags:selectedTags,modoDistribuicao:destination==='EQUIPE'?'FILA_EQUIPE':'MANUAL',
      origem:origin
    });

    if(destination==='EQUIPE'){
      return {tarefa:task,mensagem:'Tarefa encaminhada para a fila da equipe Povo das Águas, aguardando atribuição.'};
    }
    return {tarefa:task,mensagem:'Tarefa criada e atribuída a '+(target.nome||responsible)+'.'};
  });
}

export async function generalTaskAssign(q,user){
  return tx(async client=>{
    const task=await get('Tarefas',required(q.id,'tarefa'),client);
    await requireGeneralTask(task,user);
    if(emailOf(user)!==String(task.criadoPor||'').toLowerCase()&&!has(user,'gestao_distribuicao'))throw httpError(403,'Você não pode reatribuir esta tarefa.');
    const responsible=String(required(q.responsavel,'responsável')).toLowerCase();
    const target=await findOne('Usuarios','lower(email)=lower($1) AND ativo=true',[responsible],client);
    if(!target)throw httpError(400,'Responsável não localizado.');
    if(isTeamQueueTask(task)){
      if(!has(user,'gestao_distribuicao'))throw httpError(403,'Somente a equipe pode atribuir uma tarefa encaminhada pela Colônia.');
      if(!teamAssignable(target))throw httpError(400,'Tarefas encaminhadas pela Colônia devem ser atribuídas a Professor, Residente ou Administrador da equipe.');
    }else{
      const allowed=await assignableUsers(user,false);
      if(!allowed.some(u=>emailOf(u)===responsible))throw httpError(403,'Responsável fora do escopo permitido.');
    }
    if(task.pessoaId){
      const p=await get('Pessoas',task.pessoaId,client);
      if(isColonyUser(target)&&!personInUserScope(target,p))throw httpError(403,'O responsável não pode acessar este cadastro.');
    }
    const updated=await change(client,{email:user.email},'Tarefas',task.id,{...task,responsavel:target.email,situacao:TASK_ASSIGNED,atribuidaEm:now(),concluidaEm:'',modoDistribuicao:isTeamQueueTask(task)?'EQUIPE_MANUAL':task.modoDistribuicao},q.versao??task.versao);
    return {tarefa:updated,mensagem:'Tarefa reatribuída.'};
  });
}

export async function generalTaskForwardTeam(q,user){
  if(!isColonyUser(user))throw httpError(403,'Somente agentes de Entidade/Colônia podem encaminhar tarefas para a equipe.');
  return tx(async client=>{
    const task=await get('Tarefas',required(q.id,'tarefa'),client);
    await requireGeneralTask(task,user);
    if(task.situacao===TASK_DONE)throw httpError(400,'Tarefa concluída não pode ser encaminhada.');
    if(isTeamQueueTask(task)&&!String(task.responsavel||'').trim()){
      return {tarefa:task,mensagem:'A tarefa já está aguardando distribuição pela equipe.'};
    }
    const email=emailOf(user);
    const participant=email===String(task.criadoPor||'').toLowerCase()||email===String(task.responsavel||'').toLowerCase();
    if(!participant)throw httpError(403,'Você não participa desta tarefa.');

    const entityKey=normalizeEntityScope(user.entidade);
    const tags=taskTagsValue(task.tags);
    if(!tags.some(t=>String(t).toUpperCase()==='CRIADO PELA COLÔNIA'))tags.push('CRIADO PELA COLÔNIA');

    const updated=await change(client,{email:user.email},'Tarefas',task.id,{
      ...task,
      responsavel:'',
      situacao:TASK_PENDING,
      atribuidaEm:'',
      concluidaEm:'',
      tags,
      modoDistribuicao:'FILA_EQUIPE',
      origem:'COLONIA_EQUIPE:'+entityKey,
      observacoes:[
        String(task.observacoes||'').trim(),
        'Encaminhada para a equipe Povo das Águas por '+(user.nome||user.email)+'.'
      ].filter(Boolean).join('\n')
    },q.versao??task.versao);

    await change(client,{email:user.email},'TarefaMensagens',randomId('MSG'),{
      tarefaId:task.id,
      autor:email,
      mensagem:'Tarefa encaminhada para a fila da equipe Povo das Águas, aguardando atribuição.'
    });
    return {tarefa:updated,mensagem:'Tarefa encaminhada para a equipe e colocada na fila de distribuição.'};
  });
}

export async function generalTaskComplete(q,user){
  return tx(async client=>{
    const task=await get('Tarefas',required(q.id,'tarefa'),client);
    await requireGeneralTask(task,user);
    const owner=emailOf(user)===String(task.responsavel||'').toLowerCase();
    if(!owner&&!has(user,'gestao_distribuicao'))throw httpError(403,'Somente o responsável pode concluir esta tarefa.');
    const updated=await change(client,{email:user.email},'Tarefas',task.id,{...task,situacao:TASK_DONE,concluidaEm:now()},q.versao??task.versao);
    return {tarefa:updated,mensagem:'Tarefa concluída.'};
  });
}

export async function generalTaskReopen(q,user){
  return tx(async client=>{
    const task=await get('Tarefas',required(q.id,'tarefa'),client);
    await requireGeneralTask(task,user);
    if(emailOf(user)!==String(task.criadoPor||'').toLowerCase()&&!has(user,'gestao_distribuicao'))throw httpError(403,'Você não pode reabrir esta tarefa.');
    const updated=await change(client,{email:user.email},'Tarefas',task.id,{...task,situacao:TASK_ASSIGNED,concluidaEm:''},q.versao??task.versao);
    return {tarefa:updated,mensagem:'Tarefa reaberta.'};
  });
}

export async function generalTaskMessageSend(q,user){
  return tx(async client=>{
    const task=await get('Tarefas',required(q.id,'tarefa'),client);
    await requireGeneralTask(task,user);
    const message=String(required(q.mensagem,'mensagem')).trim();
    if(message.length>6000)throw httpError(400,'A mensagem deve ter no máximo 6.000 caracteres.');
    const saved=await change(client,{email:user.email},'TarefaMensagens',randomId('MSG'),{tarefaId:task.id,autor:emailOf(user),mensagem:message});
    return {mensagem:saved,ok:true};
  });
}

export async function generalTaskAttachmentAdd(q,user){
  return tx(async client=>{
    const task=await get('Tarefas',required(q.id,'tarefa'),client);
    await requireGeneralTask(task,user);
    const mime=String(q.mime||'').toLowerCase();
    if(mime!=='application/pdf')throw httpError(400,'Somente arquivos PDF podem ser anexados.');
    const bytes=Buffer.from(String(q.base64||''),'base64');
    if(!bytes.length||bytes.length>MAX_FILE_BYTES||bytes.subarray(0,5).toString()!=='%PDF-')throw httpError(400,'PDF inválido ou maior que 5 MB.');
    const aid=randomId('ANX');
    const object='tarefas/'+task.id+'/'+Date.now()+'_'+aid+'.pdf';
    await bucket.file(object).save(bytes,{contentType:'application/pdf',resumable:false,metadata:{metadata:{taskId:task.id,uploadedBy:user.email}}});
    const saved=await change(client,{email:user.email},'TarefaAnexos',aid,{
      tarefaId:task.id,fileId:'gcs:'+object,url:'/api/v1/task-attachments/'+aid,nome:String(q.nome||'anexo.pdf').slice(0,220),
      mime:'application/pdf',hash:sha(bytes),bytes:bytes.length,enviadoPor:emailOf(user),pessoaId:task.pessoaId||'',documentoId:''
    });
    return {anexo:saved,ok:true};
  });
}

export async function taskTagSave(q,user){
  requirePermission(user,'administracao');
  return tx(async client=>{
    const nome=String(required(q.nome,'nome da tag')).trim().slice(0,40);
    const cor=String(q.cor||'#176e7d').trim();
    if(!/^#[0-9a-fA-F]{6}$/.test(cor))throw httpError(400,'Informe a cor no formato #RRGGBB.');
    let existing=q.id?await get('TarefaTags',q.id,client):await findOne('TarefaTags','lower(nome)=lower($1)',[nome],client);
    const saved=await change(client,{email:user.email},'TarefaTags',existing?.id||randomId('TAG'),{nome,cor,ativo:q.ativo===undefined?true:bool(q.ativo)},existing?.versao);
    return {tag:saved,mensagem:existing?'Tag atualizada.':'Tag criada.'};
  });
}

export async function taskTagDelete(q,user){
  requirePermission(user,'administracao');
  return tx(async client=>{
    const tag=await get('TarefaTags',required(q.id,'tag'),client);
    await remove(client,{email:user.email},'TarefaTags',tag.id,tag.versao);
    return {ok:true,mensagem:'Tag excluída.'};
  });
}

export async function taskTagsData(){
  return {tags:await taskTagCatalog()};
}

export async function taskTagAdminList(){
  const active=await taskTagCatalog();
  const persisted=await all('TarefaTags');
  const seen=new Set(active.map(t=>t.nome.toUpperCase()));
  for(const tag of persisted.filter(t=>!bool(t.ativo)&&!seen.has(String(t.nome||'').toUpperCase()))){
    active.push({id:tag.id,nome:tag.nome,cor:tag.cor||'#176e7d',ativo:false,padrao:false});
  }
  return active;
}

export async function batchAssign(q,user){
  requirePermission(user,'gestao_distribuicao');
  const ids=Array.isArray(q.ids)?q.ids:[];
  const responsible=String(required(q.responsavel,'responsável')).toLowerCase();
  return tx(async client=>{
    const target=await findOne('Usuarios','lower(email)=lower($1) AND ativo=true',[responsible],client);
    if(!target)throw httpError(400,'Responsável não localizado.');
    const changed=[];
    for(const taskId of ids){
      const task=await get('Tarefas',taskId,client);
      if(task.situacao===TASK_DONE)continue;
      if(task.tipo===DISTRIBUTION_TASK_TYPE&&!has(target,'distribuicao'))throw httpError(400,'Responsável sem permissão para distribuição.');
      if(isTeamQueueTask(task)&&!teamAssignable(target))throw httpError(400,'Tarefa encaminhada pela Colônia deve ser atribuída a Professor, Residente ou Administrador da equipe.');
      const updated=await change(client,{email:user.email},'Tarefas',task.id,{...task,responsavel:target.email,situacao:TASK_ASSIGNED,atribuidaEm:now(),modoDistribuicao:isTeamQueueTask(task)?'EQUIPE_MANUAL':task.modoDistribuicao},task.versao);
      changed.push(updated);
    }
    return {alteradas:changed.length,tarefas:changed,mensagem:changed.length+' tarefa(s) atribuída(s).'};
  });
}

export async function claimNextDistribution(user){
  requirePermission(user,'distribuicao');
  return tx(async client=>{
    const tasks=(await all('Tarefas',client))
      .filter(t=>t.tipo===DISTRIBUTION_TASK_TYPE&&t.situacao!==TASK_DONE&&!String(t.responsavel||'').trim())
      .sort((a,b)=>String(a.criadoEm||'').localeCompare(String(b.criadoEm||'')));
    const task=tasks[0];
    if(!task)return {ok:false,mensagem:'Não há tarefas de distribuição disponíveis.'};
    const p=task.pessoaId?await get('Pessoas',task.pessoaId,client):null;
    if(p&&!personInUserScope(user,p))throw httpError(403,'A próxima tarefa disponível está fora do seu escopo.');
    const updated=await change(client,{email:user.email},'Tarefas',task.id,{...task,responsavel:user.email,situacao:TASK_ASSIGNED,atribuidaEm:now(),modoDistribuicao:'ASSUMIDA'},task.versao);
    return {ok:true,tarefa:updated,mensagem:'Próxima tarefa assumida.'};
  });
}

export async function distributionAutoSave(q,user){
  requirePermission(user,'gestao_distribuicao');
  return tx(async client=>{
    const old=await findOne('Configuracoes','chave=$1',['distribuicaoAutomatica'],client);
    const enabled=bool(q.ativo);
    await change(client,{email:user.email},'Configuracoes',old?.id||id('CFG','distribuicaoAutomatica'),{chave:'distribuicaoAutomatica',valor:enabled},old?.versao);
    return {ativo:enabled,mensagem:enabled?'Distribuição automática ativada.':'Distribuição automática desativada.'};
  });
}

export async function distributionAutoRun(user){
  requirePermission(user,'gestao_distribuicao');
  return tx(async client=>{
    const users=(await all('Usuarios',client)).filter(u=>bool(u.ativo)&&has(u,'distribuicao'));
    const tasks=await all('Tarefas',client);
    const pending=tasks.filter(t=>t.tipo===DISTRIBUTION_TASK_TYPE&&t.situacao===TASK_PENDING&&!String(t.responsavel||'').trim()).sort((a,b)=>String(a.criadoEm||'').localeCompare(String(b.criadoEm||'')));
    const openCount=email=>tasks.filter(t=>t.tipo===DISTRIBUTION_TASK_TYPE&&t.situacao!==TASK_DONE&&String(t.responsavel||'').toLowerCase()===email).length;
    const changed=[];
    for(const task of pending){
      const sorted=users.slice().sort((a,b)=>openCount(emailOf(a))-openCount(emailOf(b))||String(a.nome||a.email).localeCompare(String(b.nome||b.email),'pt-BR'));
      const target=sorted[0];if(!target)break;
      const updated=await change(client,{email:user.email},'Tarefas',task.id,{...task,responsavel:target.email,situacao:TASK_ASSIGNED,atribuidaEm:now(),modoDistribuicao:'AUTOMATICA'},task.versao);
      tasks[tasks.findIndex(t=>t.id===task.id)]=updated;changed.push(updated);
    }
    return {atribuidas:changed.length,alteradas:changed,mensagem:changed.length?changed.length+' tarefa(s) distribuída(s) automaticamente.':'Não havia tarefas pendentes.'};
  });
}

export async function rankingData(q,user){
  const from=String(q?.de||q?.inicio||''),to=String(q?.ate||q?.fim||'');
  const inRange=value=>{const day=String(value||'').slice(0,10);if(!day)return false;if(from&&day<from)return false;if(to&&day>to)return false;return true;};
  const [users,sessions,people,tasks,processes]=await Promise.all([all('Usuarios'),all('Sessoes'),all('Pessoas'),all('Tarefas'),all('Processos')]);
  const rows=users.filter(u=>bool(u.ativo)).map(u=>{
    const email=emailOf(u);
    const logins=sessions.filter(s=>s.usuarioId===u.id&&(!from&&!to||inRange(s.criadoEm))).length;
    const cadastros=people.filter(p=>String(p.criadoPor||p.usuario||'').toLowerCase()===email&&(!from&&!to||inRange(p.criadoEm))).length;
    const tarefasConcluidas=tasks.filter(t=>String(t.responsavel||'').toLowerCase()===email&&t.situacao===TASK_DONE&&(!from&&!to||inRange(t.concluidaEm))).length;
    const processosDistribuidos=processes.filter(p=>String(p.responsavel||'').toLowerCase()===email&&(!from&&!to||inRange(p.distribuidoEm||p.criadoEm))).length;
    return {email,nome:u.nome||u.email,funcao:u.funcao||u.perfil||'',cadastros,tarefasConcluidas,processosDistribuidos,logins,mediaProcessosPorLogin:logins?processosDistribuidos/logins:0};
  });
  const rank=key=>new Map(rows.slice().sort((a,b)=>Number(b[key]||0)-Number(a[key]||0)||a.nome.localeCompare(b.nome,'pt-BR')).map((r,i)=>[r.email,i+1]));
  const rc=rank('cadastros'),rt=rank('tarefasConcluidas'),rp=rank('processosDistribuidos'),rm=rank('mediaProcessosPorLogin');
  return {
    linhas:rows.map(r=>({
      ...r,
      rankCadastros:rc.get(r.email),
      rankTarefas:rt.get(r.email),
      rankProcessos:rp.get(r.email),
      rankMedia:rm.get(r.email),
      posicaoCadastros:rc.get(r.email),
      posicaoTarefas:rt.get(r.email),
      posicaoDistribuicao:rp.get(r.email)
    })),
    de:from,
    ate:to
  };
}

export async function profileRanking(q,user){
  const input={...(q||{})};
  const isoDay=date=>date.toISOString().slice(0,10);
  let from=String(input.de||input.inicio||'');
  let to=String(input.ate||input.fim||'');

  if(!from&&!to){
    const today=new Date();
    from=isoDay(new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1)));
    to=isoDay(today);
  }

  const current=await rankingData({de:from,ate:to},user);
  const row=current.linhas.find(r=>r.email===emailOf(user))||null;

  const currentStart=new Date(from+'T00:00:00Z');
  const currentEnd=new Date(to+'T00:00:00Z');
  const spanDays=Math.max(0,Math.round((currentEnd-currentStart)/86400000));
  const previousEnd=new Date(currentStart.getTime()-86400000);
  const previousStart=new Date(previousEnd.getTime()-spanDays*86400000);
  const previous=await rankingData({de:isoDay(previousStart),ate:isoDay(previousEnd)},user);
  const previousRow=previous.linhas.find(r=>r.email===emailOf(user))||null;

  const deltaRank=key=>row&&previousRow?Number(previousRow[key]||0)-Number(row[key]||0):0;
  const deltaValue=key=>row&&previousRow?Number(row[key]||0)-Number(previousRow[key]||0):0;

  return {
    usuario:row,
    ranking:row,
    perfil:publicUser(user),
    totalUsuarios:current.linhas.length,
    de:current.de,
    ate:current.ate,
    periodo:{de:current.de,ate:current.ate},
    comparativo:{
      de:previous.de,
      ate:previous.ate,
      usuario:previousRow,
      evolucao:{
        rankCadastros:deltaRank('rankCadastros'),
        rankTarefas:deltaRank('rankTarefas'),
        rankProcessos:deltaRank('rankProcessos'),
        cadastros:deltaValue('cadastros'),
        tarefasConcluidas:deltaValue('tarefasConcluidas'),
        processosDistribuidos:deltaValue('processosDistribuidos')
      }
    }
  };
}

export async function personDeletePreview(q,user){
  requirePermission(user,'administracao');
  const person=await get('Pessoas',required(q.id||q.pessoaId,'pessoa'));
  const [docs,attendances,processes,tasks,minutas]=await Promise.all([relatedDocs(person.id),all('Atendimentos'),all('Processos'),all('Tarefas'),all('Minutas')]);
  const personAttendances=attendances.filter(a=>a.pessoaId===person.id);
  const attendanceIds=new Set(personAttendances.map(a=>a.id));
  const owner=personOwnerKey(person.id);
  const contagens={
    documentos:docs.length,
    atendimentos:personAttendances.length,
    processos:processes.filter(p=>p.pessoaId===person.id).length,
    tarefas:tasks.filter(t=>t.pessoaId===person.id).length,
    minutas:minutas.filter(m=>String(m.atendimentoId||'')===owner||attendanceIds.has(m.atendimentoId)).length
  };
  return {
    pessoa:{id:person.id,nome:person.nome,cpf:person.cpf,versao:person.versao},
    contagens,
    ...contagens,
    exigeConfirmacaoReforcada:(contagens.processos+contagens.tarefas+contagens.atendimentos)>0
  };
}

export async function personDeleteCascade(q,user){
  requirePermission(user,'administracao');
  if(q?.confirmar!==true)throw httpError(400,'Confirmação explícita obrigatória para excluir o cadastro.');

  const filesToDelete=new Set();
  const addFile=fileId=>{
    const value=String(fileId||'');
    if(value.startsWith('gcs:')&&value.length>4)filesToDelete.add(value.slice(4));
  };

  const result=await tx(async client=>{
    const person=await get('Pessoas',required(q.id||q.pessoaId,'pessoa'),client);

    if(q.versao===undefined||Number(q.versao)!==Number(person.versao)){
      throw httpError(409,'O cadastro foi alterado. Reabra a ficha antes de confirmar a exclusão.');
    }

    const expectedCpf=String(person.cpf||'').replace(/\D/g,'');
    const confirmedCpf=String(q.cpfConfirmacao||'').replace(/\D/g,'');
    if(!expectedCpf||confirmedCpf!==expectedCpf){
      throw httpError(400,'O CPF de confirmação não corresponde ao cadastro.');
    }

    const attendances=(await all('Atendimentos',client)).filter(a=>a.pessoaId===person.id);
    const attendanceIds=new Set(attendances.map(a=>a.id));
    const owner=personOwnerKey(person.id);
    const docs=(await all('Documentos',client)).filter(d=>d.atendimentoId===owner||attendanceIds.has(d.atendimentoId));
    const tasks=(await all('Tarefas',client)).filter(t=>t.pessoaId===person.id);
    const processes=(await all('Processos',client)).filter(p=>p.pessoaId===person.id);
    const minutas=(await all('Minutas',client)).filter(m=>m.atendimentoId===owner||attendanceIds.has(m.atendimentoId));

    if((attendances.length||tasks.length||processes.length)&&q.confirmarVinculos!==true){
      throw httpError(400,'A exclusão de vínculos exige confirmação reforçada.');
    }

    const taskIds=new Set(tasks.map(t=>t.id));
    const taskAttachments=(await all('TarefaAnexos',client)).filter(a=>taskIds.has(a.tarefaId));

    for(const doc of docs)addFile(doc.fileId);
    for(const minuta of minutas){
      addFile(minuta.fileId);
      addFile(minuta.pdfFileId);
    }
    for(const attachment of taskAttachments)addFile(attachment.fileId);

    for(const doc of docs)await remove(client,{email:user.email},'Documentos',doc.id,doc.versao);
    for(const minuta of minutas)await remove(client,{email:user.email},'Minutas',minuta.id,minuta.versao);
    for(const task of tasks)await remove(client,{email:user.email},'Tarefas',task.id,task.versao);
    for(const proc of processes)await remove(client,{email:user.email},'Processos',proc.id,proc.versao);
    for(const att of attendances)await remove(client,{email:user.email},'Atendimentos',att.id,att.versao);
    await remove(client,{email:user.email},'Pessoas',person.id,person.versao);

    return {
      ok:true,
      id:person.id,
      removidos:{
        documentos:docs.length,
        minutas:minutas.length,
        tarefas:tasks.length,
        processos:processes.length,
        atendimentos:attendances.length
      },
      mensagem:'Cadastro e vínculos operacionais excluídos.'
    };
  });

  await Promise.all(
    [...filesToDelete].map(name=>bucket.file(name).delete({ignoreNotFound:true}).catch(()=>{}))
  );

  return result;
}
