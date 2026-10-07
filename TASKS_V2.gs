/**
 * POVO DAS ÁGUAS — TAREFAS / DISTRIBUIÇÃO V2
 * Etapa 1: regras, consultas lazy, tags, ranking, distribuição automática
 * e exclusão administrativa em cascata.
 */

function taskDatePlusDays_(base,days){
  const parsed=new Date(base||now_());
  if(Number.isNaN(parsed.getTime()))return '';
  parsed.setUTCDate(parsed.getUTCDate()+Number(days||0));
  return Utilities.formatDate(parsed,PDA.tz,'yyyy-MM-dd');
}

function distributionAutoEnabled_(){
  try{
    return bool_(cfg_().distribuicaoAutomatica);
  }catch(e){
    return false;
  }
}

function distributionAutoAssignee_(tasks){
  const users=distributionUsers_();
  if(!users.length)return null;

  const open=(tasks||all_('Tarefas')).filter(task=>
    task.tipo===DISTRIBUTION_TASK_TYPE&&
    task.situacao!==DISTRIBUTION_TASK_DONE
  );

  const stats=new Map(
    users.map(user=>[
      String(user.email||'').toLowerCase(),
      {
        user,
        abertas:0,
        ultima:''
      }
    ])
  );

  open.forEach(task=>{
    const email=String(task.responsavel||'').toLowerCase();
    const stat=stats.get(email);
    if(!stat)return;
    stat.abertas++;
    const when=String(task.atribuidaEm||task.criadoEm||'');
    if(when>stat.ultima)stat.ultima=when;
  });

  return Array.from(stats.values())
    .sort((a,b)=>{
      if(a.abertas!==b.abertas)return a.abertas-b.abertas;
      if(a.ultima!==b.ultima){
        if(!a.ultima)return -1;
        if(!b.ultima)return 1;
        return a.ultima.localeCompare(b.ultima);
      }
      return String(a.user.nome||a.user.email)
        .localeCompare(String(b.user.nome||b.user.email),'pt-BR',{sensitivity:'base'});
    })[0].user;
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
  const staged=all_('Tarefas').map(task=>Object.assign({},task));
  const pending=staged
    .filter(task=>
      task.tipo===DISTRIBUTION_TASK_TYPE&&
      task.situacao===DISTRIBUTION_TASK_PENDING&&
      !String(task.responsavel||'').trim()
    )
    .sort((a,b)=>String(a.criadoEm||'').localeCompare(String(b.criadoEm||'')));

  let assigned=0;

  pending.forEach(task=>{
    const user=distributionAutoAssignee_(staged);
    if(!user)return;

    const updated=change_(
      ctx,
      'Tarefas',
      task.id,
      Object.assign({},task,{
        responsavel:String(user.email||'').toLowerCase(),
        situacao:DISTRIBUTION_TASK_ASSIGNED,
        atribuidaEm:now_(),
        modoDistribuicao:'AUTOMATICA',
        observacoes:String(task.observacoes||'')+
          (task.observacoes?'\n':'')+
          'Atribuída automaticamente por equilíbrio de carga.'
      }),
      task.versao
    );

    const index=staged.findIndex(item=>item.id===task.id);
    if(index>=0)staged[index]=updated;
    assigned++;
  });

  return {
    atribuidas:assigned,
    mensagem:assigned
      ?assigned+' tarefa(s) distribuída(s) automaticamente.'
      :'Não havia tarefas pendentes para distribuição automática.'
  };
}

function taskTagCatalog_(){
  ensureGeneralTaskSchema_();

  const persisted=generalTaskRows_('TarefaTags')
    .filter(tag=>bool_(tag.ativo));

  const byName=new Map();

  DEFAULT_TASK_TAGS.forEach(tag=>{
    byName.set(String(tag.nome).toUpperCase(),{
      id:'DEFAULT_'+hash_(tag.nome).slice(0,10),
      nome:tag.nome,
      cor:tag.cor,
      ativo:true,
      padrao:true
    });
  });

  persisted.forEach(tag=>{
    const name=String(tag.nome||'').trim();
    if(!name)return;
    byName.set(name.toUpperCase(),{
      id:tag.id,
      nome:name,
      cor:String(tag.cor||'#176e7d'),
      ativo:bool_(tag.ativo),
      padrao:false
    });
  });

  return Array.from(byName.values())
    .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR',{sensitivity:'base'}));
}

