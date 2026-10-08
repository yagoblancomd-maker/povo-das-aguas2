import {Storage} from '@google-cloud/storage';
import {
  all,whereAll,get,findOne,change,remove,config,id,randomId,now,bool,required,httpError,
  jurisdiction,causeValue,moneyBR,address,personOwnerKey,personIdFromOwner,docLabel,
  canRetify,canWritePersonContent,validatePerson,requirePermission,profileDetails,
  idempotentMutation,DEFAULTS,PERMISSIONS,ROLE_DESCRIPTIONS,STORAGE_BUCKET,MAX_FILE_BYTES,sha,
  personInUserScope,authorizePersonScope,forcePersonEntity,normalizeEntityScope,isColonyUser
} from './core.mjs';
import {modules,permissions,publicUser,ROLES,has} from './access.mjs';
import {getPool} from './db.mjs';
import {getSecret,saveSecret,secretConfigured,SECRET_IDS} from './secrets.mjs';
import {importDocuments} from './document-import.mjs';
import {modelStatus,uploadModel,generateInitial,generateSeguroReport,generateDocumentsZip,listDocumentModels,saveDocumentModel,setDocumentModelActive,deleteDocumentModel,generateFromDocumentModel} from './generator.mjs';
import {normalizeUsername,adminResetPassword} from './auth.mjs';
import {
  personListLite,personQuickSummary,personDocumentsPage,personDocumentContent,
  personProcessesPage,personAttendancesPage,personHistoryPage,personDrawerInitial,
  globalHistory,tasksManagementOpen,tasksHistory,myTasksOpen,myTasksHistory,
  personTasks,taskCreateOptions,generalTaskDetail,generalTaskMovements,
  generalTaskAttachmentContent,markTaskViewed,notifications,markNotificationsSeen,treatNotification,treatNotificationsBatch,reopenNotification,
  generalTaskCreate,generalTaskAssign,generalTaskForwardTeam,generalTaskComplete,generalTaskReopen,
  generalTaskMessageSend,generalTaskAttachmentAdd,taskTagSave,taskTagDelete,
  taskTagsData,taskTagAdminList,batchAssign,claimNextDistribution,
  distributionAutoSave,distributionAutoRun,rankingData,profileRanking,
  personDeletePreview,personDeleteCascade
} from './compat.mjs';
import {listProcesses,filterOptions,processDetail,syncProcess} from './datajud.mjs';
import {listVisuals,visualContent,randomVisual,uploadVisual,saveVisualMeta,deleteVisual} from './visuals.mjs';

const storage=new Storage();
const bucket=storage.bucket(STORAGE_BUCKET);
const TASK_TYPE='DISTRIBUICAO_PROCESSO';
const TASK_PENDING='PENDENTE_ATRIBUICAO';
const TASK_ASSIGNED='ATRIBUIDA';
const TASK_DONE='CONCLUIDA';

function currentEmail(user){return String(user.email||'').trim().toLowerCase();}
function formatPerson(p){return p;}
function documentUrl(doc){return doc.url||('/api/v1/files/'+encodeURIComponent(doc.id));}

async function dashboard(user,client){
  const [people,docs,processes,history,tasks]=await Promise.all([
    all('Pessoas',client),all('Documentos',client),all('Processos',client),all('Historico',client),all('Tarefas',client)
  ]);
  const scopedPeople=people.filter(p=>personInUserScope(user,p));
  const visibleIds=new Set(scopedPeople.map(p=>p.id));
  const peopleById=new Map(scopedPeople.map(p=>[p.id,p]));
  const current=currentEmail(user);
  const activeDocs=docs.filter(d=>{
    if(!bool(d.vigente))return false;
    const personId=personIdFromOwner(d.atendimentoId);
    return personId&&visibleIds.has(personId);
  });
  const scopedProcesses=processes.filter(p=>visibleIds.has(p.pessoaId));
  const scopedTasks=tasks.filter(t=>!t.pessoaId||visibleIds.has(t.pessoaId));
  const description=h=>{
    if(h.entidade==='Pessoas'){const p=peopleById.get(h.registroId);return p?'Cadastro atualizado · '+p.nome:'Cadastro de pessoa atualizado';}
    if(h.entidade==='Documentos')return 'Documento atualizado';
    if(h.entidade==='Processos')return 'Processo judicial atualizado';
    if(h.entidade==='Usuarios')return 'Usuário e permissões atualizados';
    if(h.entidade==='Configuracoes')return 'Configuração do sistema atualizada';
    return h.entidade?h.entidade+' atualizado':'Registro atualizado';
  };
  const jurisdictions={};
  for(const p of scopedPeople){const k=p.jurisdicao||'NÃO DEFINIDA';jurisdictions[k]=(jurisdictions[k]||0)+1;}
  return {
    atualizadoEm:now(),
    pessoas:scopedPeople.length,
    documentos:activeDocs.length,
    aConferir:activeDocs.filter(d=>!bool(d.conferido)).length,
    iniciais:activeDocs.filter(d=>d.categoria==='INICIAL_SEGURO_DEFESO_2025').length,
    relatorios:activeDocs.filter(d=>d.categoria==='RELATORIO_SEGURO_DEFESO_2025').length,
    acoesTramitacao:scopedProcesses.length,
    minhasTarefas:scopedTasks.filter(t=>t.situacao!==TASK_DONE&&String(t.responsavel||'').toLowerCase()===current).length,
    valorCausas:scopedPeople.reduce((s,p)=>s+causeValue(p.parcelasNaoRecebidas),0),
    valorCausasTramitacao:scopedProcesses.reduce((s,pr)=>s+causeValue(peopleById.get(pr.pessoaId)?.parcelasNaoRecebidas),0),
    jurisdicoes:jurisdictions,
    ultimosCadastros:scopedPeople.slice().sort((a,b)=>String(b.criadoEm||'').localeCompare(String(a.criadoEm||''))).slice(0,6).map(p=>({
      id:p.id,nome:p.nome,cpf:p.cpf,cidade:p.cidade,jurisdicao:p.jurisdicao,criadoEm:p.criadoEm,
      documentos:activeDocs.filter(d=>d.atendimentoId===personOwnerKey(p.id)).length
    })),
    atividades:history.slice().sort((a,b)=>String(b.alteradoEm||b.criadoEm||'').localeCompare(String(a.alteradoEm||a.criadoEm||''))).slice(0,7).map(h=>({
      id:h.id,entidade:h.entidade,registroId:h.registroId,data:h.alteradoEm||h.criadoEm||'',usuario:h.usuario||'',descricao:description(h)
    }))
  };
}

async function dossier(q,user,client){
  required(q.pessoaId,'pessoa');
  const p=await get('Pessoas',q.pessoaId,client);
  authorizePersonScope(user,p);
  const owner=personOwnerKey(p.id);
  const [docs,processes,history,attendances,minutas]=await Promise.all([
    all('Documentos',client),
    all('Processos',client),
    all('Historico',client),
    all('Atendimentos',client),
    all('Minutas',client)
  ]);
  const personAttendances=attendances.filter(a=>a.pessoaId===p.id);
  const attendanceIds=new Set(personAttendances.map(a=>a.id));
  const personDocs=docs
    .filter(d=>d.atendimentoId===owner||attendanceIds.has(d.atendimentoId))
    .map(d=>({...d,url:documentUrl(d)}));
  const personProcesses=processes.filter(x=>x.pessoaId===p.id);
  const personMinutas=minutas.filter(m=>m.atendimentoId===owner||attendanceIds.has(m.atendimentoId));
  const related=[
    p.id,
    ...personAttendances.map(a=>a.id),
    ...personDocs.map(d=>d.id),
    ...personProcesses.map(x=>x.id),
    ...personMinutas.map(m=>m.id)
  ];
  return {
    pessoa:p,podeRetificar:canRetify(user,p),podeGerenciarConteudo:canWritePersonContent(user,p),
    criador:p.criadoPor||p.usuario||'',documentos:personDocs,documentosPessoa:personDocs,processos:personProcesses,
    historico:history.filter(h=>related.includes(h.registroId)),atendimentos:personAttendances,pendencias:[],minutas:personMinutas,aptidao:[]
  };
}

