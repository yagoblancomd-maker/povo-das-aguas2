/**
 * Camada operacional V2 de tarefas, histórico, distribuição automática,
 * ranking e vínculos com cadastros.
 */

function taskDatePlusDays_(value,days){
  const base=value?new Date(value):new Date();
  if(Number.isNaN(base.getTime()))return '';
  base.setDate(base.getDate()+Number(days||0));
  return Utilities.formatDate(base,PDA.tz,'yyyy-MM-dd');
}

function taskTagCatalog_(){
  ensureGeneralTaskSchema_();
  const rows=generalTaskRows_('TarefaTags')
    .filter(row=>bool_(row.ativo));

  if(rows.length){
    return rows
      .map(row=>({
        id:row.id,
        nome:row.nome,
        cor:row.cor||'#176e7d'
      }))
      .sort((a,b)=>String(a.nome).localeCompare(String(b.nome),'pt-BR',{sensitivity:'base'}));
  }

  return DEFAULT_TASK_TAGS.map((tag,index)=>({
    id:'DEFAULT_'+index,
    nome:tag.nome,
    cor:tag.cor
  }));
}

function taskTagColorMap_(){
  return new Map(
    taskTagCatalog_().map(tag=>[
      String(tag.nome||'').toUpperCase(),
      tag.cor
    ])
  );
}