function taskTagAdminList_(){
  const persisted=generalTaskRows_('TarefaTags');
  const catalog=taskTagCatalog_();
  const seen=new Set(catalog.map(tag=>String(tag.nome).toUpperCase()));

  persisted
    .filter(tag=>!bool_(tag.ativo)&&!seen.has(String(tag.nome||'').toUpperCase()))
    .forEach(tag=>{
      catalog.push({
        id:tag.id,
        nome:tag.nome,
        cor:tag.cor||'#176e7d',
        ativo:false,
        padrao:false
      });
    });

  return catalog;
}

function taskTagColor_(name){
  const wanted=String(name||'').toUpperCase();
  const tag=taskTagCatalog_().find(item=>String(item.nome||'').toUpperCase()===wanted);
  return tag?tag.cor:'#176e7d';
}

function taskTagsDecorated_(value,colorMap){
  return taskTagsParse_(value).map(nome=>({
    nome,
    cor:colorMap
      ?(colorMap.get(String(nome).toUpperCase())||'#176e7d')
      :taskTagColor_(nome)
  }));
}

function taskTagSave_(ctx,q){
  ensureGeneralTaskSchema_();

  const nome=String(required_(q.nome,'nome da tag')).trim().slice(0,40);
  const cor=String(q.cor||'#176e7d').trim();

  if(!/^#[0-9a-fA-F]{6}$/.test(cor)){
    fail_('Informe a cor da tag no formato hexadecimal #RRGGBB.');
  }

  const existing=q.id
    ?generalTaskRows_('TarefaTags').find(tag=>tag.id===q.id)
    :generalTaskRows_('TarefaTags').find(tag=>
        String(tag.nome||'').toUpperCase()===nome.toUpperCase()
      );

  if(existing){
    return {
      tag:change_(ctx,'TarefaTags',existing.id,{
        nome,
        cor,
        ativo:q.ativo===undefined?true:bool_(q.ativo)
      },existing.versao),
      mensagem:'Tag atualizada.'
    };
  }

  return {
    tag:change_(ctx,'TarefaTags',id_('TAG',ctx.op),{
      nome,
      cor,
      ativo:q.ativo===undefined?true:bool_(q.ativo)
    }),
    mensagem:'Tag criada.'
  };
}

function taskTagDelete_(ctx,q){
  const tag=get_('TarefaTags',required_(q.id,'tag'));
  remove_(ctx,'TarefaTags',tag.id,tag.versao);
  return {ok:true,mensagem:'Tag excluída.'};
}

function taskV2Summary_(task,peopleById,usersByEmail,messageCounts,attachmentCounts,tagColorMap){
  let base;

  if(task.tipo===DISTRIBUTION_TASK_TYPE){
    base=distributionTaskSummary_(task,peopleById,usersByEmail);
    base.tipo=DISTRIBUTION_TASK_TYPE;
    base.tipoLabel='Distribuição processual';
    base.titulo=task.titulo||'Distribuir processo';
    base.descricao=task.descricao||'';
    base.criadoPor=task.criadoPor||'';
    base.criadoPorNome=generalTaskDisplayUser_(task.criadoPor,usersByEmail);
    base.prioridade=task.prioridade||'ALTA';
    base.prazo=task.prazo||'';
    base.tags=taskTagsDecorated_(task.tags||JSON.stringify(['PROCESSO']),tagColorMap);
    base.modoDistribuicao=task.modoDistribuicao||'MANUAL';
    base.mensagens=Number(messageCounts.get(task.id)||0);
    base.anexos=Number(attachmentCounts.get(task.id)||0);
  }else{
    base=generalTaskSummary_(task,usersByEmail,messageCounts,attachmentCounts);
    base.tipoLabel='Tarefa interna';
    base.tags=taskTagsDecorated_(task.tags,tagColorMap);
  }

  const due=taskDueState_(task);
  base.vencimentoEstado=due.estado;
  base.horasRestantes=due.horas;
  base.dataDistribuicao=task.atribuidaEm||task.criadoEm||'';

  return base;
}