function taskSummary(task,peopleById,usersByEmail){
  const p=peopleById.get(task.pessoaId);
  const responsible=usersByEmail.get(String(task.responsavel||'').toLowerCase());
  return {
    id:task.id,versao:task.versao,pessoaId:task.pessoaId,pessoa:p?.nome||'Pessoa não localizada',
    cpf:p?.cpf||'',cidade:p?.cidade||'',jurisdicao:task.jurisdicao||p?.jurisdicao||'',
    valorCausa:Number(task.valorCausa||causeValue(p?.parcelasNaoRecebidas)),responsavel:task.responsavel||'',
    responsavelNome:responsible?(responsible.nome||responsible.email):'',situacao:task.situacao,
    criadoEm:task.criadoEm,atribuidaEm:task.atribuidaEm,concluidaEm:task.concluidaEm,processoId:task.processoId||''
  };
}

async function distributionUsers(client){
  const users=await all('Usuarios',client);
  return users.filter(u=>bool(u.ativo)&&has(u,'distribuicao')).sort((a,b)=>String(a.nome||a.email).localeCompare(String(b.nome||b.email),'pt-BR',{sensitivity:'base'})).map(u=>({
    id:u.id,nome:u.nome||u.email,funcao:u.funcao||'',email:u.email,perfil:u.perfil
  }));
}

async function distributionQueue(user,client){
  const [people,users,tasks]=await Promise.all([
    all('Pessoas',client),
    all('Usuarios',client),
    whereAll('Tarefas','tipo=$1',[TASK_TYPE],client)
  ]);
  const scoped=people.filter(p=>personInUserScope(user,p));
  const peopleById=new Map(scoped.map(p=>[p.id,p]));
  const visibleIds=new Set(scoped.map(p=>p.id));
  const usersByEmail=new Map(users.map(u=>[String(u.email||'').toLowerCase(),u]));
  const rows=tasks.filter(t=>t.tipo===TASK_TYPE&&visibleIds.has(t.pessoaId)).sort((a,b)=>{
    const ad=a.situacao===TASK_DONE,bd=b.situacao===TASK_DONE;if(ad!==bd)return ad?1:-1;
    return String(b.alteradoEm||b.criadoEm||'').localeCompare(String(a.alteradoEm||a.criadoEm||''));
  }).map(t=>taskSummary(t,peopleById,usersByEmail));
  return {tarefas:rows,usuarios:await distributionUsers(client),indicadores:{
    semResponsavel:rows.filter(t=>t.situacao===TASK_PENDING).length,
    atribuidas:rows.filter(t=>t.situacao===TASK_ASSIGNED).length,
    concluidas:rows.filter(t=>t.situacao===TASK_DONE).length
  }};
}

async function myTasks(user,client){
  const email=currentEmail(user);
  const [people,users,tasks]=await Promise.all([
    all('Pessoas',client),
    all('Usuarios',client),
    whereAll('Tarefas',"tipo=$1 AND lower(COALESCE(responsavel,''))=$2",[TASK_TYPE,email],client)
  ]);
  const scoped=people.filter(p=>personInUserScope(user,p));
  const visibleIds=new Set(scoped.map(p=>p.id));
  const peopleById=new Map(scoped.map(p=>[p.id,p])),usersByEmail=new Map(users.map(u=>[String(u.email||'').toLowerCase(),u]));
  const rows=tasks.filter(t=>t.tipo===TASK_TYPE&&visibleIds.has(t.pessoaId)&&String(t.responsavel||'').toLowerCase()===email)
    .sort((a,b)=>(a.situacao===TASK_DONE)-(b.situacao===TASK_DONE)||String(b.alteradoEm||'').localeCompare(String(a.alteradoEm||'')))
    .map(t=>taskSummary(t,peopleById,usersByEmail));
  return {email,pendentes:rows.filter(t=>t.situacao!==TASK_DONE),concluidas:rows.filter(t=>t.situacao===TASK_DONE)};
}

async function taskDetail(q,user,client){
  required(q.id,'tarefa');
  const task=await get('Tarefas',q.id,client);
  if(task.tipo!==TASK_TYPE)throw httpError(400,'A tarefa informada não é uma distribuição processual.');
  const manage=has(user,'gestao_distribuicao'),owner=String(task.responsavel||'').toLowerCase()===currentEmail(user);
  if(!manage&&!owner)throw httpError(403,'Esta tarefa está atribuída a outro usuário.');
  const p=await get('Pessoas',task.pessoaId,client);authorizePersonScope(user,p);const allDocs=await all('Documentos',client);
  const docs=allDocs.filter(d=>d.atendimentoId===personOwnerKey(p.id)&&bool(d.vigente)).map(d=>({
    id:d.id,categoria:d.categoria,label:docLabel(d.categoria),nome:d.nome,mime:d.mime,url:documentUrl(d),conferido:bool(d.conferido)
  })).sort((a,b)=>a.label.localeCompare(b.label,'pt-BR',{sensitivity:'base'}));
  let process=null;if(task.processoId){process=(await all('Processos',client)).find(x=>x.id===task.processoId)||null;}
  const c=await config(client);
  return {
    tarefa:{id:task.id,versao:task.versao,situacao:task.situacao,responsavel:task.responsavel,jurisdicao:task.jurisdicao||p.jurisdicao||'',valorCausa:Number(task.valorCausa||causeValue(p.parcelasNaoRecebidas)),criadaEm:task.criadoEm,atribuidaEm:task.atribuidaEm,concluidaEm:task.concluidaEm},
    pessoa:{id:p.id,nome:p.nome,cpf:p.cpf,nascimento:p.nascimento,telefone:p.telefone,email:p.email||'',endereco:address(p),cidade:p.cidade,uf:p.uf,entidade:p.entidade==='Outro'&&p.outraEntidade?p.outraEntidade:p.entidade,parcelasNaoRecebidas:p.parcelasNaoRecebidas,jurisdicao:p.jurisdicao||'',valorCausa:causeValue(p.parcelasNaoRecebidas)},
    documentos:docs,advogados:Array.from(c.advogadosDistribuicao||[]),processo:process
  };
}

async function processList(client){
  const [processes,people]=await Promise.all([all('Processos',client),all('Pessoas',client)]);
  const map=new Map(people.map(p=>[p.id,p]));
  return processes.slice().sort((a,b)=>String(b.distribuidoEm||b.criadoEm||'').localeCompare(String(a.distribuidoEm||a.criadoEm||''))).map(pr=>{
    const p=map.get(pr.pessoaId)||{};
    return {
      ...pr,
      pessoa:p.nome||'Pessoa não localizada',
      cpf:p.cpf||'',
      cidade:p.cidade||'',
      jurisdicao:p.jurisdicao||pr.juizo||''
    };
  });
}

async function adminData(client){
  const [configs,users,modelo,portalConfigured,deepseekConfigured]=await Promise.all([
    all('Configuracoes',client),
    all('Usuarios',client),
    modelStatus(client),
    secretConfigured(SECRET_IDS.portal),
    secretConfigured(SECRET_IDS.deepseek)
  ]);
  const profile=profileDetails();
  return {
    configuracoes:configs,
    usuarios:users.map(u=>({...publicUser(u),permissoesEfetivas:permissions(u)})),
    ...profile,
    modelo,
    portalTransparencia:{
      configurada:portalConfigured,
      fonte:'Portal da Transparência do Governo Federal — Controladoria-Geral da União',
      endpoint:'https://api.portaldatransparencia.gov.br/api-de-dados/seguro-defeso-codigo'
    },
    deepseek:{configurada:deepseekConfigured,modelo:'deepseek-flash'},
    entidades:(await config(client)).entidades.filter(x=>String(x||'').trim()&&String(x).trim()!=='Outro')
  };
}

