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

function distributionAutoAssignee_(tasks,eligibleUsers){
  const users=eligibleUsers||distributionUsers_();
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
  const users=distributionUsers_();
  const usersByEmail=new Map(
    users.map(user=>[
      String(user.email||'').toLowerCase(),
      user
    ])
  );

  const pending=staged
    .filter(task=>
      task.tipo===DISTRIBUTION_TASK_TYPE&&
      task.situacao===DISTRIBUTION_TASK_PENDING&&
      !String(task.responsavel||'').trim()
    )
    .sort((a,b)=>String(a.criadoEm||'').localeCompare(String(b.criadoEm||'')));

  const alteradas=[];

  pending.forEach(task=>{
    const user=distributionAutoAssignee_(staged,users);
    if(!user)return;

    const assignedAt=now_();
    const email=String(user.email||'').toLowerCase();

    const updated=change_(
      ctx,
      'Tarefas',
      task.id,
      Object.assign({},task,{
        responsavel:email,
        situacao:DISTRIBUTION_TASK_ASSIGNED,
        atribuidaEm:assignedAt,
        modoDistribuicao:'AUTOMATICA',
        observacoes:String(task.observacoes||'')+
          (task.observacoes?'\n':'')+
          'Atribuída automaticamente por equilíbrio de carga.'
      }),
      task.versao
    );

    const index=staged.findIndex(item=>item.id===task.id);
    if(index>=0)staged[index]=updated;

    const resolved=usersByEmail.get(email)||user;
    alteradas.push({
      id:updated.id,
      versao:updated.versao,
      responsavel:email,
      responsavelNome:resolved.nome||email,
      situacao:updated.situacao,
      atribuidaEm:updated.atribuidaEm,
      dataDistribuicao:updated.atribuidaEm,
      modoDistribuicao:updated.modoDistribuicao
    });
  });

  return {
    atribuidas:alteradas.length,
    alteradas,
    mensagem:alteradas.length
      ?alteradas.length+' tarefa(s) distribuída(s) automaticamente.'
      :'Não havia tarefas pendentes para distribuição automática.'
  };
}