function tasksCollectionV2_(q,mode){
  q=q||{};

  const people=all_('Pessoas');
  const users=all_('Usuarios');
  const peopleById=new Map(people.map(p=>[p.id,p]));
  const usersByEmail=new Map(users.map(u=>[String(u.email||'').toLowerCase(),u]));
  const messageCounts=generalTaskCountMap_(generalTaskRows_('TarefaMensagens'));
  const attachmentCounts=generalTaskCountMap_(generalTaskRows_('TarefaAnexos'));
  const tagCatalog=taskTagCatalog_();
  const tagColorMap=new Map(
    tagCatalog.map(tag=>[
      String(tag.nome||'').toUpperCase(),
      tag.cor||'#176e7d'
    ])
  );

  const isDone=task=>
    task.situacao===GENERAL_TASK_DONE||
    task.situacao===DISTRIBUTION_TASK_DONE;

  let rows=all_('Tarefas')
    .filter(task=>{
      if(mode==='open'&&isDone(task))return false;
      if(mode==='history'&&!isDone(task))return false;
      if(q.pessoaId&&task.pessoaId!==q.pessoaId)return false;
      if(q.responsavel&&String(task.responsavel||'').toLowerCase()!==String(q.responsavel).toLowerCase())return false;
      if(q.tipo&&task.tipo!==q.tipo)return false;

      const assigned=String(task.atribuidaEm||task.criadoEm||'').slice(0,10);
      const due=String(task.prazo||'').slice(0,10);
      if(q.atribuidaDe&&assigned<q.atribuidaDe)return false;
      if(q.atribuidaAte&&assigned>q.atribuidaAte)return false;
      if(q.prazoDe&&due<q.prazoDe)return false;
      if(q.prazoAte&&due>q.prazoAte)return false;
      return true;
    })
    .map(task=>taskV2Summary_(task,peopleById,usersByEmail,messageCounts,attachmentCounts,tagColorMap));

  const term=String(q.busca||'').trim().toLowerCase();
  if(term){
    rows=rows.filter(task=>[
      task.titulo,task.descricao,task.pessoa,task.cpf,task.jurisdicao,
      task.responsavelNome,task.criadoPorNome,
      ...(task.tags||[]).map(tag=>tag.nome||tag)
    ].join(' ').toLowerCase().includes(term));
  }

  rows.sort((a,b)=>{
    if(mode==='history'){
      return String(b.concluidaEm||b.alteradoEm||'')
        .localeCompare(String(a.concluidaEm||a.alteradoEm||''));
    }

    const weight={VENCIDA:0,ATE_24H:1,ATE_96H:2,NORMAL:3,SEM_PRAZO:4};
    const aw=weight[a.vencimentoEstado]??5;
    const bw=weight[b.vencimentoEstado]??5;
    if(aw!==bw)return aw-bw;
    return String(a.prazo||'9999-12-31').localeCompare(String(b.prazo||'9999-12-31'));
  });

  const offset=Math.max(0,Number(q.offset)||0);
  const limit=Math.min(500,Math.max(1,Number(q.limit)||200));
  const total=rows.length;

  return {
    tarefas:rows.slice(offset,offset+limit),
    total,
    offset,
    limit,
    hasMore:offset+limit<total
  };
}

function tasksManagementOpenV2_(q){
  const result=tasksCollectionV2_(q,'open');
  const tasks=result.tarefas;

  return Object.assign({},result,{
    usuariosTarefas:generalTaskAssignableUsers_(),
    usuariosDistribuicao:distributionUsers_(),
    tags:taskTagCatalog_(),
    distribuicaoAutomatica:distributionAutoEnabled_(),
    indicadores:{
      totalAbertas:result.total,
      geraisAbertas:tasks.filter(task=>task.tipo===GENERAL_TASK_TYPE).length,
      distribuicoesAbertas:tasks.filter(task=>task.tipo===DISTRIBUTION_TASK_TYPE).length,
      semResponsavel:tasks.filter(task=>task.tipo===DISTRIBUTION_TASK_TYPE&&!task.responsavel).length,
      ate96h:tasks.filter(task=>['ATE_96H','ATE_24H','VENCIDA'].includes(task.vencimentoEstado)).length
    }
  });
}

function tasksHistoryV2_(q){
  const result=tasksCollectionV2_(q,'history');
  return Object.assign({},result,{
    usuariosTarefas:generalTaskAssignableUsers_(),
    tags:taskTagCatalog_()
  });
}

function myTasksOpenV2_(q){
  q=Object.assign({},q||{},{
    responsavel:String(identity_()||'').toLowerCase()
  });
  const result=tasksCollectionV2_(q,'open');
  return Object.assign({},result,{tags:taskTagCatalog_()});
}

function myTasksHistoryV2_(q){
  q=Object.assign({},q||{},{
    responsavel:String(identity_()||'').toLowerCase()
  });
  const result=tasksCollectionV2_(q,'history');
  return Object.assign({},result,{tags:taskTagCatalog_()});
}