async function personSave(action,q,user){
  const permission=action==='pessoaSalvar'?'cadastro':'consulta';
  requirePermission(user,permission);
  return idempotentMutation(action,q,user,async(client,ctx)=>{
    const before=q.id?await get('Pessoas',q.id,client):null;
    if(before&&!canRetify(user,before))throw httpError(403,'Você não possui permissão para retificar este cadastro.');
    const c=await config(client);
    let p=await validatePerson(forcePersonEntity(user,q),client,c.rascunhos!=='PERMITIR');
    p.criadoPor=before?(before.criadoPor||before.usuario||''):user.email;
    p.origemCadastro=before?.origemCadastro||(isColonyUser(user)?'COLONIA':'INTERNA');
    const duplicate=await findOne('Pessoas','cpf=$1 AND id<>$2',[p.cpf,q.id||''],client);
    if(duplicate)throw httpError(409,'CPF já cadastrado. Abra a pessoa existente: '+duplicate.id);
    const saved=await change(client,ctx,'Pessoas',q.id||id('PES',q.op||cryptoRandom()),p,q.versao);
    const task=await findOne('Tarefas','tipo=$1 AND pessoa_id=$2',[TASK_TYPE,saved.id],client);
    if(task&&task.situacao!==TASK_DONE){
      await change(client,ctx,'Tarefas',task.id,{...task,pessoaId:saved.id,jurisdicao:saved.jurisdicao||'',valorCausa:String(causeValue(saved.parcelasNaoRecebidas)),concluidaEm:'',processoId:''},task.versao);
    }
    return {...saved,folderId:'cloud',folderUrl:''};
  });
}
function cryptoRandom(){return randomId('RND');}

async function validateFile(q){
  const mime=String(q.mime||'').trim();
  if(!['application/pdf','image/jpeg','image/png'].includes(mime))throw httpError(400,'Use PDF, JPEG ou PNG.');
  if(typeof q.base64!=='string'||!q.base64.length)throw httpError(400,'Arquivo vazio.');
  const bytes=Buffer.from(q.base64,'base64');
  if(!bytes.length||bytes.length>MAX_FILE_BYTES)throw httpError(400,'Arquivo vazio ou maior que 5 MB.');
  if(mime==='application/pdf'&&bytes.subarray(0,5).toString()!=='%PDF-')throw httpError(400,'Conteúdo não corresponde a um PDF.');
  if(mime==='image/jpeg'&&!(bytes[0]===255&&bytes[1]===216))throw httpError(400,'Conteúdo não corresponde a uma imagem JPEG.');
  const png=[137,80,78,71,13,10,26,10];
  if(mime==='image/png'&&!png.every((x,i)=>bytes[i]===x))throw httpError(400,'Conteúdo não corresponde a uma imagem PNG.');
  return {bytes,mime,hash:sha(bytes),ext:{'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'}[mime]};
}

async function uploadPersonDocument(q,user){
  requirePermission(user,'cadastro');
  return idempotentMutation('pessoaUpload',q,user,async(client,ctx)=>{
    const p=await get('Pessoas',q.pessoaId,client);
    if(!canWritePersonContent(user,p))throw httpError(403,'Você não possui permissão para anexar documentos a esta pessoa.');
    const c=await config(client);
    const allowed=new Set([...(c.categorias||[]),'IDENTIDADE_TITULAR_RESIDENCIA']);
    if(!allowed.has(q.categoria))throw httpError(400,'Categoria inválida.');
    const payload=await validateFile(q),owner=personOwnerKey(p.id);
    const prior=await findOne('Documentos','atendimento_id=$1 AND categoria=$2 AND hash=$3 AND vigente=true',[owner,q.categoria,payload.hash],client);
    if(prior)return {documento:{...prior,url:documentUrl(prior)},pessoa:p,mensagem:'Arquivo já anexado; preservado sem duplicação.'};
    if(q.categoria==='RESIDENCIA'){
      if(!/^\d{2}\/\d{2}\/\d{4}$/.test(String(q.vencimento||'')))throw httpError(400,'Informe a data do comprovante de residência.');
      if(bool(q.terceiro)&&!bool(q.declaracaoTerceiro))throw httpError(400,'Confirme a declaração de residência no documento em nome de terceiro.');
    }
    const did=id('DOC',q.op||cryptoRandom());
    const safe=String(p.nome||'pessoa').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._ -]+/g,'').trim().replace(/\s+/g,'_').slice(0,80);
    const objectName='pessoas/'+p.id+'/'+Date.now()+'_'+did+'_'+safe+'.'+payload.ext;
    await bucket.file(objectName).save(payload.bytes,{contentType:payload.mime,resumable:false,metadata:{metadata:{pessoaId:p.id,categoria:q.categoria}}});
    const doc=await change(client,ctx,'Documentos',did,{
      atendimentoId:owner,categoria:q.categoria,fileId:'gcs:'+objectName,url:'/api/v1/files/'+did,
      nome:(docLabel(q.categoria)+' - '+p.nome+'.'+payload.ext).slice(0,240),hash:payload.hash,mime:payload.mime,
      substituiId:'',vigente:true,vencimento:q.vencimento||'',terceiro:bool(q.terceiro),conferido:false,
      declaracaoTerceiro:bool(q.declaracaoTerceiro),processoCompleto:false,anexoPresente:false,rogo:false,testemunhas:false,observacoes:''
    });
    return {documento:{...doc,url:documentUrl(doc)},pessoa:p,folderId:'cloud',folderUrl:'',mensagem:'Documento salvo com segurança no Google Cloud.'};
  });
}

async function deletePersonDocument(q,user){
  return idempotentMutation('pessoaDocumentoExcluir',q,user,async(client,ctx)=>{
    required(q.id,'documento');required(q.pessoaId,'pessoa');
    const p=await get('Pessoas',q.pessoaId,client);
    if(!canRetify(user,p))throw httpError(403,'Você não possui permissão para excluir documentos desta pessoa.');
    const doc=await get('Documentos',q.id,client);
    if(Number(doc.versao)!==Number(q.versao))throw httpError(409,'Documento alterado. Recarregue.');
    const attendances=await whereAll('Atendimentos','pessoa_id=$1',[p.id],client);
    const owners=new Set([personOwnerKey(p.id),...attendances.map(a=>a.id)]);
    if(!owners.has(doc.atendimentoId))throw httpError(400,'Documento não pertence a esta pessoa.');
    if(String(doc.fileId||'').startsWith('gcs:')){
      await bucket.file(String(doc.fileId).slice(4)).delete({ignoreNotFound:true});
    }
    const updated=await change(client,ctx,'Documentos',doc.id,{...doc,vigente:false,observacoes:[String(doc.observacoes||'').trim(),'[EXCLUÍDO '+now()+' por '+user.email+']'].filter(Boolean).join('\n')},doc.versao);
    return {documento:updated,pessoa:p,mensagem:'Documento excluído do cadastro.'};
  });
}

