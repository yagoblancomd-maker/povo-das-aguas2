const MODULES={
  PAINEL:'Início',
  PESS:'Novo Cadastro',
  ACOMP:'Consultar Cadastros',
  DEFESO:'Consultar Defeso 2025',
  HIST:'Histórico',
  TAREFAS:'Tarefas',
  MIN:'Minutas',
  DIST:'Atribuir tarefas',
  PROC:'Processos',
  PERF:'Meu perfil',
  ADM:'Administração'
};

const MODULE_PERMISSION=Object.freeze({
  PAINEL:'consulta',
  PESS:'cadastro',
  ACOMP:'consulta',
  DEFESO:'consulta',
  HIST:'consulta',
  TAREFAS:'consulta',
  MIN:'minuta',
  DIST:'gestao_distribuicao',
  PROC:'consulta',
  PERF:'consulta',
  ADM:'administracao'
});

const PROFILE_HOME=Object.freeze({
  CONSULTA:'PAINEL',
  NOVO_USUARIO:'PAINEL',
  PROFESSOR_RESIDENTE:'PAINEL',
  COLABORADOR:'PAINEL',
  ALUNO:'PAINEL',
  CADASTRO:'PAINEL',
  CONFERENCIA:'PAINEL',
  JURIDICO:'PAINEL',
  ADMIN:'PAINEL'
});

function availableModules_(user){
  const allowed={};

  Object.entries(MODULES)
    .forEach(([code,label])=>{
      const permission=
        MODULE_PERMISSION[code]||
        'consulta';

      if(
        hasPermission_(
          user,
          permission
        )
      ){
        allowed[code]=label;
      }
    });

  return allowed;
}

function homeModule_(user){
  const available=
    availableModules_(user);

  const preferred=
    PROFILE_HOME[user.perfil]||
    'PAINEL';

  if(available[preferred]){
    return preferred;
  }

  return (
    Object.keys(available)[0]||
    'PAINEL'
  );
}

function doGet(e){
  const template=
    HtmlService.createTemplateFromFile(
      'Index'
    );

  const authBootstrap=
    authPageBootstrap_(e);

  template.authBootstrapJson=
    JSON.stringify(
      authBootstrap
    ).replace(
      /</g,
      '\\u003c'
    );

  template.authView=
    include_(
      'AUTH_View'
    ).replace(
      '<!--PDA_AUTH_LOGO-->',
      include_(
        'Logo'
      )
    );

  return template
    .evaluate()
    .setTitle(PDA.name)
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1'
    );
}