function taskTagCatalog_(){
  /*
   * Leituras não executam migração estrutural. As mutações de tarefas
   * garantem o schema quando necessário; isso evita cinco verificações de
   * cabeçalho a cada abertura de Tarefas/Distribuição.
   */
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

function taskMapsV2_(tasksOverride,options){
  options=options||{};
  const light=!!options.light;

  batchAll_(
    light
      ?[
          'Usuarios',
          'Pessoas',
          'Tarefas',
          'TarefaTags'
        ]
      :[
          'Usuarios',
          'Pessoas',
          'Tarefas',
          'TarefaMensagens',
          'TarefaAnexos',
          'TarefaLeituras',
          'TarefaTags'
        ]
  );

  const users=all_('Usuarios');
  const people=all_('Pessoas');
  const tasks=
    Array.isArray(tasksOverride)
      ?tasksOverride
      :all_('Tarefas');

  const messages=
    light
      ?[]
      :generalTaskRows_(
          'TarefaMensagens'
        );

  const attachments=
    light
      ?[]
      :generalTaskRows_(
          'TarefaAnexos'
        );

  const currentEmail=
    String(
      identity_()||
      ''
    ).toLowerCase();

  const movements=
    light
      ?{
          lastByTask:new Map(),
          readByTask:new Map()
        }
      :taskMovementMaps_(
          tasks,
          messages,
          attachments,
          currentEmail
        );

  const globalRead=
    light
      ?null
      :(
          generalTaskRows_(
            'TarefaLeituras'
          )
            .filter(row=>
              !String(
                row.tarefaId||
                ''
              ).trim()&&
              String(
                row.usuario||
                ''
              ).toLowerCase()===
              currentEmail
            )
            .sort((a,b)=>
              String(
                b.ultimoVistoEm||
                ''
              ).localeCompare(
                String(
                  a.ultimoVistoEm||
                  ''
                )
              )
            )[0]||
          null
        );

  const tagColorMap=new Map(
    taskTagCatalog_().map(tag=>[
      String(tag.nome||'').toUpperCase(),
      tag.cor||'#176e7d'
    ])
  );

  return {
    usersByEmail:new Map(
      users.map(user=>[
        String(user.email||'').toLowerCase(),
        user
      ])
    ),
    peopleById:new Map(
      people.map(person=>[
        person.id,
        person
      ])
    ),
    messageCounts:
      generalTaskCountMap_(
        messages
      ),
    attachmentCounts:
      generalTaskCountMap_(
        attachments
      ),
    tagColors:tagColorMap,
    lastMovements:
      movements.lastByTask,
    readByTask:
      movements.readByTask,
    globalSeen:
      String(
        globalRead&&
        globalRead.ultimoVistoEm||
        ''
      ),
    currentEmail,
    movementsLoaded:!light
  };
}

function taskSummaryV2_(task,maps){
  return taskV2Summary_(
    task,
    maps.peopleById,
    maps.usersByEmail,
    maps.messageCounts,
    maps.attachmentCounts,
    maps.tagColors,
    maps.lastMovements,
    maps.readByTask,
    maps.globalSeen,
    maps.currentEmail
  );
}

function taskV2Summary_(task,peopleById,usersByEmail,messageCounts,attachmentCounts,tagColorMap,lastMovements,readByTask,globalSeen,currentEmail){
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
    base=generalTaskSummary_(task,usersByEmail,messageCounts,attachmentCounts,peopleById);
    base.tipoLabel='Tarefa interna';
    base.tags=taskTagsDecorated_(task.tags,tagColorMap);
  }

  const due=taskDueState_(task);
  base.vencimentoEstado=due.estado;
  base.horasRestantes=due.horas;
  base.origem=task.origem||(
    task.tipo===DISTRIBUTION_TASK_TYPE
      ?'CADASTRO'
      :'INTERNA'
  );
  base.dataDistribuicao=task.atribuidaEm||task.criadoEm||'';

  const lastMovement=
    String(
      lastMovements&&
      lastMovements.get(task.id)||
      task.alteradoEm||
      task.atribuidaEm||
      task.criadoEm||
      ''
    );

  const taskSeen=
    String(
      readByTask&&
      readByTask.get(task.id)||
      ''
    );

  /*
   * NOVA MANIFESTAÇÃO só desaparece quando a própria tarefa é aberta.
   * A leitura do sino não equivale à leitura da movimentação.
   */
  const baseline=
    taskSeen||
    String(
      task.atribuidaEm||
      task.criadoEm||
      ''
    );

  base.ultimaMovimentacaoEm=
    lastMovement;

  base.ultimoVistoEm=
    taskSeen;

  base.novaManifestacao=
    !!(
      lastMovement&&
      baseline&&
      lastMovement>baseline
    );

  base.novaParaUsuario=
    String(
      currentEmail||
      ''
    ).toLowerCase()===
      String(
        task.responsavel||
        ''
      ).toLowerCase()||
    String(
      currentEmail||
      ''
    ).toLowerCase()===
      String(
        task.criadoPor||
        ''
      ).toLowerCase();

  return base;
}