async function replacePersonDocument(q,user){
  requirePermission(user,'cadastro');
  return idempotentMutation('pessoaDocumentoSubstituir',q,user,async(client,ctx)=>{
    required(q.id,'documento');required(q.pessoaId,'pessoa');
    const p=await get('Pessoas',q.pessoaId,client);
    if(!canWritePersonContent(user,p))throw httpError(403,'Você não possui permissão para substituir documentos desta pessoa.');

    const prior=await get('Documentos',q.id,client);
    if(Number(prior.versao)!==Number(q.versao))throw httpError(409,'Documento alterado. Recarregue antes de substituir.');
    if(!bool(prior.vigente))throw httpError(400,'Somente o documento vigente pode ser substituído.');

    const attendances=await whereAll('Atendimentos','pessoa_id=$1',[p.id],client);
    const owners=new Set([personOwnerKey(p.id),...attendances.map(a=>a.id)]);
    if(!owners.has(prior.atendimentoId))throw httpError(400,'Documento não pertence ao cadastro informado.');

    const payload=await validateFile(q);
    if(String(prior.hash||'')===payload.hash){
      return {documento:{...prior,url:documentUrl(prior)},pessoa:p,mensagem:'O arquivo selecionado é idêntico ao documento vigente.'};
    }

    const did=id('DOC',q.op||cryptoRandom());
    const safe=String(p.nome||'pessoa').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._ -]+/g,'').trim().replace(/\s+/g,'_').slice(0,80);
    const objectName='pessoas/'+p.id+'/'+Date.now()+'_'+did+'_'+safe+'.'+payload.ext;
    await bucket.file(objectName).save(payload.bytes,{
      contentType:payload.mime,
      resumable:false,
      metadata:{metadata:{pessoaId:p.id,categoria:prior.categoria,substituiId:prior.id}}
    });

    const next=await change(client,ctx,'Documentos',did,{
      atendimentoId:prior.atendimentoId||personOwnerKey(p.id),
      categoria:prior.categoria,
      fileId:'gcs:'+objectName,
      url:'/api/v1/files/'+did,
      nome:(docLabel(prior.categoria)+' - '+p.nome+'.'+payload.ext).slice(0,240),
      hash:payload.hash,
      mime:payload.mime,
      substituiId:prior.id,
      vigente:true,
      vencimento:prior.vencimento||'',
      terceiro:bool(prior.terceiro),
      conferido:false,
      declaracaoTerceiro:bool(prior.declaracaoTerceiro),
      processoCompleto:false,
      anexoPresente:false,
      rogo:false,
      testemunhas:false,
      observacoes:[
        'Substitui '+String(prior.nome||prior.id)+'.',
        String(q.observacoes||'').trim()
      ].filter(Boolean).join(' ')
    });

    await change(
      client,
      ctx,
      'Documentos',
      prior.id,
      {
        ...prior,
        vigente:false,
        observacoes:[
          String(prior.observacoes||'').trim(),
          '[SUBSTITUÍDO '+now()+' por '+user.email+' → '+next.id+']'
        ].filter(Boolean).join('\n')
      },
      prior.versao
    );

    return {
      documento:{...next,url:documentUrl(next)},
      substituido:{id:prior.id,nome:prior.nome},
      pessoa:p,
      mensagem:'Documento substituído. A versão anterior foi preservada no histórico.'
    };
  });
}

async function requiredDocumentErrors(p,client){
  const c=await config(client),docs=(await all('Documentos',client)).filter(d=>d.atendimentoId===personOwnerKey(p.id)&&bool(d.vigente));
  const errors=[];
  for(const cat of c.categorias||[]){
    const rows=docs.filter(d=>d.categoria===cat);
    if(!rows.length)errors.push('Anexe '+docLabel(cat)+'.');
    if(cat==='RESIDENCIA'&&rows.length){
      if(!rows.some(d=>/^\d{2}\/\d{2}\/\d{4}$/.test(String(d.vencimento||''))))errors.push('Informe uma data válida para o comprovante de residência.');
      if(rows.some(d=>bool(d.terceiro))){
        if(!rows.some(d=>bool(d.declaracaoTerceiro)))errors.push('Confirme a declaração de residência no comprovante em nome de terceiro.');
        if(!docs.some(d=>d.categoria==='IDENTIDADE_TITULAR_RESIDENCIA'))errors.push('Anexe a carteira de identidade do titular da residência.');
      }
    }
  }
  return [...new Set(errors)];
}

async function personRegistrationState(q,user){
  requirePermission(user,'consulta');
  const person=authorizePersonScope(user,await get('Pessoas',required(q.id||q.pessoaId,'pessoa')));
  const errors=await requiredDocumentErrors(person);
  if(errors.length){
    return {pessoaId:person.id,etapa:'DOCUMENTOS_PENDENTES',ultimoErro:errors.join(' ')};
  }
  const owner=personOwnerKey(person.id);
  const hasInitial=(await all('Documentos')).some(d=>d.atendimentoId===owner&&d.categoria==='INICIAL_SEGURO_DEFESO_2025'&&bool(d.vigente));
  if(!hasInitial){
    return {pessoaId:person.id,etapa:'GERANDO_MINUTA',ultimoErro:''};
  }
  return {pessoaId:person.id,etapa:'CONCLUIDO',ultimoErro:''};
}

async function ensureDistributionTask(client,ctx,p){
  const existing=await findOne('Tarefas','tipo=$1 AND pessoa_id=$2',[TASK_TYPE,p.id],client);
  if(existing)return existing;
  const process=await findOne('Processos',"pessoa_id=$1 AND coalesce(numero,'')<>''",[p.id],client);
  if(process)return null;
  return change(client,ctx,'Tarefas',id('TAR','DISTRIBUICAO:'+p.id),{
    tipo:TASK_TYPE,pessoaId:p.id,responsavel:'',situacao:TASK_PENDING,jurisdicao:p.jurisdicao||jurisdiction(p.cidade),
    valorCausa:String(causeValue(p.parcelasNaoRecebidas)),atribuidaEm:'',concluidaEm:'',processoId:'',
    observacoes:'Tarefa criada automaticamente após a conclusão do cadastro.',
    titulo:'Distribuir processo',descricao:'',criadoPor:p.criadoPor||'',
    prazo:'',prioridade:'ALTA',
    tags:p.origemCadastro==='COLONIA'?['PROCESSO','CRIADO PELA COLÔNIA']:['PROCESSO'],
    modoDistribuicao:'MANUAL',origem:p.origemCadastro==='COLONIA'?'COLONIA':'CADASTRO'
  });
}

async function generateAutomaticModels_(client,ctx,p){
  const models=(await listDocumentModels(client))
    .filter(model=>
      !model.sistema&&
      model.ativo!==false&&
      model.automatico===true&&
      modelAppliesToPerson_(model,p,{demanda:'Seguro-Defeso 2025'})
    );

  if(!models.length)return {gerados:[],ignorados:[]};

  const owner=personOwnerKey(p.id);
  const existing=(await all('Minutas',client)).filter(m=>String(m.atendimentoId||'')===owner);
  const generated=[];
  const ignored=[];

  for(const model of models){
    const already=existing.some(m=>
      String(m.templateId||'')===String(model.fileId||'')
    );
    if(already){
      ignored.push({id:model.id,nome:model.nome,motivo:'já gerado nesta versão'});
      continue;
    }
    generated.push(await generateFromDocumentModel(client,ctx,p,model.id));
  }

  return {gerados:generated,ignorados:ignored};
}

async function finalizePerson(action,q,user){
  return idempotentMutation(action,q,user,async(client,ctx)=>{
    required(q.pessoaId,'pessoa');
    const p=await get('Pessoas',q.pessoaId,client);
    if(!canWritePersonContent(user,p))throw httpError(403,'Você não possui permissão para concluir este cadastro.');
    const errors=await requiredDocumentErrors(p,client);
    if(errors.length)throw httpError(400,'O cadastro não pode ser finalizado sem todos os documentos obrigatórios:\n'+errors.join('\n'));
    const minuta=await generateInitial(client,ctx,p);
    const automaticos=await generateAutomaticModels_(client,ctx,p);
    const task=await ensureDistributionTask(client,ctx,p);
    const extra=automaticos.gerados.length;
    return {
      pessoaId:p.id,
      folderId:'cloud',
      folderUrl:'',
      minutaBase:minuta,
      modelosAutomaticos:automaticos,
      tarefaDistribuicao:task?.id||'',
      mensagem:'Cadastro concluído. Petição inicial gerada'+
        (extra?' e '+extra+' modelo(s) automático(s) adicional(is) gerado(s)':'')+
        '. Tarefa de distribuição criada automaticamente.'
    };
  });
}

async function generateInitialOnly(action,q,user){
  if(action==='minutaInicialGerar')requirePermission(user,'minuta');
  return idempotentMutation(action,q,user,async(client,ctx)=>{
    required(q.pessoaId,'pessoa');
    const p=await get('Pessoas',q.pessoaId,client);
    if(!canWritePersonContent(user,p)&&!has(user,'minuta'))throw httpError(403,'Você não possui permissão para gerar a petição desta pessoa.');
    const errors=await requiredDocumentErrors(p,client);
    if(errors.length)throw httpError(400,'A petição inicial não pode ser gerada enquanto houver documentos obrigatórios pendentes:\n'+errors.join('\n'));
    const generated=await generateInitial(client,ctx,p);
    const task=await ensureDistributionTask(client,ctx,p);
    return {
      pessoaId:p.id,
      folderId:'cloud',
      folderUrl:'',
      minutaBase:generated,
      tarefaDistribuicao:task?.id||'',
      mensagem:generated.mensagem
    };
  });
}