function include_(name){
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function carregarModulo_(code){
  if(!MODULES[code])fail_('Módulo inválido.');

  authorize_(
    MODULE_PERMISSION[code]||
    'consulta'
  );

  return {
    view:include_(code+'_View'),
    style:include_(code+'_Style'),
    script:include_(code+'_Script')
  };
}

function carregarModulo(code,sessionToken){
  return withAuthSession_(
    sessionToken,
    ()=>carregarModulo_(code)
  );
}

/**
 * Pré-carrega vários módulos em uma única viagem ao Apps Script.
 * Só devolve módulos efetivamente permitidos ao usuário autenticado.
 */
function carregarModulos(codes,sessionToken){
  return withAuthSession_(
    sessionToken,
    ()=>{
      const allowed=availableModules_(activeUser_());
      const unique=[
        ...new Set(
          (Array.isArray(codes)?codes:[])
            .map(code=>String(code||'').trim())
            .filter(Boolean)
        )
      ].slice(0,Object.keys(MODULES).length);

      return unique.reduce((out,code)=>{
        if(
          MODULES[code]&&
          Object.prototype.hasOwnProperty.call(
            allowed,
            code
          )
        ){
          out[code]=carregarModulo_(code);
        }
        return out;
      },{});
    }
  );
}


/**
 * Pré-carrega apenas os dados iniciais dos módulos em uma execução única.
 * Os bundles são carregados antes por carregarModulos(), para que HTML/CSS/JS
 * cheguem ao navegador o quanto antes e não aguardem consultas ao Sheets.
 */
function aquecerDadosModulos(codes,sessionToken){
  return withAuthSession_(
    sessionToken,
    ()=>{
      resetData_();

      const user=activeUser_();
      const allowed=availableModules_(user);
      const unique=[
        ...new Set(
          (Array.isArray(codes)?codes:[])
            .map(code=>String(code||'').trim())
            .filter(code=>
              MODULES[code]&&
              Object.prototype.hasOwnProperty.call(
                allowed,
                code
              )
            )
        )
      ].slice(0,Object.keys(MODULES).length);

      const data={};

      const producers={
        PAINEL:[
          'painel',
          {},
          ()=>dashboard_()
        ],
        TAREFAS:[
          'tarefasMinhasAbertas',
          {},
          ()=>myTasksOpenV2_({})
        ],
        DIST:[
          'tarefasAbertasGestao',
          {},
          ()=>tasksManagementOpenV2_({})
        ],
        PROC:[
          'processos',
          {},
          ()=>processList_()
        ],
        ADM:[
          'adminUsuarios',
          {},
          ()=>adminUsersData_()
        ]
      };

      unique.forEach(code=>{
        const spec=producers[code];

        if(!spec)return;

        const action=spec[0];
        const query=spec[1];

        data[code]={
          action,
          query,
          result:
            serverCachedRead_(
              action,
              query,
              spec[2]
            )
        };
      });

      return {
        data,
        preparadoEm:now_()
      };
    }
  );
}

/**
 * Mantido como compatibilidade para clientes antigos. Novos clientes usam
 * carregarModulos() primeiro e aquecerDadosModulos() em seguida.
 */
function aquecerAplicacao(codes,sessionToken){
  return withAuthSession_(
    sessionToken,
    ()=>{
      const allowed=availableModules_(activeUser_());
      const unique=[
        ...new Set(
          (Array.isArray(codes)?codes:[])
            .map(code=>String(code||'').trim())
            .filter(code=>
              MODULES[code]&&
              Object.prototype.hasOwnProperty.call(
                allowed,
                code
              )
            )
        )
      ];

      const modules={};

      unique.forEach(code=>{
        modules[code]={
          view:include_(code+'_View'),
          style:include_(code+'_Style'),
          script:include_(code+'_Script')
        };
      });

      return {
        modules,
        data:{},
        preparadoEm:now_()
      };
    }
  );
}

const SERVER_CACHEABLE_READS=new Set([
  'painel',
  'tarefasMinhas',
  'distribuicaoFila',
  'processos',
  'admin',
  'adminUsuarios',
  'adminTags',
  'adminIntegracoes',
  'adminConfiguracoes',
  'tarefasAbertasGestao',
  'tarefasMinhasAbertas',
  'tarefasHistorico',
  'tarefasMinhasHistorico',
  'tarefasPessoa',
  'tarefasTags',
  'distribuicaoRanking',
  'perfilRanking',
  'pessoasLeve',
  'pessoaResumo',
  'pessoaFichaMeta',
  'pessoaFichaCargaInicial',
  'pessoaDocumentos',
  'pessoaProcessos',
  'pessoaAtendimentos',
  'pessoaHistorico',
  'historicoGeral',
  'tarefaCriarOpcoes'
]);

function serverCachedRead_(action,q,producer){
  if(
    !SERVER_CACHEABLE_READS.has(action)||
    typeof CacheService==='undefined'
  ){
    return producer();
  }

  const revision=
    props_().getProperty(
      'PDA_DATA_REVISION'
    )||
    '0';

  const key=
    'PDA_READ_'+
    hash_({
      revision,
      action,
      q:q||{},
      email:identity_()
    }).slice(0,48);

  const cache=
    CacheService.getScriptCache();

  try{
    const hit=cache.get(key);

    if(hit!==null){
      return JSON.parse(hit);
    }
  }catch(e){}

  const result=producer();

  try{
    const json=JSON.stringify(result);

    if(json.length<90000){
      cache.put(
        key,
        json,
        60
      );
    }
  }catch(e){}

  return result;
}

function apiAuthenticated_(action,q,sessionToken){
  resetData_();
  q=q||{};

  Object.keys(q).forEach(k=>{
    if(k!=='base64'&&typeof q[k]==='string'&&q[k].length>6000){
      fail_('Campo muito longo: '+k);
    }
  });

  const reads={
    bootstrap:()=>{
      const user=activeUser_();
      const home=homeModule_(user);
      const light=bool_(q.light);
      const initialData=
        !light&&home==='PAINEL'
          ?{
              action:'painel',
              query:{},
              result:dashboard_()
            }
          :null;

      return {
        email:user.email,
        usuario:authPublicUser_(user),
        perfil:user.perfil,
        permissoes:effectivePermissions_(user),
        config:cfg_(),
        modulos:availableModules_(user),
        home,
        initialModule:
          light
            ?null
            :{
                code:home,
                bundle:carregarModulo_(home)
              },
        initialData,
        modelo:templateStatus_(),
        portalTransparencia:portalTransparenciaStatus_(),
        deepseek:deepseekStatus_()
      };
    },
    pessoas:()=>personSearch_(q),
    pessoasLeve:()=>personListLite_(q),
    pessoa:()=>get_('Pessoas',q.id),
    pessoaResumo:()=>personQuickSummary_(q),
    pessoaFichaMeta:()=>personFichaMeta_(q),
    pessoaFichaCargaInicial:()=>personDrawerInitial_(q),
    pessoaDocumentos:()=>personDocumentsPage_(q),
    documentoConteudo:()=>personDocumentContent_(q),
    pessoaProcessos:()=>personProcessesPage_(q),
    pessoaAtendimentos:()=>personAttendancesPage_(q),
    pessoaHistorico:()=>personHistoryPage_(q),
    historicoGeral:()=>globalHistory_(q),
    tarefaCriarOpcoes:()=>taskCreateOptions_(),
    ficha:()=>dossier_(q),
    painel:()=>dashboard_(),
    distribuicaoFila:()=>distributionQueue_(),
    tarefasMinhas:()=>myTasks_(),
    tarefasAbertasGestao:()=>tasksManagementOpenV2_(q),
    tarefasHistorico:()=>tasksHistoryV2_(q),
    tarefasMinhasAbertas:()=>myTasksOpenV2_(q),
    tarefasMinhasHistorico:()=>myTasksHistoryV2_(q),
    tarefasPessoa:()=>personTasksV2_(q),
    tarefasTags:()=>({tags:taskTagCatalog_()}),
    distribuicaoRanking:()=>distributionRanking_(q),
    perfilRanking:()=>profileRanking_(q),
    pessoaExcluirPreview:()=>personDeletePreview_(q),
    tarefaDistribuicaoDetalhe:()=>distributionTaskDetail_(q),
    tarefaGeralDetalhe:()=>generalTaskDetail_(q),
    tarefaGeralAnexoConteudo:()=>generalTaskAttachmentContent_(q),
    notificacoesTarefas:()=>taskNotifications_(),
    processos:()=>processList_(),
    adminUsuarios:()=>adminUsersData_(),
    adminTags:()=>adminTagsData_(),
    adminIntegracoes:()=>adminIntegrationsData_(),
    adminConfiguracoes:()=>adminConfigData_(),
    admin:()=>({
      configuracoes:all_('Configuracoes'),
      usuarios:all_('Usuarios').map(u=>
        Object.assign(
          {},
          authPublicUser_(u),
          {
            permissoesEfetivas:
              effectivePermissions_(u)
          }
        )
      ),
      perfis:Object.keys(ROLES),
      perfisDetalhes:Object.fromEntries(
        Object.keys(ROLES).map(perfil=>[
          perfil,
          {
            descricao:ROLE_DESCRIPTIONS[perfil]||'',
            permissoes:rolePermissions_(perfil)
          }
        ])
      ),
      permissoes:Object.entries(PERMISSIONS).map(
        ([key,value])=>({
          key,
          label:value.label,
          descricao:value.descricao
        })
      ),
      modelo:templateStatus_(),
      portalTransparencia:portalTransparenciaStatus_(),
      deepseek:deepseekStatus_(),
      tagsTarefas:taskTagAdminList_()
    }),
    seguroDefesoConsultar:()=>seguroDefesoConsultar_(q),
    cepConsultar:()=>cepConsultaViaCep_(q),
    documentosImportar:()=>deepseekDocumentImport_(q)
  };

  const mutations={
    pessoaSalvar:['cadastro',personSave_],
    pessoaRetificar:['consulta',personRetify_],
    pessoaUpload:['cadastro',personUpload_],
    pessoaDocumentoExcluir:['consulta',personDocumentDelete_],
    pessoaFinalizarCadastro:['cadastro',personFinalize_],
    pessoaInicialGerar:['cadastro',personInitialGenerate_],
    minutaInicialGerar:['minuta',personInitialGenerate_],
    upload:['cadastro',upload_],
    documentoConferir:['conferencia',checkDoc_],
    modeloUpload:['administracao',modelUpload_],
    portalApiKeySalvar:['administracao',portalApiKeySave_],
    deepseekApiKeySalvar:['administracao',deepseekApiKeySave_],
    seguroDefesoRelatorioGerar:['cadastro',seguroDefesoRelatorioGerar_],
    configSalvar:['administracao',adminSave_],
    usuarioSalvar:['administracao',userSave_],
    usuarioAprovarProfessorResidente:['administracao',userApproveProfessorResident_],
    usuarioExcluir:['administracao',userDelete_],
    usuariosAcessosGoogleSincronizar:['administracao',syncAllGoogleResources_],
    tarefaDistribuicaoAtribuir:['gestao_distribuicao',distributionTaskAssign_],
    tarefaDistribuicaoConcluir:['distribuicao',completeDistributionTask_],
    tarefaDocumentosZipGerar:['distribuicao',distributionDocumentsZip_],
    tarefasDistribuicaoReconciliar:['gestao_distribuicao',reconcileDistributionTasks_],
    tarefaGeralCriar:['gestao_distribuicao',generalTaskCreate_],
    tarefaGeralReatribuir:['consulta',generalTaskAssign_],
    tarefaGeralConcluir:['consulta',generalTaskComplete_],
    tarefaGeralReabrir:['consulta',generalTaskReopen_],
    tarefaGeralMensagemEnviar:['consulta',generalTaskMessageSend_],
    tarefaGeralAnexoAdicionar:['consulta',generalTaskAttachmentAdd_],
    tarefaMarcarVista:['consulta',taskViewMark_],
    notificacoesTarefasMarcarLidas:['consulta',taskNotificationsMarkSeen_],
    distribuicaoAutomaticaSalvar:['gestao_distribuicao',distributionAutoSave_],
    distribuicaoAutomaticaExecutar:['gestao_distribuicao',distributionAutoRun_],
    tarefaTagSalvar:['administracao',taskTagSave_],
    tarefaTagExcluir:['administracao',taskTagDelete_],
    pessoaExcluirDefinitivo:['administracao',personDeleteCascade_]
  };

  if(reads[action]){
    const readPermissions={
      admin:'administracao',
      adminUsuarios:'administracao',
      adminTags:'administracao',
      adminIntegracoes:'administracao',
      adminConfiguracoes:'administracao',
      documentosImportar:'cadastro',
      distribuicaoFila:'gestao_distribuicao',
      tarefasMinhas:'consulta',
      tarefasAbertasGestao:'gestao_distribuicao',
      tarefasHistorico:'gestao_distribuicao',
      tarefasMinhasAbertas:'consulta',
      tarefasMinhasHistorico:'consulta',
      tarefasPessoa:'consulta',
      tarefasTags:'consulta',
      distribuicaoRanking:'gestao_distribuicao',
      perfilRanking:'consulta',
      tarefaCriarOpcoes:'gestao_distribuicao',
      pessoaExcluirPreview:'administracao',
      tarefaDistribuicaoDetalhe:'distribuicao',
      tarefaGeralDetalhe:'consulta',
      tarefaGeralAnexoConteudo:'consulta',
      notificacoesTarefas:'consulta'
    };

    authorize_(
      readPermissions[action]||
      'consulta'
    );

    /*
     * Leituras não precisam ocupar o ScriptLock global. A sessão já foi
     * validada por withAuthSession_ e as mutações continuam revalidando o
     * usuário dentro de lock_ antes de gravar.
     */
    resetData_();

    if(action==='bootstrap'){
      atualizarJurisdicoesSeNecessario_();
      resetData_();
    }

    return serverCachedRead_(
      action,
      q,
      reads[action]
    );
  }

  if(!mutations[action])fail_('Operação desconhecida.');

  return lock_(()=>{
    /*
     * Revalida a sessão dentro do mesmo lock da escrita. Assim uma sessão
     * revogada/desativada enquanto aguardava o lock não consegue gravar.
     */
    if(sessionToken){
      const fresh=
        authSessionRead_(
          sessionToken
        );

      if(
        String(fresh.email||'').toLowerCase()!==
        String(identity_()||'').toLowerCase()
      ){
        fail_(
          'AUTH: sua sessão mudou. Entre novamente.'
        );
      }
    }

    resetData_();

    const email=authorize_(mutations[action][0]);

    if(!/^[a-zA-Z0-9_-]{16,100}$/.test(q.op||'')){
      fail_('Identificador de operação inválido.');
    }

    const op=id_('OP',email+':'+q.op);
    const payload=clone_(q);
    delete payload.op;

    if(payload.base64){
      payload.contentHash=hash_(payload.base64);
      delete payload.base64;
    }

    const digest=hash_({action,payload});
    const previous=
      findById_(
        'Operacoes',
        op
      );

    if(previous){
      if(previous.hash!==digest)fail_('Operação já utilizada com conteúdo diferente.');
      return JSON.parse(previous.resultado);
    }

    const ctx={email,op,hash:digest,changes:[],effects:[]};

    try{
      const result=mutations[action][1](ctx,q);
      return commit_(ctx,result);
    }catch(e){
      if(ctx.effects.length){
        fail_(
          e.message+
          '\nEfeitos no Drive: '+ctx.effects.join('; ')+
          '\nRegistro transacional não confirmado. Repita a mesma operação para reconciliar.'
        );
      }
      throw e;
    }
  });
}


function api(action,q,sessionToken){
  return withAuthSession_(
    sessionToken,
    ()=>apiAuthenticated_(
      action,
      q,
      sessionToken
    )
  );
}