function personTasksV2_(q){
  const pessoaId=String(required_(q.pessoaId,'pessoa')).trim();
  get_('Pessoas',pessoaId);
  const mode=bool_(q.historico)?'history':'open';
  return Object.assign(
    {},
    tasksCollectionV2_(Object.assign({},q,{pessoaId}),mode),
    {tags:taskTagCatalog_()}
  );
}

function distributionRankingAllowed_(){
  const user=activeUser_();
  const role=String(user.perfil||'').toUpperCase();
  const functionName=String(user.funcao||'').trim().toLowerCase();

  if(
    role==='ADMIN'||
    role==='PROFESSOR_RESIDENTE'||
    functionName==='professor'||
    functionName==='residente'
  ){
    return user;
  }

  fail_('Ranking disponível somente para Residente, Professor ou Administrador.');
}

function distributionRanking_(q){
  distributionRankingAllowed_();
  q=q||{};

  const from=String(q.de||q.inicio||'');
  const to=String(q.ate||q.fim||'');

  const inRange=value=>{
    const day=String(value||'').slice(0,10);
    if(!day)return false;
    if(from&&day<from)return false;
    if(to&&day>to)return false;
    return true;
  };

  const users=all_('Usuarios')
    .filter(user=>bool_(user.ativo));

  const sessions=all_('Sessoes');
  const people=all_('Pessoas');
  const tasks=all_('Tarefas');
  const processes=all_('Processos');

  const rows=users.map(user=>{
    const email=String(user.email||'').toLowerCase();
    const userSessions=sessions.filter(session=>
      session.usuarioId===user.id&&
      (!from&&!to||inRange(session.criadoEm))
    ).length;

    const cadastros=people.filter(person=>
      String(person.criadoPor||person.usuario||'').toLowerCase()===email&&
      (!from&&!to||inRange(person.criadoEm))
    ).length;

    const tarefasConcluidas=tasks.filter(task=>
      String(task.responsavel||'').toLowerCase()===email&&
      (
        task.situacao===GENERAL_TASK_DONE||
        task.situacao===DISTRIBUTION_TASK_DONE
      )&&
      (!from&&!to||inRange(task.concluidaEm))
    ).length;

    const processosDistribuidos=processes.filter(process=>
      String(process.responsavel||'').toLowerCase()===email&&
      (!from&&!to||inRange(process.distribuidoEm||process.criadoEm))
    ).length;

    return {
      email,
      nome:user.nome||user.email,
      funcao:user.funcao||user.perfil||'',
      cadastros,
      tarefasConcluidas,
      processosDistribuidos,
      logins:userSessions,
      mediaProcessosPorLogin:userSessions
        ?processosDistribuidos/userSessions
        :0
    };
  });

  const rankBy=(key,desc=true)=>{
    const ordered=rows.slice().sort((a,b)=>{
      const av=Number(a[key]||0),bv=Number(b[key]||0);
      if(av!==bv)return desc?bv-av:av-bv;
      return a.nome.localeCompare(b.nome,'pt-BR',{sensitivity:'base'});
    });
    let last=null,position=0;
    return new Map(ordered.map((row,index)=>{
      const value=Number(row[key]||0);
      if(last===null||value!==last)position=index+1;
      last=value;
      return [row.email,position];
    }));
  };

  const rankCad=rankBy('cadastros');
  const rankTasks=rankBy('tarefasConcluidas');
  const rankProc=rankBy('processosDistribuidos');
  const rankAvg=rankBy('mediaProcessosPorLogin');

  rows.forEach(row=>{
    row.rankCadastros=rankCad.get(row.email);
    row.rankTarefas=rankTasks.get(row.email);
    row.rankProcessos=rankProc.get(row.email);
    row.rankMedia=rankAvg.get(row.email);
    row.posicao=row.rankProcessos;
  });

  rows.sort((a,b)=>
    a.rankProcessos-b.rankProcessos||
    a.rankTarefas-b.rankTarefas||
    a.nome.localeCompare(b.nome,'pt-BR',{sensitivity:'base'})
  );

  return {
    de:from,
    ate:to,
    inicio:from,
    fim:to,
    linhas:rows
  };
}

function personDeletePreview_(q){
  const person=get_('Pessoas',required_(q.id,'pessoa'));
  const attendance=all_('Atendimentos').filter(row=>row.pessoaId===person.id);
  const attendanceIds=new Set(attendance.map(row=>row.id));

  const documents=all_('Documentos').filter(row=>
    row.atendimentoId===personOwnerKey_(person.id)||
    attendanceIds.has(row.atendimentoId)
  );

  const tasks=all_('Tarefas').filter(row=>row.pessoaId===person.id);
  const processes=all_('Processos').filter(row=>row.pessoaId===person.id);

  return {
    id:person.id,
    nome:person.nome,
    cpf:person.cpf,
    atendimentos:attendance.length,
    documentos:documents.length,
    tarefas:tasks.length,
    processos:processes.length,
    exigeConfirmacaoReforcada:!!(tasks.length||processes.length)
  };
}