function modelAppliesToPerson_(model,p,context={}){
  if(model.sistema)return true;
  const normalize=value=>String(value||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const jurisdictions=(model.jurisdicoes||[]).map(normalize).filter(Boolean);
  const entities=(model.entidades||[]).map(normalize).filter(Boolean);
  const origins=(model.origensCadastro||[]).map(normalize).filter(Boolean);
  const parcels=(model.parcelas||[]).map(value=>String(value||'').trim()).filter(Boolean);
  const demands=(model.demandas||[]).map(normalize).filter(Boolean);
  const jurisdiction=normalize(p.jurisdicao);
  const entity=normalize(p.entidade==='Outro'?(p.outraEntidade||'Outro'):(p.entidade||''));
  const origin=normalize(p.origemCadastro||'INTERNA');
  const parcel=String(p.parcelasNaoRecebidas||'').trim();
  const demand=normalize(context.demanda||'Seguro-Defeso 2025');
  return (!jurisdictions.length||jurisdictions.includes(jurisdiction))&&
    (!entities.length||entities.includes(entity))&&
    (!origins.length||origins.includes(origin))&&
    (!parcels.length||parcels.includes(parcel))&&
    (!demands.length||demands.includes(demand));
}

async function documentModelsList(q,user){
  requirePermission(user,'consulta');
  const models=await listDocumentModels();
  let person=null;
  if(q?.pessoaId){
    person=await get('Pessoas',q.pessoaId);
    authorizePersonScope(user,person);
  }
  return {
    modelos:models.map(model=>({
      ...model,
      aplicavel:person?modelAppliesToPerson_(model,person,{demanda:q?.demanda||'Seguro-Defeso 2025'}):true
    })),
    pessoa:person?{
      id:person.id,
      nome:person.nome,
      cpf:person.cpf,
      jurisdicao:person.jurisdicao,
      entidade:person.entidade==='Outro'?(person.outraEntidade||'Outro'):(person.entidade||'')
    }:null,
    podeGerenciar:has(user,'minuta')||has(user,'administracao')
  };
}

async function documentModelSave(q,user){
  if(!has(user,'minuta')&&!has(user,'administracao'))throw httpError(403,'Você não possui permissão para gerenciar modelos.');
  return idempotentMutation('modeloDocumentoSalvar',q,user,(client,ctx)=>saveDocumentModel(q,user,client,ctx));
}

async function documentModelToggle(q,user){
  if(!has(user,'minuta')&&!has(user,'administracao'))throw httpError(403,'Você não possui permissão para gerenciar modelos.');
  required(q.id,'modelo');
  return idempotentMutation('modeloDocumentoAtivar',q,user,(client,ctx)=>setDocumentModelActive(q,user,client,ctx));
}

async function documentModelDelete(q,user){
  if(!has(user,'minuta')&&!has(user,'administracao'))throw httpError(403,'Você não possui permissão para excluir modelos.');
  required(q.id,'modelo');
  return idempotentMutation('modeloDocumentoExcluir',q,user,(client,ctx)=>deleteDocumentModel(q,user,client,ctx));
}

async function documentModelGenerate(q,user){
  requirePermission(user,'consulta');
  required(q.pessoaId,'pessoa');
  required(q.modeloId,'modelo');
  return idempotentMutation('modeloDocumentoGerar',q,user,async(client,ctx)=>{
    const person=await get('Pessoas',q.pessoaId,client);
    authorizePersonScope(user,person);
    if(!canWritePersonContent(user,person)&&!has(user,'minuta')){
      throw httpError(403,'Você não possui permissão para gerar documentos neste cadastro.');
    }
    const models=await listDocumentModels(client);
    const model=models.find(item=>item.id===String(q.modeloId||''));
    if(!model)throw httpError(404,'Modelo não localizado.');
    if(!modelAppliesToPerson_(model,person,{demanda:q?.demanda||'Seguro-Defeso 2025'}))throw httpError(403,'Este modelo não se aplica a este cadastro.');
    const generated=await generateFromDocumentModel(client,ctx,person,model.id);
    let distributionTask='';
    if(model.sistema){
      const task=await ensureDistributionTask(client,ctx,person);
      distributionTask=task?.id||'';
    }
    return {
      ...generated,
      pessoaId:person.id,
      tarefaDistribuicao:distributionTask
    };
  });
}

async function checkDocument(q,user){
  requirePermission(user,'conferencia');
  return idempotentMutation('documentoConferir',q,user,async(client,ctx)=>{
    const d=await get('Documentos',q.id,client);
    if(!bool(d.vigente))throw httpError(400,'Versão anterior não pode receber conferência.');
    const data={...d};
    for(const k of ['conferido','declaracaoTerceiro','processoCompleto','anexoPresente','rogo','testemunhas'])data[k]=bool(q[k]);
    if(d.categoria==='RESIDENCIA'){data.vencimento=String(q.vencimento||'');data.terceiro=bool(q.terceiro);}
    data.observacoes=String(q.observacoes||'');
    return change(client,ctx,'Documentos',d.id,data,q.versao);
  });
}

async function assignTask(q,user){
  requirePermission(user,'gestao_distribuicao');
  return idempotentMutation('tarefaDistribuicaoAtribuir',q,user,async(client,ctx)=>{
    required(q.id,'tarefa');required(q.responsavel,'responsável');
    const task=await get('Tarefas',q.id,client);
    if(task.tipo!==TASK_TYPE)throw httpError(400,'Tarefa de distribuição inválida.');
    if(task.situacao===TASK_DONE)throw httpError(400,'Tarefa já concluída.');
    const responsible=await findOne('Usuarios','lower(email)=lower($1) AND ativo=true',[q.responsavel],client);
    if(!responsible||!has(responsible,'distribuicao'))throw httpError(400,'Responsável sem permissão para distribuição.');
    return change(client,ctx,'Tarefas',task.id,{...task,responsavel:responsible.email,situacao:TASK_ASSIGNED,atribuidaEm:now(),concluidaEm:'',processoId:''},q.versao);
  });
}

function validProcessNumber(value){
  const s=String(value||'').trim();
  if(!/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(s))throw httpError(400,'Informe o número CNJ no formato 0000000-00.0000.0.00.0000.');
  return s;
}

async function completeTask(q,user){
  requirePermission(user,'distribuicao');
  return idempotentMutation('tarefaDistribuicaoConcluir',q,user,async(client,ctx)=>{
    const task=await get('Tarefas',q.id,client);
    const owner=String(task.responsavel||'').toLowerCase()===currentEmail(user),manage=has(user,'gestao_distribuicao');
    if(!owner&&!manage)throw httpError(403,'Esta tarefa está atribuída a outro usuário.');
    if(task.situacao===TASK_DONE)throw httpError(400,'Tarefa já concluída.');
    const numero=validProcessNumber(q.numeroProcesso||q.numero);
    const duplicate=await findOne('Processos','numero=$1',[numero],client);
    if(duplicate&&duplicate.pessoaId!==task.pessoaId)throw httpError(409,'Este número de processo já está vinculado a outra pessoa.');
    const processId=duplicate?.id||id('PROC',numero);
    const process=await change(client,ctx,'Processos',processId,{
      pessoaId:task.pessoaId,atendimentoId:'',numero,juizo:String(q.juizo||task.jurisdicao||''),distribuidoEm:now(),
      responsavel:user.email,movimentacoes:duplicate?.movimentacoes||[]
    },duplicate?.versao);
    const updated=await change(client,ctx,'Tarefas',task.id,{...task,situacao:TASK_DONE,concluidaEm:now(),processoId:process.id,observacoes:['Distribuição concluída. Processo TRF4: '+numero,String(q.observacoes||'').trim()].filter(Boolean).join('\n')},q.versao);
    return {tarefa:updated,processo:process,mensagem:'Distribuição concluída e processo registrado.'};
  });
}

async function reconcileTasks(q,user){
  requirePermission(user,'gestao_distribuicao');
  return idempotentMutation('tarefasDistribuicaoReconciliar',q,user,async(client,ctx)=>{
    const people=await all('Pessoas',client),processes=await all('Processos',client);
    let created=0;
    for(const p of people){
      if(processes.some(pr=>pr.pessoaId===p.id&&String(pr.numero||'').trim()))continue;
      const existing=await findOne('Tarefas','tipo=$1 AND pessoa_id=$2',[TASK_TYPE,p.id],client);
      if(!existing){await ensureDistributionTask(client,ctx,p);created++;}
    }
    return {ok:true,criadas:created,mensagem:created+' tarefa(s) criada(s) para cadastros sem processo.'};
  });
}

async function saveConfig(q,user){
  requirePermission(user,'administracao');
  return idempotentMutation('configSalvar',q,user,async(client,ctx)=>{
    const allowed=['rascunhos','vencimentoFuturo','anexoOrientacao','templateId','templateAprovado','distribuicaoAutomatica','entidades','municipios','demandas','categorias','situacoes'];
    if(!allowed.includes(q.chave))throw httpError(400,'Configuração não editável.');
    if(q.chave==='rascunhos'&&!['PENDENTE','PERMITIR','PROIBIR'].includes(q.valor))throw httpError(400,'Política inválida.');
    if(q.chave==='vencimentoFuturo'&&!['PENDENTE','ACEITAR','RECUSAR'].includes(q.valor))throw httpError(400,'Política inválida.');
    if(['entidades','municipios','demandas','categorias','situacoes'].includes(q.chave)&&(!Array.isArray(q.valor)||!q.valor.length))throw httpError(400,'Informe uma lista não vazia.');
    let old=await findOne('Configuracoes','chave=$1',[q.chave],client);
    if(!old){
      old={id:id('CFG',q.chave),versao:undefined};
    }
    return change(client,ctx,'Configuracoes',old.id,{chave:q.chave,valor:JSON.stringify(q.valor)},q.versao??old.versao);
  });
}

async function saveUser(q,user){
  requirePermission(user,'administracao');
  return idempotentMutation('usuarioSalvar',q,user,async(client,ctx)=>{
    const nome=String(q.nome||'').trim();
    const funcao=String(q.funcao||'').trim();
    const email=String(q.email||'').trim().toLowerCase();
    const perfil=String(q.perfil||'').trim().toUpperCase();
    const nomeUsuario=normalizeUsername(q.nomeUsuario);
    required(nome,'nome da pessoa');required(funcao,'função da pessoa');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!ROLES[perfil])throw httpError(400,'E-mail ou perfil inválido.');
    let perms=Array.isArray(q.permissoes)?q.permissoes:[...(ROLES[perfil]||[])];
    perms=[...new Set(perms.filter(p=>Object.prototype.hasOwnProperty.call(PERMISSIONS,p)))];
    if(!perms.includes('consulta'))perms.unshift('consulta');
    const old=q.id?await get('Usuarios',q.id,client):await findOne('Usuarios','lower(email)=lower($1)',[email],client);
    if(q.id&&old.email!==email)throw httpError(400,'O próprio usuário pode alterar seu e-mail em Meu perfil.');
    const duplicate=await findOne('Usuarios','lower(nome_usuario)=lower($1) AND id<>$2',[nomeUsuario,old?.id||''],client);
    if(duplicate)throw httpError(409,'Este nome de usuário já está em uso.');
    if(old&&old.email===user.email&&(!bool(q.ativo)||perfil!=='ADMIN'||!perms.includes('administracao')))throw httpError(400,'Não remova seu próprio acesso administrativo.');
    let entidade='';
    if(perfil==='COLONIA_PESCADOR'){
      entidade=String(q.entidade||'').trim();
      const allowed=(await config(client)).entidades.filter(x=>String(x||'').trim()&&String(x).trim()!=='Outro');
      if(!allowed.includes(entidade))throw httpError(400,'Selecione a entidade vinculada à Colônia.');
    }
    const saved=await change(client,ctx,'Usuarios',old?.id||id('USR',email),{
      ...(old||{}),email,perfil,ativo:bool(q.ativo),nome,funcao,permissoes:perms,
      permissoesVersao:2,sessionVersion:old?.sessionVersion||0,
      nomeUsuario,emailsAnteriores:old?.emailsAnteriores||[],entidade
    },q.versao);
    return publicUser(saved);
  });
}
async function approveProfessor(q,user){
  requirePermission(user,'administracao');
  return idempotentMutation('usuarioAprovarProfessorResidente',q,user,async(client,ctx)=>{
    const target=await get('Usuarios',q.id,client),fn=String(target.funcao||'').trim().toLowerCase();
    if(!['professor','residente'].includes(fn))throw httpError(400,'A aprovação está disponível somente para Professor ou Residente.');
    const perms=[...new Set([...permissions(target),...(ROLES.PROFESSOR_RESIDENTE||[])])];
    return publicUser(await change(client,ctx,'Usuarios',target.id,{...target,perfil:'PROFESSOR_RESIDENTE',permissoes:perms,permissoesVersao:2},q.versao));
  });
}