function taskTagSave_(ctx,q){
  ensureGeneralTaskSchema_();
  const nome=String(required_(q.nome,'nome da tag')).trim().toUpperCase();
  const cor=String(q.cor||'#176e7d').trim();

  if(nome.length>40)fail_('A tag deve ter no máximo 40 caracteres.');
  if(!/^#[0-9a-fA-F]{6}$/.test(cor))fail_('Informe a cor no formato #RRGGBB.');

  const existing=q.id
    ?get_('TarefaTags',q.id)
    :all_('TarefaTags').find(row=>String(row.nome||'').toUpperCase()===nome);

  return change_(
    ctx,
    'TarefaTags',
    existing?existing.id:id_('TAG',nome),
    {
      nome,
      cor,
      ativo:q.ativo===undefined?true:bool_(q.ativo)
    },
    existing?existing.versao:undefined
  );
}

function taskTagDelete_(ctx,q){
  const tag=get_('TarefaTags',required_(q.id,'tag'));
  return remove_(ctx,'TarefaTags',tag.id,tag.versao);
}

function taskDefaultDue_(task){
  if(task.prazo)return task.prazo;
  if(task.tipo===DISTRIBUTION_TASK_TYPE){
    return taskDatePlusDays_(task.criadoEm||now_(),4);
  }
  return '';
}

function taskMapsV2_(){
  const users=all_('Usuarios');
  const people=all_('Pessoas');
  const messages=generalTaskRows_('TarefaMensagens');
  const attachments=generalTaskRows_('TarefaAnexos');

  return {
    usersByEmail:new Map(users.map(u=>[String(u.email||'').toLowerCase(),u])),
    peopleById:new Map(people.map(p=>[p.id,p])),
    messageCounts:generalTaskCountMap_(messages),
    attachmentCounts:generalTaskCountMap_(attachments),
    tagColors:taskTagColorMap_()
  };
}

function taskSummaryV2_(task,maps){
  const person=maps.peopleById.get(task.pessoaId)||null;
  const responsible=maps.usersByEmail.get(String(task.responsavel||'').toLowerCase())||null;
  const creator=maps.usersByEmail.get(String(task.criadoPor||'').toLowerCase())||null;
  const tags=taskTagsParse_(task.tags);

  if(task.tipo===DISTRIBUTION_TASK_TYPE&&!tags.includes('PROCESSO')){
    tags.unshift('PROCESSO');
  }

  const prazo=taskDefaultDue_(task);
  const due=taskDueState_(Object.assign({},task,{prazo}));

  return {
    id:task.id,
    versao:task.versao,
    tipo:task.tipo,
    tipoLabel:task.tipo===DISTRIBUTION_TASK_TYPE?'Distribuição processual':'Tarefa interna',
    titulo:task.tipo===DISTRIBUTION_TASK_TYPE
      ?'Distribuir processo — '+(person?person.nome:'Cadastro')
      :(task.titulo||'Tarefa'),
    descricao:task.descricao||task.observacoes||'',
    pessoaId:task.pessoaId||'',
    pessoa:person?person.nome:'',
    cpf:person?person.cpf:'',
    processoId:task.processoId||'',
    responsavel:task.responsavel||'',
    responsavelNome:responsible?(responsible.nome||responsible.email):'',
    criadoPor:task.criadoPor||'',
    criadoPorNome:creator?(creator.nome||creator.email):'',
    situacao:task.situacao||'',
    prioridade:task.prioridade||(
      task.tipo===DISTRIBUTION_TASK_TYPE?'ALTA':'NORMAL'
    ),
    prazo,
    criadoEm:task.criadoEm||'',
    atribuidaEm:task.atribuidaEm||'',
    concluidaEm:task.concluidaEm||'',
    jurisdicao:task.jurisdicao||(person?person.jurisdicao:''),
    valorCausa:Number(task.valorCausa||0),
    tags:tags.map(nome=>({
      nome,
      cor:maps.tagColors.get(String(nome).toUpperCase())||'#176e7d'
    })),
    mensagens:Number(maps.messageCounts.get(task.id)||0),
    anexos:Number(maps.attachmentCounts.get(task.id)||0),
    vencimentoEstado:due.estado,
    horasRestantes:due.horas,
    modoDistribuicao:task.modoDistribuicao||'MANUAL',
    dataDistribuicao:task.atribuidaEm||task.criadoEm||''
  };
}

function taskFilterV2_(summary,q){
  q=q||{};

  if(q.pessoaId&&summary.pessoaId!==q.pessoaId)return false;
  if(q.responsavel&&String(summary.responsavel).toLowerCase()!==String(q.responsavel).toLowerCase())return false;
  if(q.tipo&&summary.tipo!==q.tipo)return false;

  const de=String(q.de||'');
  const ate=String(q.ate||'');
  const ref=String(summary.dataDistribuicao||summary.criadoEm||'').slice(0,10);

  if(de&&ref<de)return false;
  if(ate&&ref>ate)return false;

  const prazoDe=String(q.prazoDe||'');
  const prazoAte=String(q.prazoAte||'');

  if(prazoDe&&String(summary.prazo||'')<prazoDe)return false;
  if(prazoAte&&String(summary.prazo||'')>prazoAte)return false;

  const busca=String(q.busca||'').trim().toLowerCase();
  if(busca){
    const hay=[
      summary.titulo,
      summary.descricao,
      summary.pessoa,
      summary.cpf,
      summary.responsavelNome,
      summary.processoId,
      summary.jurisdicao,
      ...(summary.tags||[]).map(t=>t.nome)
    ].join(' ').toLowerCase();

    if(!hay.includes(busca))return false;
  }

  const tag=String(q.tag||'').trim().toUpperCase();
  if(tag&&!(summary.tags||[]).some(t=>String(t.nome).toUpperCase()===tag))return false;

  return true;
}

function tasksCollectionV2_(q,mode){
  const maps=taskMapsV2_();
  const email=String(identity_()||'').toLowerCase();

  let tasks=all_('Tarefas')
    .filter(task=>{
      const done=task.situacao===DISTRIBUTION_TASK_DONE||task.situacao===GENERAL_TASK_DONE;
      if(mode==='open'&&done)return false;
      if(mode==='history'&&!done)return false;
      if(mode==='mine'&&String(task.responsavel||'').toLowerCase()!==email)return false;
      if(mode==='mineHistory'&&(!done||String(task.responsavel||'').toLowerCase()!==email))return false;
      return true;
    })
    .map(task=>taskSummaryV2_(task,maps))
    .filter(task=>taskFilterV2_(task,q));

  tasks.sort((a,b)=>{
    if(mode==='history'||mode==='mineHistory'){
      return String(b.concluidaEm||b.criadoEm).localeCompare(String(a.concluidaEm||a.criadoEm));
    }
    const aDue=a.prazo||'9999-12-31';
    const bDue=b.prazo||'9999-12-31';
    if(aDue!==bDue)return aDue.localeCompare(bDue);
    return String(b.dataDistribuicao).localeCompare(String(a.dataDistribuicao));
  });

  return tasks.slice(0,Math.min(500,Math.max(1,Number(q&&q.limit||500))));
}

function tasksManagementOpenV2_(q){
  const usuariosTarefas=generalTaskAssignableUsers_();
  const usuariosDistribuicao=distributionUsers_();

  return {
    tarefas:tasksCollectionV2_(q,'open'),
    usuarios:usuariosDistribuicao,
    usuariosDistribuicao,
    usuariosTarefas,
    tags:taskTagCatalog_(),
    distribuicaoAutomatica:bool_(cfg_().distribuicaoAutomatica)
  };
}

function tasksHistoryV2_(q){
  return {
    tarefas:tasksCollectionV2_(q,'history'),
    tags:taskTagCatalog_()
  };
}

function myTasksOpenV2_(q){
  return {
    tarefas:tasksCollectionV2_(q,'mine'),
    tags:taskTagCatalog_()
  };
}

function myTasksHistoryV2_(q){
  return {
    tarefas:tasksCollectionV2_(q,'mineHistory'),
    tags:taskTagCatalog_()
  };
}

function personTasksV2_(q){
  required_(q.pessoaId,'pessoa');
  get_('Pessoas',q.pessoaId);
  const mode=bool_(q.historico)?'history':'open';
  return {
    tarefas:tasksCollectionV2_(Object.assign({},q,{pessoaId:q.pessoaId}),mode),
    tags:taskTagCatalog_()
  };
}

function distributionAutoEnabled_(){
  return bool_(cfg_().distribuicaoAutomatica);
}

function distributionAutoAssignee_(tasks){
  const users=distributionUsers_();
  if(!users.length)return null;

  const open=(tasks||all_('Tarefas')).filter(task=>
    task.tipo===DISTRIBUTION_TASK_TYPE&&
    task.situacao!==DISTRIBUTION_TASK_DONE&&
    String(task.responsavel||'').trim()
  );

  const metrics=users.map(user=>{
    const email=String(user.email||'').toLowerCase();
    const own=open.filter(task=>String(task.responsavel||'').toLowerCase()===email);
    const last=own
      .map(task=>String(task.atribuidaEm||task.criadoEm||''))
      .sort()
      .pop()||'';

    return {
      user,
      abertas:own.length,
      ultima:last
    };
  });

  metrics.sort((a,b)=>
    a.abertas-b.abertas||
    String(a.ultima||'').localeCompare(String(b.ultima||''))||
    String(a.user.nome||a.user.email).localeCompare(String(b.user.nome||b.user.email),'pt-BR')
  );

  return metrics[0].user;
}

function distributionAutoSave_(ctx,q){
  const enabled=bool_(q.ativo);
  setConfigValue_(ctx,'distribuicaoAutomatica',enabled);
  return {
    ativo:enabled,
    mensagem:enabled
      ?'Distribuição automática ativada.'
      :'Distribuição automática desativada.'
  };
}

function distributionAutoRun_(ctx){
  const users=distributionUsers_();
  if(!users.length)fail_('Nenhum usuário está habilitado para distribuir processos.');

  const allTasks=all_('Tarefas');
  const pending=allTasks
    .filter(task=>
      task.tipo===DISTRIBUTION_TASK_TYPE&&
      task.situacao===DISTRIBUTION_TASK_PENDING
    )
    .sort((a,b)=>String(a.criadoEm||'').localeCompare(String(b.criadoEm||'')));

  const shadow=allTasks.map(task=>Object.assign({},task));
  const assigned=[];

  pending.forEach(task=>{
    const user=distributionAutoAssignee_(shadow);
    if(!user)return;

    const updated=change_(
      ctx,
      'Tarefas',
      task.id,
      Object.assign({},task,{
        responsavel:String(user.email||'').toLowerCase(),
        situacao:DISTRIBUTION_TASK_ASSIGNED,
        atribuidaEm:now_(),
        prazo:taskDefaultDue_(task),
        prioridade:task.prioridade||'ALTA',
        tags:task.tags||JSON.stringify(['PROCESSO']),
        modoDistribuicao:'AUTOMATICA'
      }),
      task.versao
    );

    const shadowIndex=shadow.findIndex(item=>item.id===task.id);
    if(shadowIndex>=0)shadow[shadowIndex]=updated;

    assigned.push({
      tarefaId:task.id,
      pessoaId:task.pessoaId,
      responsavel:user.email,
      responsavelNome:user.nome||user.email
    });
  });

  return {
    quantidade:assigned.length,
    atribuicoes:assigned,
    mensagem:assigned.length
      ?assigned.length+' tarefa(s) distribuída(s) automaticamente.'
      :'Não havia tarefas sem responsável.'
  };
}

function distributionRankingAllowed_(){
  const user=activeUser_();
  const funcao=String(user.funcao||'').trim().toLowerCase();

  return (
    user.perfil==='ADMIN'||
    funcao==='professor'||
    funcao==='residente'
  );
}

function distributionRanking_(q){
  if(!distributionRankingAllowed_()){
    fail_('Ranking disponível somente para Residente, Professor ou Administrador.');
  }

  const inicio=String(q&&q.inicio||'');
  const fim=String(q&&q.fim||'');
  const within=value=>{
    const date=String(value||'').slice(0,10);
    if(!date)return false;
    return (!inicio||date>=inicio)&&(!fim||date<=fim);
  };

  const users=all_('Usuarios').filter(user=>bool_(user.ativo));
  const byEmail=new Map(users.map(u=>[String(u.email||'').toLowerCase(),u]));
  const byId=new Map(users.map(u=>[u.id,u]));

  const rows=new Map();
  const ensure=user=>{
    if(!user)return null;
    if(!rows.has(user.id)){
      rows.set(user.id,{
        usuarioId:user.id,
        nome:user.nome||user.email,
        funcao:user.funcao||'',
        email:user.email,
        cadastros:0,
        tarefasConcluidas:0,
        processosDistribuidos:0,
        logins:0,
        mediaProcessosPorLogin:0,
        total:0
      });
    }
    return rows.get(user.id);
  };

  users.forEach(ensure);

  all_('Pessoas').filter(p=>within(p.criadoEm)).forEach(p=>{
    const user=byEmail.get(String(p.criadoPor||p.usuario||'').toLowerCase());
    const row=ensure(user);
    if(row)row.cadastros++;
  });

  all_('Tarefas')
    .filter(task=>
      task.situacao===DISTRIBUTION_TASK_DONE||task.situacao===GENERAL_TASK_DONE
    )
    .filter(task=>within(task.concluidaEm))
    .forEach(task=>{
      const user=byEmail.get(String(task.responsavel||'').toLowerCase());
      const row=ensure(user);
      if(row)row.tarefasConcluidas++;
    });

  all_('Processos').filter(proc=>within(proc.distribuidoEm)).forEach(proc=>{
    const user=byEmail.get(String(proc.responsavel||'').toLowerCase());
    const row=ensure(user);
    if(row)row.processosDistribuidos++;
  });

  all_('Sessoes').filter(session=>within(session.criadoEm)).forEach(session=>{
    const user=byId.get(session.usuarioId);
    const row=ensure(user);
    if(row)row.logins++;
  });

  const result=[...rows.values()].map(row=>{
    row.mediaProcessosPorLogin=row.logins
      ?Math.round((row.processosDistribuidos/row.logins)*100)/100
      :0;
    row.total=row.cadastros+row.tarefasConcluidas+row.processosDistribuidos;
    return row;
  }).filter(row=>row.total||row.logins);

  result.sort((a,b)=>
    b.total-a.total||
    b.processosDistribuidos-a.processosDistribuidos||
    b.tarefasConcluidas-a.tarefasConcluidas||
    String(a.nome).localeCompare(String(b.nome),'pt-BR')
  );

  result.forEach((row,index)=>row.posicao=index+1);

  return {
    inicio,
    fim,
    linhas:result
  };
}

function personDeletePreview_(q){
  const person=get_('Pessoas',required_(q.id,'cadastro'));
  const tasks=all_('Tarefas').filter(t=>t.pessoaId===person.id);
  const processes=all_('Processos').filter(p=>p.pessoaId===person.id);
  const attendances=all_('Atendimentos').filter(a=>a.pessoaId===person.id);
  const attendanceIds=new Set(attendances.map(a=>a.id));
  const owner=personOwnerKey_(person.id);
  const docs=all_('Documentos').filter(d=>d.atendimentoId===owner||attendanceIds.has(d.atendimentoId));

  return {
    pessoa:{
      id:person.id,
      versao:person.versao,
      nome:person.nome,
      cpf:person.cpf
    },
    tarefas:tasks.length,
    processos:processes.length,
    atendimentos:attendances.length,
    documentos:docs.length,
    exigeConfirmacaoReforcada:!!(tasks.length||processes.length)
  };
}

function personDeleteCascade_(ctx,q){
  const preview=personDeletePreview_(q);
  const person=get_('Pessoas',preview.pessoa.id);

  if(Number(q.versao)!==person.versao){
    fail_('CONFLITO: o cadastro mudou. Reabra a ficha antes de excluir.');
  }

  if(!bool_(q.confirmar)){
    fail_('Confirme a exclusão definitiva.');
  }

  if(preview.exigeConfirmacaoReforcada&&!bool_(q.confirmarVinculos)){
    fail_('Existem processos ou tarefas vinculadas. Confirme também a exclusão desses vínculos.');
  }

  const taskIds=new Set(
    all_('Tarefas')
      .filter(task=>task.pessoaId===person.id)
      .map(task=>task.id)
  );

  const processes=all_('Processos').filter(proc=>proc.pessoaId===person.id);
  const processIds=new Set(processes.map(proc=>proc.id));
  const attendances=all_('Atendimentos').filter(a=>a.pessoaId===person.id);
  const attendanceIds=new Set(attendances.map(a=>a.id));
  const owner=personOwnerKey_(person.id);

  const removeRows=(entity,predicate)=>{
    all_(entity).filter(predicate).forEach(row=>{
      remove_(ctx,entity,row.id,row.versao);
    });
  };

  removeRows('TarefaMensagens',row=>taskIds.has(row.tarefaId));
  removeRows('TarefaAnexos',row=>taskIds.has(row.tarefaId));
  removeRows('Tarefas',row=>taskIds.has(row.id));
  removeRows('Minutas',row=>attendanceIds.has(row.atendimentoId));
  removeRows('Pendencias',row=>attendanceIds.has(row.atendimentoId));
  removeRows('Documentos',row=>row.atendimentoId===owner||attendanceIds.has(row.atendimentoId));
  removeRows('Distribuicao',row=>attendanceIds.has(row.atendimentoId)||processIds.has(row.processoId));
  processes.forEach(row=>remove_(ctx,'Processos',row.id,row.versao));
  attendances.forEach(row=>remove_(ctx,'Atendimentos',row.id,row.versao));

  const root=DriveApp.getFolderById(PDA.parent);
  const folders=root.getFolders();
  const rawCpf=String(person.cpf||'');
  const formatted=cpfDisplay_(person.cpf);
  const desired=safeName_(person.nome)+' - '+formatted;

  while(folders.hasNext()){
    const folder=folders.next();
    const name=folder.getName();
    if(
      name===desired||
      name.includes(person.id)||
      (rawCpf&&name.includes(rawCpf))||
      (formatted&&name.includes(formatted))
    ){
      try{folder.setTrashed(true);}catch(e){}
    }
  }

  try{
    const taskRoot=generalTasksRoot_();
    const taskFolders=taskRoot.getFolders();
    while(taskFolders.hasNext()){
      const folder=taskFolders.next();
      const name=folder.getName();
      if([...taskIds].some(id=>name.indexOf(id)===0)){
        try{folder.setTrashed(true);}catch(e){}
      }
    }
  }catch(e){}

  remove_(ctx,'Pessoas',person.id,person.versao);

  return {
    id:person.id,
    nome:person.nome,
    removidos:{
      tarefas:preview.tarefas,
      processos:preview.processos,
      atendimentos:preview.atendimentos,
      documentos:preview.documentos
    },
    mensagem:'Cadastro e vínculos relacionados excluídos definitivamente.'
  };
}