function tasksCollectionV2_(q,mode,options){
  q=q||{};
  options=options||{};

  const allTasks=
    all_('Tarefas');

  const maps=
    taskMapsV2_(
      allTasks,
      options
    );

  const peopleById=
    maps.peopleById;

  const usersByEmail=
    maps.usersByEmail;

  const messageCounts=
    maps.messageCounts;

  const attachmentCounts=
    maps.attachmentCounts;

  const tagColorMap=
    maps.tagColors;

  const isDone=task=>
    task.situacao===GENERAL_TASK_DONE||
    task.situacao===DISTRIBUTION_TASK_DONE;

  const currentUser=
    activeUser_();

  let rows=allTasks
    .filter(task=>{
      if(
        isColonyUser_(currentUser)&&
        task.pessoaId
      ){
        const person=
          peopleById.get(
            task.pessoaId
          );

        if(
          !person||
          !personInUserScope_(
            currentUser,
            person
          )
        ){
          return false;
        }
      }

      if(mode==='open'&&isDone(task))return false;
      if(mode==='history'&&!isDone(task))return false;
      if(q.pessoaId&&task.pessoaId!==q.pessoaId)return false;

      if(
        q.responsavel&&
        String(
          task.responsavel||
          ''
        ).toLowerCase()!==
        String(q.responsavel).toLowerCase()
      )return false;

      if(q.participante){
        const participant=
          String(
            q.participante||
            ''
          ).toLowerCase();

        const responsible=
          String(
            task.responsavel||
            ''
          ).toLowerCase();

        const creator=
          String(
            task.criadoPor||
            ''
          ).toLowerCase();

        if(
          participant!==responsible&&
          participant!==creator
        )return false;
      }

      if(q.tipo&&task.tipo!==q.tipo)return false;

      const assigned=String(task.atribuidaEm||task.criadoEm||'').slice(0,10);
      const due=String(task.prazo||'').slice(0,10);
      if(q.atribuidaDe&&assigned<q.atribuidaDe)return false;
      if(q.atribuidaAte&&assigned>q.atribuidaAte)return false;
      if(q.prazoDe&&due<q.prazoDe)return false;
      if(q.prazoAte&&due>q.prazoAte)return false;
      return true;
    })
    .map(task=>{
      const summary=
        taskV2Summary_(
          task,
          peopleById,
          usersByEmail,
          messageCounts,
          attachmentCounts,
          tagColorMap,
          maps.lastMovements,
          maps.readByTask,
          maps.globalSeen,
          maps.currentEmail
        );

      summary.movimentacoesCarregadas=
        maps.movementsLoaded!==false;

      if(
        maps.movementsLoaded===false
      ){
        summary.novaManifestacao=false;
      }

      return summary;
    });

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

    if(
      !!a.novaManifestacao!==
      !!b.novaManifestacao
    ){
      return a.novaManifestacao
        ?-1
        :1;
    }

    const weight={
      VENCIDA:0,
      ATE_24H:1,
      ATE_96H:2,
      NORMAL:3,
      SEM_PRAZO:4
    };

    const aw=
      weight[a.vencimentoEstado]??5;

    const bw=
      weight[b.vencimentoEstado]??5;

    if(aw!==bw)return aw-bw;

    if(
      a.novaManifestacao&&
      b.novaManifestacao
    ){
      const movement=
        String(
          b.ultimaMovimentacaoEm||
          ''
        ).localeCompare(
          String(
            a.ultimaMovimentacaoEm||
            ''
          )
        );

      if(movement)return movement;
    }

    return String(
      a.prazo||
      '9999-12-31'
    ).localeCompare(
      String(
        b.prazo||
        '9999-12-31'
      )
    );
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
  batchAll_([
    'Configuracoes',
    'Usuarios',
    'Pessoas',
    'Tarefas',
    'TarefaTags'
  ]);

  const result=
    tasksCollectionV2_(
      q,
      'open',
      {light:true}
    );
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

  delete q.participante;

  const result=
    tasksCollectionV2_(
      q,
      'open',
      {light:true}
    );

  const user=
    activeUser_();

  const podeAssumir=
    hasPermission_(
      user,
      'distribuicao'
    );

  const disponiveis=
    podeAssumir
      ?all_('Tarefas')
        .filter(task=>
          task.tipo===DISTRIBUTION_TASK_TYPE&&
          task.situacao!==DISTRIBUTION_TASK_DONE&&
          !String(task.responsavel||'').trim()
        ).length
      :0;

  return Object.assign(
    {},
    result,
    {
      tags:taskTagCatalog_(),
      podeAssumirDistribuicao:podeAssumir,
      distribuicoesDisponiveis:disponiveis
    }
  );
}

function myTasksHistoryV2_(q){
  q=Object.assign({},q||{},{
    responsavel:String(identity_()||'').toLowerCase()
  });

  delete q.participante;
  const result=tasksCollectionV2_(q,'history');
  return Object.assign({},result,{tags:taskTagCatalog_()});
}