async function deleteUser(q,user){
  requirePermission(user,'administracao');
  return idempotentMutation('usuarioExcluir',q,user,async(client,ctx)=>{
    const target=await get('Usuarios',q.id,client);
    if(String(target.email).toLowerCase()===currentEmail(user))throw httpError(400,'Você não pode excluir o próprio usuário enquanto estiver conectado.');

    const users=await all('Usuarios',client);
    const targetIsAdmin=bool(target.ativo)&&permissions(target).includes('administracao');
    const activeAdmins=users.filter(u=>bool(u.ativo)&&permissions(u).includes('administracao'));
    if(targetIsAdmin&&activeAdmins.length<=1){
      throw httpError(400,'Não é possível excluir o último Administrador Geral ativo do sistema.');
    }

    const tasks=(await all('Tarefas',client)).filter(t=>
      String(t.responsavel||'').toLowerCase()===String(target.email||'').toLowerCase()&&
      t.situacao!==TASK_DONE
    );
    for(const task of tasks){
      await change(client,ctx,'Tarefas',task.id,{
        ...task,
        responsavel:'',
        situacao:TASK_PENDING,
        atribuidaEm:'',
        concluidaEm:'',
        processoId:task.tipo===TASK_TYPE?'':task.processoId,
        observacoes:[
          String(task.observacoes||'').trim(),
          'Tarefa devolvida à fila porque o usuário responsável foi excluído.'
        ].filter(Boolean).join('\n')
      },task.versao);
    }

    const sessions=await client.query('DELETE FROM sessoes WHERE usuario_id=$1 RETURNING id',[target.id]);
    const recoveries=await client.query('DELETE FROM recuperacoes WHERE usuario_id=$1 RETURNING id',[target.id]);

    await remove(client,ctx,'Usuarios',target.id,q.versao);
    return {
      id:target.id,
      email:target.email,
      nome:target.nome||target.email,
      tarefasLiberadas:tasks.length,
      sessoesRevogadas:sessions.rowCount||0,
      recuperacoesRevogadas:recoveries.rowCount||0,
      mensagem:'Usuário excluído. Sessões revogadas e histórico preservado.'
    };
  });
}