function personFolderCandidates_(person){
  const root=DriveApp.getFolderById(PDA.parent);
  const desired=safeName_(person.nome)+' - '+cpfDisplay_(person.cpf);
  const rawCpf=String(person.cpf||'');
  const formatted=cpfDisplay_(person.cpf);
  const out=[];
  const iterator=root.getFolders();

  while(iterator.hasNext()){
    const folder=iterator.next();
    const name=folder.getName();
    if(
      name===desired||
      name.includes(person.id)||
      (rawCpf&&name.includes(rawCpf))||
      (formatted&&name.includes(formatted))
    ){
      out.push(folder);
    }
  }
  return out;
}

function personDeleteCascade_(ctx,q){
  const person=get_('Pessoas',required_(q.id,'pessoa'));

  if(!bool_(q.confirmar)){
    fail_('Confirme explicitamente a exclusão definitiva do cadastro.');
  }

  version_(person,q.versao);

  const preview=personDeletePreview_({id:person.id});

  if(preview.exigeConfirmacaoReforcada&&!bool_(q.confirmarVinculos)){
    fail_('Este cadastro possui processos ou tarefas. Confirme também a exclusão dos vínculos.');
  }

  const attendance=all_('Atendimentos').filter(row=>row.pessoaId===person.id);
  const attendanceIds=new Set(attendance.map(row=>row.id));
  const tasks=all_('Tarefas').filter(row=>row.pessoaId===person.id);
  const taskIds=new Set(tasks.map(row=>row.id));
  const processes=all_('Processos').filter(row=>row.pessoaId===person.id);
  const processIds=new Set(processes.map(row=>row.id));

  const documents=all_('Documentos').filter(row=>
    row.atendimentoId===personOwnerKey_(person.id)||
    attendanceIds.has(row.atendimentoId)
  );
  const documentIds=new Set(documents.map(row=>row.id));

  const minutas=all_('Minutas').filter(row=>attendanceIds.has(row.atendimentoId));
  const pendencias=all_('Pendencias').filter(row=>attendanceIds.has(row.atendimentoId));
  const messages=all_('TarefaMensagens').filter(row=>taskIds.has(row.tarefaId));
  const attachments=all_('TarefaAnexos').filter(row=>taskIds.has(row.tarefaId));
  const distributions=all_('Distribuicao').filter(row=>
    attendanceIds.has(row.atendimentoId)||
    processIds.has(row.processoId)
  );

  const relatedIds=new Set([
    person.id,
    ...attendance.map(row=>row.id),
    ...tasks.map(row=>row.id),
    ...processes.map(row=>row.id),
    ...documents.map(row=>row.id),
    ...minutas.map(row=>row.id),
    ...pendencias.map(row=>row.id),
    ...messages.map(row=>row.id),
    ...attachments.map(row=>row.id),
    ...distributions.map(row=>row.id)
  ]);

  const priorHistory=all_('Historico').filter(row=>relatedIds.has(row.registroId));

  ctx.redactDeletionAudit=true;

  [
    ['TarefaMensagens',messages],
    ['TarefaAnexos',attachments],
    ['Tarefas',tasks],
    ['Distribuicao',distributions],
    ['Processos',processes],
    ['Minutas',minutas],
    ['Pendencias',pendencias],
    ['Documentos',documents],
    ['Atendimentos',attendance],
    ['Historico',priorHistory],
    ['Pessoas',[person]]
  ].forEach(([entity,rows])=>{
    rows.forEach(row=>remove_(ctx,entity,row.id,row.versao));
  });

  personFolderCandidates_(person).forEach(folder=>{
    try{
      folder.setTrashed(true);
      ctx.effects.push('Pasta da pessoa movida para a lixeira: '+folder.getName());
    }catch(e){
      ctx.effects.push('Não foi possível mover uma pasta para a lixeira: '+(e.message||e));
    }
  });

  return {
    ok:true,
    excluidos:{
      pessoas:1,
      atendimentos:attendance.length,
      documentos:documents.length,
      tarefas:tasks.length,
      processos:processes.length
    },
    mensagem:'Cadastro e vínculos relacionados excluídos definitivamente.'
  };
}