function personTasksV2_(q){
  const pessoaId=String(required_(q.pessoaId,'pessoa')).trim();
  getScopedPerson_(pessoaId);
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

function rankingData_(q){
  batchAll_([
    'Usuarios',
    'Sessoes',
    'Pessoas',
    'Tarefas',
    'Processos'
  ]);

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

  const rankBy=key=>{
    const ordered=rows.slice().sort((a,b)=>{
      const av=Number(a[key]||0);
      const bv=Number(b[key]||0);

      if(av!==bv){
        return bv-av;
      }

      return a.nome.localeCompare(
        b.nome,
        'pt-BR',
        {sensitivity:'base'}
      );
    });

    let last=null;
    let position=0;

    return new Map(
      ordered.map((row,index)=>{
        const value=Number(row[key]||0);

        if(last===null||value!==last){
          position=index+1;
        }

        last=value;
        return [row.email,position];
      })
    );
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
    a.nome.localeCompare(
      b.nome,
      'pt-BR',
      {sensitivity:'base'}
    )
  );

  return {
    de:from,
    ate:to,
    inicio:from,
    fim:to,
    totalUsuarios:rows.length,
    linhas:rows
  };
}

function distributionRanking_(q){
  distributionRankingAllowed_();
  return rankingData_(q);
}

function profileRanking_(q){
  q=q||{};

  const email=
    String(
      identity_()||
      ''
    ).toLowerCase();

  const explicitRange=
    !!(
      q.de||
      q.ate||
      q.inicio||
      q.fim
    );

  if(explicitRange){
    const data=
      rankingData_(q);

    const row=
      data.linhas.find(item=>
        String(item.email||'').toLowerCase()===
        email
      )||null;

    return {
      de:data.de,
      ate:data.ate,
      totalUsuarios:data.totalUsuarios,
      usuario:row,
      comparativo:null
    };
  }

  const today=
    Utilities.formatDate(
      new Date(),
      PDA.tz,
      'yyyy-MM-dd'
    );

  const parts=
    today
      .split('-')
      .map(Number);

  const year=parts[0];
  const month=parts[1];

  const pad_=value=>
    String(value)
      .padStart(2,'0');

  const currentStart=
    year+
    '-'+
    pad_(month)+
    '-01';

  let previousYear=year;
  let previousMonth=month-1;

  if(previousMonth<1){
    previousMonth=12;
    previousYear--;
  }

  const previousStart=
    previousYear+
    '-'+
    pad_(previousMonth)+
    '-01';

  const previousLastDay=
    new Date(
      Date.UTC(
        previousYear,
        previousMonth,
        0
      )
    ).getUTCDate();

  const previousEnd=
    previousYear+
    '-'+
    pad_(previousMonth)+
    '-'+
    pad_(previousLastDay);

  const current=
    rankingData_({
      de:currentStart,
      ate:today
    });

  const previous=
    rankingData_({
      de:previousStart,
      ate:previousEnd
    });

  const row=
    current.linhas.find(item=>
      String(item.email||'').toLowerCase()===
      email
    )||null;

  const prior=
    previous.linhas.find(item=>
      String(item.email||'').toLowerCase()===
      email
    )||null;

  const valueDelta_=(key)=>
    Number(
      row&&row[key]||
      0
    )-
    Number(
      prior&&prior[key]||
      0
    );

  /*
   * Delta positivo de posição significa evolução: 5º -> 3º = +2.
   */
  const rankDelta_=(key)=>{
    if(
      !row||
      !prior||
      !row[key]||
      !prior[key]
    ){
      return 0;
    }

    return (
      Number(prior[key])-
      Number(row[key])
    );
  };

  return {
    de:current.de,
    ate:current.ate,
    totalUsuarios:current.totalUsuarios,
    usuario:row,
    comparativo:{
      de:previous.de,
      ate:previous.ate,
      anterior:prior,
      evolucao:{
        cadastros:
          valueDelta_(
            'cadastros'
          ),
        tarefasConcluidas:
          valueDelta_(
            'tarefasConcluidas'
          ),
        processosDistribuidos:
          valueDelta_(
            'processosDistribuidos'
          ),
        rankCadastros:
          rankDelta_(
            'rankCadastros'
          ),
        rankTarefas:
          rankDelta_(
            'rankTarefas'
          ),
        rankProcessos:
          rankDelta_(
            'rankProcessos'
          )
      }
    }
  };
}

function uniqueRowsById_(rows){
  const seen=new Set();

  return (rows||[])
    .filter(row=>{
      if(
        !row||
        !row.id||
        seen.has(row.id)
      ){
        return false;
      }

      seen.add(row.id);
      return true;
    });
}

function personDeletePreview_(q){
  const person=
    getScopedPerson_(
      required_(
        q.id,
        'pessoa'
      )
    );

  const attendance=
    where_(
      'Atendimentos',
      'pessoaId',
      person.id
    );

  const tasks=
    where_(
      'Tarefas',
      'pessoaId',
      person.id
    );

  const processes=
    where_(
      'Processos',
      'pessoaId',
      person.id
    );

  const documents=[
    ...where_(
      'Documentos',
      'atendimentoId',
      personOwnerKey_(person.id)
    )
  ];

  attendance.forEach(row=>{
    documents.push(
      ...where_(
        'Documentos',
        'atendimentoId',
        row.id
      )
    );
  });

  const uniqueDocuments=
    uniqueRowsById_(
      documents
    );

  return {
    id:person.id,
    nome:person.nome,
    cpf:person.cpf,
    atendimentos:
      attendance.length,
    documentos:
      uniqueDocuments.length,
    tarefas:
      tasks.length,
    processos:
      processes.length,
    exigeConfirmacaoReforcada:
      !!(
        tasks.length||
        processes.length
      )
  };
}

function personFolderCandidates_(person){
  const out=[];
  const seen=new Set();

  const add_=folder=>{
    if(!folder)return;

    const id=
      folder.getId();

    if(seen.has(id)){
      return;
    }

    seen.add(id);
    out.push(folder);
  };

  /*
   * O folderId dos atendimentos é o caminho mais rápido e evita percorrer
   * todas as pastas da raiz do projeto.
   */
  where_(
    'Atendimentos',
    'pessoaId',
    person.id
  )
    .forEach(row=>{
      if(!row.folderId)return;

      try{
        add_(
          DriveApp.getFolderById(
            row.folderId
          )
        );
      }catch(e){}
    });

  const root=
    DriveApp.getFolderById(
      PDA.parent
    );

  const desired=
    safeName_(person.nome)+
    ' - '+
    cpfDisplay_(person.cpf);

  try{
    const exact=
      root.getFoldersByName(
        desired
      );

    while(exact.hasNext()){
      add_(
        exact.next()
      );
    }
  }catch(e){}

  return out;
}

function personDeleteCascade_(ctx,q){
  const person=
    getScopedPerson_(
      required_(
        q.id,
        'pessoa'
      )
    );

  if(!bool_(q.confirmar)){
    fail_(
      'Confirme explicitamente a exclusão definitiva do cadastro.'
    );
  }

  version_(
    person,
    q.versao
  );

  const preview=
    personDeletePreview_({
      id:person.id
    });

  if(
    preview.exigeConfirmacaoReforcada&&
    !bool_(q.confirmarVinculos)
  ){
    fail_(
      'Este cadastro possui processos ou tarefas. Confirme também a exclusão dos vínculos.'
    );
  }

  const attendance=
    where_(
      'Atendimentos',
      'pessoaId',
      person.id
    );

  const tasks=
    where_(
      'Tarefas',
      'pessoaId',
      person.id
    );

  const processes=
    where_(
      'Processos',
      'pessoaId',
      person.id
    );

  const documents=[
    ...where_(
      'Documentos',
      'atendimentoId',
      personOwnerKey_(person.id)
    )
  ];

  attendance.forEach(row=>{
    documents.push(
      ...where_(
        'Documentos',
        'atendimentoId',
        row.id
      )
    );
  });

  const uniqueDocuments=
    uniqueRowsById_(
      documents
    );

  const minutas=[];
  const pendencias=[];

  attendance.forEach(row=>{
    minutas.push(
      ...where_(
        'Minutas',
        'atendimentoId',
        row.id
      )
    );

    pendencias.push(
      ...where_(
        'Pendencias',
        'atendimentoId',
        row.id
      )
    );
  });

  const messages=[];
  const attachments=[];

  tasks.forEach(task=>{
    messages.push(
      ...where_(
        'TarefaMensagens',
        'tarefaId',
        task.id
      )
    );

    attachments.push(
      ...where_(
        'TarefaAnexos',
        'tarefaId',
        task.id
      )
    );
  });

  const distributions=[];

  attendance.forEach(row=>{
    distributions.push(
      ...where_(
        'Distribuicao',
        'atendimentoId',
        row.id
      )
    );
  });

  processes.forEach(row=>{
    distributions.push(
      ...where_(
        'Distribuicao',
        'processoId',
        row.id
      )
    );
  });

  const uniqueMinutas=
    uniqueRowsById_(
      minutas
    );

  const uniquePendencias=
    uniqueRowsById_(
      pendencias
    );

  const uniqueMessages=
    uniqueRowsById_(
      messages
    );

  const uniqueAttachments=
    uniqueRowsById_(
      attachments
    );

  const uniqueDistributions=
    uniqueRowsById_(
      distributions
    );

  const relatedIds=[
    person.id,
    ...attendance.map(row=>row.id),
    ...tasks.map(row=>row.id),
    ...processes.map(row=>row.id),
    ...uniqueDocuments.map(row=>row.id),
    ...uniqueMinutas.map(row=>row.id),
    ...uniquePendencias.map(row=>row.id),
    ...uniqueMessages.map(row=>row.id),
    ...uniqueAttachments.map(row=>row.id),
    ...uniqueDistributions.map(row=>row.id)
  ];

  const history=[];

  relatedIds.forEach(registroId=>{
    history.push(
      ...where_(
        'Historico',
        'registroId',
        registroId
      )
    );
  });

  const priorHistory=
    uniqueRowsById_(
      history
    );

  /*
   * Operações antigas não têm uma coluna pessoaId. Esta é a única relação
   * que ainda exige varredura textual, executada uma única vez.
   */
  const priorOperations=
    all_('Operacoes')
      .filter(row=>{
        const result=
          String(
            row.resultado||
            ''
          );

        return (
          result.includes(
            person.id
          )||
          (
            String(
              person.cpf||
              ''
            )&&
            result.includes(
              String(
                person.cpf
              )
            )
          )
        );
      });

  ctx.redactDeletionAudit=true;

  [
    [
      'TarefaMensagens',
      uniqueMessages
    ],
    [
      'TarefaAnexos',
      uniqueAttachments
    ],
    [
      'Tarefas',
      tasks
    ],
    [
      'Distribuicao',
      uniqueDistributions
    ],
    [
      'Processos',
      processes
    ],
    [
      'Minutas',
      uniqueMinutas
    ],
    [
      'Pendencias',
      uniquePendencias
    ],
    [
      'Documentos',
      uniqueDocuments
    ],
    [
      'Atendimentos',
      attendance
    ],
    [
      'Historico',
      priorHistory
    ],
    [
      'Operacoes',
      priorOperations
    ],
    [
      'Pessoas',
      [person]
    ]
  ].forEach(([entity,rows])=>{
    rows.forEach(row=>
      remove_(
        ctx,
        entity,
        row.id,
        row.versao
      )
    );
  });

  personFolderCandidates_(
    person
  )
    .forEach(folder=>{
      try{
        folder.setTrashed(true);

        ctx.effects.push(
          'Pasta da pessoa movida para a lixeira: '+
          folder.getName()
        );

      }catch(e){
        ctx.effects.push(
          'Não foi possível remover uma pasta vinculada ao cadastro: '+
          (e.message||e)
        );
      }
    });

  return {
    ok:true,
    excluidos:{
      pessoas:1,
      atendimentos:
        attendance.length,
      documentos:
        uniqueDocuments.length,
      tarefas:
        tasks.length,
      processos:
        processes.length
    },
    mensagem:
      'Cadastro e vínculos relacionados excluídos definitivamente.'
  };
}