async function seguroDefeso(q){
  required(q.codigo,'CPF/NIS');
  const codigo=String(q.codigo).replace(/\D/g,'');
  if(!/^\d{11}$/.test(codigo))throw httpError(400,'Informe um CPF/NIS com 11 dígitos.');
  const key=await getSecret(SECRET_IDS.portal,{required:true,label:'API do Portal da Transparência'});
  const endpoint='https://api.portaldatransparencia.gov.br/api-de-dados/seguro-defeso-codigo';
  const received=[];
  for(let page=1;page<=100;page++){
    const r=await fetch(endpoint+'?codigo='+encodeURIComponent(codigo)+'&pagina='+page,{headers:{accept:'application/json','chave-api-dados':key}});
    if(r.status===401)throw httpError(502,'A API do Portal da Transparência recusou a autenticação.');
    if(!r.ok)throw httpError(502,'Falha no Portal da Transparência. HTTP '+r.status+'.');
    const rows=await r.json();if(!Array.isArray(rows)||!rows.length)break;received.push(...rows);
    if(rows.length<15)break;
  }
  const flat=row=>{const p=row?.pessoaSeguroDefeso||{},m=row?.municipio||{},uf=m.uf||{};return {
    id:String(row?.id??''),cpfFormatado:String(p.cpfFormatado||''),nis:String(p.nis||''),nome:String(p.nome||''),
    codigoIBGE:String(m.codigoIBGE||''),nomeIBGE:String(m.nomeIBGE||''),codigoRegiao:String(m.codigoRegiao||''),nomeRegiao:String(m.nomeRegiao||''),pais:String(m.pais||''),ufSigla:String(uf.sigla||''),ufNome:String(uf.nome||''),portaria:String(row?.portaria||''),dataMesReferencia:String(row?.dataMesReferencia||''),dataSaque:String(row?.dataSaque||''),dataEmissaoParcela:String(row?.dataEmissaoParcela||''),situacao:String(row?.situacao||''),rgp:String(row?.rgp||''),parcela:String(row?.parcela||''),valor:Number(row?.valor||0)
  };};
  const period=received.filter(r=>{const ref=String(r?.dataMesReferencia||'').slice(0,10);return ref>='2025-01-01'&&ref<='2025-12-31';}).map(flat).sort((a,b)=>String(a.dataMesReferencia).localeCompare(String(b.dataMesReferencia))||String(a.parcela).localeCompare(String(b.parcela),'pt-BR',{numeric:true}));
  return {fonte:'Portal da Transparência do Governo Federal — Controladoria-Geral da União',endpoint,codigoConsultado:codigo,consultadoEm:now(),periodoInicio:'2025-01-01',periodoFim:'2025-12-31',paginasConsultadas:Math.ceil(received.length/15),registrosRecebidos:received.length,registrosForaPeriodo:received.length-period.length,quantidade:period.length,valorTotal:period.reduce((s,r)=>s+r.valor,0),registros:period};
}

async function generateSeguroReportAction(q,user){
  requirePermission(user,'cadastro');
  return idempotentMutation('seguroDefesoRelatorioGerar',q,user,async(client,ctx)=>{
    required(q.pessoaId,'pessoa');
    const p=await get('Pessoas',q.pessoaId,client);
    if(!canWritePersonContent(user,p))throw httpError(403,'Você não possui permissão para gerar documentos desta pessoa.');
    const consulta=await seguroDefeso({codigo:p.cpf});
    return generateSeguroReport(client,ctx,p,consulta);
  });
}

async function taskZip(q,user){
  requirePermission(user,'distribuicao');
  required(q.id,'tarefa');
  const task=await get('Tarefas',q.id);
  if(task.tipo!==TASK_TYPE)throw httpError(400,'A tarefa informada não é uma distribuição processual.');
  const owner=String(task.responsavel||'').toLowerCase()===currentEmail(user);
  if(!owner&&!has(user,'gestao_distribuicao'))throw httpError(403,'Esta tarefa está atribuída a outro usuário.');
  return generateDocumentsZip(task,user);
}

async function saveModelAction(q,user){
  requirePermission(user,'administracao');
  return idempotentMutation('modeloUpload',q,user,(client,ctx)=>uploadModel(q,user,client,ctx));
}

async function savePortalKey(q,user){
  requirePermission(user,'administracao');
  await saveSecret(SECRET_IDS.portal,q.chave,{minLength:8,label:'chave da API do Portal da Transparência'});
  return {
    configurada:true,
    fonte:'Portal da Transparência do Governo Federal — Controladoria-Geral da União',
    endpoint:'https://api.portaldatransparencia.gov.br/api-de-dados/seguro-defeso-codigo',
    mensagem:'Chave da API do Portal da Transparência salva com segurança no Secret Manager.'
  };
}

async function saveDeepseekKey(q,user){
  requirePermission(user,'administracao');
  await saveSecret(SECRET_IDS.deepseek,q.chave,{minLength:16,label:'chave da API DeepSeek'});
  return {configurada:true,modelo:'deepseek-flash',mensagem:'Chave da API DeepSeek salva com segurança no Secret Manager.'};
}

export async function executeAction(action,q,user){
  q=q||{};
  const reads={
    bootstrap:async()=>{
      const [c,modelo,portalConfigured,deepseekConfigured,painel]=await Promise.all([config(),modelStatus(),secretConfigured(SECRET_IDS.portal),secretConfigured(SECRET_IDS.deepseek),dashboard(user)]);
      return {email:user.email,usuario:publicUser(user),perfil:user.perfil,permissoes:permissions(user),config:c,modulos:modules(user),home:'PAINEL',initialModule:null,initialData:{action:'painel',query:{},result:painel},modelo,portalTransparencia:{configurada:portalConfigured},deepseek:{configurada:deepseekConfigured,modelo:'deepseek-flash'}};
    },
    pessoas:async()=>{requirePermission(user,'consulta');const term=String(q.busca||'').trim().toLowerCase();const rows=(await all('Pessoas')).filter(p=>personInUserScope(user,p));return rows.filter(p=>!term||String(p.nome||'').toLowerCase().includes(term)||String(p.cpf||'').includes(term.replace(/[.\- ]/g,''))||String(p.cidade||'').toLowerCase().includes(term)).sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR',{sensitivity:'base'}));},
    pessoasLeve:async()=>{requirePermission(user,'consulta');return personListLite(q,user);},
    pessoa:async()=>{requirePermission(user,'consulta');const p=await get('Pessoas',q.id);return authorizePersonScope(user,p);},
    pessoaResumo:async()=>{requirePermission(user,'consulta');return personQuickSummary(q,user);},
    pessoaFichaMeta:async()=>{requirePermission(user,'consulta');return personQuickSummary(q,user);},
    pessoaFichaCargaInicial:async()=>{requirePermission(user,'consulta');return personDrawerInitial(q,user);},
    pessoaCadastroEstado:async()=>personRegistrationState(q,user),
    pessoaDocumentos:async()=>{requirePermission(user,'consulta');return personDocumentsPage(q,user);},
    documentoConteudo:async()=>{requirePermission(user,'consulta');return personDocumentContent(q,user);},
    pessoaProcessos:async()=>{requirePermission(user,'consulta');return personProcessesPage(q,user);},
    pessoaAtendimentos:async()=>{requirePermission(user,'consulta');return personAttendancesPage(q,user);},
    pessoaHistorico:async()=>{requirePermission(user,'consulta');return personHistoryPage(q,user);},
    historicoGeral:async()=>{requirePermission(user,'consulta');return globalHistory(q,user);},
    ficha:async()=>{requirePermission(user,'consulta');return dossier(q,user);},
    painel:async()=>{requirePermission(user,'consulta');return dashboard(user);},
    distribuicaoFila:async()=>{requirePermission(user,'gestao_distribuicao');return distributionQueue(user);},
    tarefasMinhas:async()=>{requirePermission(user,'consulta');return myTasks(user);},
    tarefasAbertasGestao:async()=>tasksManagementOpen(q,user),
    tarefasHistorico:async()=>tasksHistory(q,user),
    tarefasMinhasAbertas:async()=>{requirePermission(user,'consulta');return myTasksOpen(q,user);},
    tarefasMinhasHistorico:async()=>{requirePermission(user,'consulta');return myTasksHistory(q,user);},
    tarefasPessoa:async()=>{requirePermission(user,'consulta');return personTasks(q,user);},
    tarefasTags:async()=>{requirePermission(user,'consulta');return taskTagsData();},
    tarefaCriarOpcoes:async()=>taskCreateOptions(user),
    tarefaDistribuicaoDetalhe:async()=>{requirePermission(user,'distribuicao');return taskDetail(q,user);},
    tarefaGeralDetalhe:async()=>{requirePermission(user,'consulta');return generalTaskDetail(q,user);},
    tarefaGeralMovimentos:async()=>{requirePermission(user,'consulta');return generalTaskMovements(q,user);},
    tarefaGeralAnexoConteudo:async()=>{requirePermission(user,'consulta');return generalTaskAttachmentContent(q,user);},
    notificacoesTarefas:async()=>{requirePermission(user,'consulta');return notifications(user);},
    distribuicaoRanking:async()=>{requirePermission(user,'gestao_distribuicao');return rankingData(q,user);},
    perfilRanking:async()=>{requirePermission(user,'consulta');return profileRanking(q,user);},
    pessoaExcluirPreview:async()=>personDeletePreview(q,user),
    processos:async()=>{requirePermission(user,'consulta');return listProcesses(q,user);},
    processoFiltros:async()=>{requirePermission(user,'consulta');return filterOptions(user);},
    processoDetalhe:async()=>{requirePermission(user,'consulta');return processDetail(q,user);},
    admin:async()=>{requirePermission(user,'administracao');return adminData();},
    adminUsuarios:async()=>{requirePermission(user,'administracao');const c=await config();return {usuarios:(await all('Usuarios')).map(u=>({...publicUser(u),permissoesEfetivas:permissions(u)})),perfis:Object.keys(ROLES),perfisDetalhes:Object.fromEntries(Object.keys(ROLES).map(p=>[p,{descricao:ROLE_DESCRIPTIONS[p]||'',permissoes:[...(ROLES[p]||[])]}])),permissoes:Object.entries(PERMISSIONS).map(([key,value])=>({key,label:value.label,descricao:value.descricao})),entidades:(c.entidades||[]).filter(x=>String(x||'').trim()&&String(x).trim()!=='Outro')};},
    adminTags:async()=>{requirePermission(user,'administracao');return {tagsTarefas:await taskTagAdminList()};},
    adminIntegracoes:async()=>{requirePermission(user,'administracao');return {modelo:await modelStatus(),portalTransparencia:{configurada:await secretConfigured(SECRET_IDS.portal)},deepseek:{configurada:await secretConfigured(SECRET_IDS.deepseek),modelo:'deepseek-flash'}};},
    adminConfiguracoes:async()=>{requirePermission(user,'administracao');return {configuracoes:await all('Configuracoes'),config:await config()};},
    adminImagens:async()=>{requirePermission(user,'administracao');return listVisuals();},
    imagensSistema:async()=>{requirePermission(user,'consulta');return listVisuals();},
    imagemSistemaConteudo:async()=>{requirePermission(user,'consulta');return visualContent(q);},
    imagemSistemaAleatoria:async()=>{requirePermission(user,'consulta');return randomVisual(q);},
    seguroDefesoConsultar:async()=>{requirePermission(user,'consulta');return seguroDefeso(q);},
    modelosDocumentosListar:async()=>documentModelsList(q,user),
    cepConsultar:async()=>{const cep=String(q.cep||'').replace(/\D/g,'');if(!/^\d{8}$/.test(cep))throw httpError(400,'CEP inválido.');const r=await fetch('https://viacep.com.br/ws/'+cep+'/json/');const b=await r.json();if(b.erro)throw httpError(404,'CEP não localizado.');return {cep,logradouro:b.logradouro||'',bairro:b.bairro||'',cidade:b.localidade||'',uf:b.uf||'',fonte:'ViaCEP'};},
    documentosImportar:async()=>{requirePermission(user,'cadastro');return importDocuments(q);}
  };
  if(reads[action])return reads[action]();

  switch(action){
    case 'pessoaSalvar':
    case 'pessoaRetificar': return personSave(action,q,user);
    case 'pessoaUpload': return uploadPersonDocument(q,user);
    case 'pessoaUploadLote': {
      const files=Array.isArray(q.arquivos)?q.arquivos:Array.isArray(q.documentos)?q.documentos:[];
      const resultados=[];
      for(const item of files)resultados.push(await uploadPersonDocument({...item,pessoaId:q.pessoaId,op:(q.op||randomId('OP'))+'_'+resultados.length},user));
      return {ok:true,resultados,mensagem:resultados.length+' arquivo(s) salvo(s).'};
    }
    case 'pessoaDocumentoExcluir': return deletePersonDocument(q,user);
    case 'pessoaDocumentoSubstituir': return replacePersonDocument(q,user);
    case 'pessoaFinalizarCadastro': return finalizePerson(action,q,user);
    case 'pessoaInicialGerar':
    case 'minutaInicialGerar': return generateInitialOnly(action,q,user);
    case 'documentoConferir': return checkDocument(q,user);
    case 'tarefaDistribuicaoAtribuir': return assignTask(q,user);
    case 'tarefasAtribuirLote': return batchAssign(q,user);
    case 'tarefaDistribuicaoAssumirProxima': return claimNextDistribution(user);
    case 'tarefaDistribuicaoConcluir': return completeTask(q,user);
    case 'tarefasDistribuicaoReconciliar': return reconcileTasks(q,user);
    case 'tarefaGeralCriar': return generalTaskCreate(q,user);
    case 'tarefaGeralReatribuir': return generalTaskAssign(q,user);
    case 'tarefaGeralEncaminharEquipe': return generalTaskForwardTeam(q,user);
    case 'tarefaGeralConcluir': return generalTaskComplete(q,user);
    case 'tarefaGeralReabrir': return generalTaskReopen(q,user);
    case 'tarefaGeralMensagemEnviar': return generalTaskMessageSend(q,user);
    case 'tarefaGeralAnexoAdicionar': return generalTaskAttachmentAdd(q,user);
    case 'tarefaMarcarVista': return markTaskViewed(q,user);
    case 'notificacoesTarefasMarcarLidas': return markNotificationsSeen(user);
    case 'notificacaoTarefaTratar': return treatNotification(q,user);
    case 'notificacoesTarefasTratarLote': return treatNotificationsBatch(q,user);
    case 'notificacaoTarefaReabrir': return reopenNotification(q,user);
    case 'distribuicaoAutomaticaSalvar': return distributionAutoSave(q,user);
    case 'distribuicaoAutomaticaExecutar': return distributionAutoRun(user);
    case 'tarefaTagSalvar': return taskTagSave(q,user);
    case 'tarefaTagExcluir': return taskTagDelete(q,user);
    case 'processoDatajudSincronizar': return syncProcess(q,user);
    case 'pessoaExcluirDefinitivo': return personDeleteCascade(q,user);
    case 'configSalvar': return saveConfig(q,user);
    case 'usuarioSalvar': return saveUser(q,user);
    case 'usuarioRedefinirSenha': requirePermission(user,'administracao');return adminResetPassword(required(q.id,'usuário'),required(q.senha||q.novaSenha,'nova senha'),user);
    case 'usuarioAprovarProfessorResidente': return approveProfessor(q,user);
    case 'usuarioExcluir': return deleteUser(q,user);
    case 'usuariosAcessosGoogleSincronizar': requirePermission(user,'administracao');return {ok:true,mensagem:'No Cloud, as permissões de documentos são controladas pela aplicação e pelo IAM; não há sincronização com Drive.'};
    case 'tarefaDocumentosZipGerar': return taskZip(q,user);
    case 'upload': return uploadPersonDocument({...q,pessoaId:(await get('Atendimentos',q.atendimentoId)).pessoaId},user);
    case 'modeloUpload': return saveModelAction(q,user);
    case 'modeloDocumentoSalvar': return documentModelSave(q,user);
    case 'modeloDocumentoAtivar': return documentModelToggle(q,user);
    case 'modeloDocumentoExcluir': return documentModelDelete(q,user);
    case 'modeloDocumentoGerar': return documentModelGenerate(q,user);
    case 'portalApiKeySalvar': return savePortalKey(q,user);
    case 'deepseekApiKeySalvar': return saveDeepseekKey(q,user);
    case 'seguroDefesoRelatorioGerar': return generateSeguroReportAction(q,user);
    case 'imagemSistemaUpload': requirePermission(user,'administracao');return uploadVisual(q,user);
    case 'imagemSistemaSalvar': requirePermission(user,'administracao');return saveVisualMeta(q);
    case 'imagemSistemaExcluir': requirePermission(user,'administracao');return deleteVisual(q);
    default: throw httpError(404,'Operação Cloud ainda não implementada: '+action);
  }
}
export async function getDocumentForDownload(documentId,user){
  requirePermission(user,'consulta');
  const doc=await get('Documentos',documentId);
  if(!bool(doc.vigente))throw httpError(404,'Documento não está vigente.');
  if(!String(doc.fileId||'').startsWith('gcs:'))return {redirect:doc.url};
  const objectName=String(doc.fileId).slice(4);
  const file=bucket.file(objectName);
  const [exists]=await file.exists();if(!exists)throw httpError(404,'Arquivo não localizado.');
  return {file,doc};
}

