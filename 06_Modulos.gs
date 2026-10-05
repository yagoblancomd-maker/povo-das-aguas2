const MODULES={
  PAINEL:'Início',
  PESS:'Novo Cadastro',
  ACOMP:'Consultar Cadastros',
  DEFESO:'Consultar Defeso 2025',
  TAREFAS:'Tarefas',
  MIN:'Minutas',
  DIST:'Atribuir tarefas',
  PROC:'Processos',
  ADM:'Administração'
};

const MODULE_PERMISSION=Object.freeze({
  PAINEL:'consulta',
  PESS:'cadastro',
  ACOMP:'consulta',
  DEFESO:'consulta',
  TAREFAS:'distribuicao',
  MIN:'minuta',
  DIST:'gestao_distribuicao',
  PROC:'consulta',
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

function accessErrorPage_(email,message){
  const safeEmail=String(email||'Conta não identificada')
    .replace(/[&<>"']/g,ch=>({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    })[ch]);

  const safeMessage=String(message||'Acesso não autorizado.')
    .replace(/[&<>"']/g,ch=>({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    })[ch]);

  return HtmlService
    .createHtmlOutput(
      '<!doctype html>'+
      '<html><head><meta charset="utf-8">'+
      '<meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<title>Povo das Águas — Acesso</title>'+
      '<style>'+
      'body{margin:0;font-family:Arial,sans-serif;background:#eef6f7;color:#173d50;display:grid;place-items:center;min-height:100vh;padding:20px;box-sizing:border-box}'+
      '.box{width:min(620px,100%);background:#fff;border:1px solid #c8dce1;border-radius:14px;padding:24px;box-shadow:0 16px 44px rgba(15,48,70,.14)}'+
      'h1{font-size:22px;margin:0 0 8px}'+
      'p{line-height:1.45;margin:8px 0}'+
      '.account{padding:10px 12px;background:#eef7f8;border-radius:8px;font-weight:700}'+
      '.error{margin-top:12px;padding:10px 12px;border-left:4px solid #c84232;background:#fff3f1;color:#7d3028}'+
      '.hint{color:#5e747e;font-size:13px}'+
      '</style></head><body><main class="box">'+
      '<h1>Não foi possível abrir o Povo das Águas</h1>'+
      '<p>Conta Google utilizada nesta execução:</p>'+
      '<div class="account">'+safeEmail+'</div>'+
      '<div class="error">'+safeMessage+'</div>'+
      '<p class="hint">Confirme se esta é exatamente a conta Google que você pretende utilizar no projeto.</p>'+
      '</main></body></html>'
    )
    .setTitle(
      PDA.name+' — Acesso'
    )
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1'
    );
}

function selfRegistrationLandingPage_(email,reason){
  const template=
    HtmlService.createTemplateFromFile(
      'CadastroUsuario'
    );

  const returnUrl=
    ScriptApp
      .getService()
      .getUrl()||
    '';

  const gateway=
    selfRegistrationGatewayUrl_();

  template.email=
    String(email||'')
      .trim()
      .toLowerCase();

  template.gatewayUrl=
    gateway;

  template.returnUrl=
    returnUrl;

  template.registrationToken=
    email&&gateway
      ?selfRegistrationToken_(
          email,
          returnUrl
        )
      :'';

  template.reason=
    String(reason||'');

  template.gatewayConfigured=
    !!(
      gateway&&
      selfRegistrationStatus_().configurada
    );

  return template
    .evaluate()
    .setTitle(
      'Povo das Águas — Primeiro acesso'
    )
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1'
    );
}

function selfRegistrationSuccessPage_(result){
  const safeName=String(
    result.nome||
    ''
  ).replace(/[&<>"']/g,ch=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[ch]);

  const safeEmail=String(
    result.email||
    ''
  ).replace(/[&<>"']/g,ch=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[ch]);

  const safeSummary=String(
    result.resumoAcesso||
    (
      Array.isArray(result.permissoes)
        ?'Permissões concedidas: '+result.permissoes.join(', ')+'.'
        :'Seu acesso foi configurado conforme sua função no projeto.'
    )
  ).replace(/[&<>"']/g,ch=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[ch]);

  const returnUrl=String(
    result.returnUrl||
    ''
  );

  const safeReturn=
    /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(
      returnUrl
    )
      ?returnUrl
      :'';

  return HtmlService
    .createHtmlOutput(
      '<!doctype html><html lang="pt-BR"><head>'+
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<title>Povo das Águas — Acesso criado</title>'+
      '<style>'+
      '*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#143c50;background:radial-gradient(circle at 10% 10%,rgba(57,167,178,.18),transparent 28%),linear-gradient(145deg,#062f43,#0b6874 58%,#0b8590)}'+
      '.card{width:min(650px,100%);padding:30px;border:1px solid rgba(255,255,255,.36);border-radius:22px;background:rgba(255,255,255,.96);box-shadow:0 28px 80px rgba(2,25,36,.32);text-align:center}'+
      '.check{display:grid;place-items:center;width:72px;height:72px;margin:0 auto 16px;border-radius:50%;color:#fff;background:linear-gradient(145deg,#0a7d89,#1494a0);font-size:34px;box-shadow:0 12px 30px rgba(10,125,137,.25)}'+
      'h1{margin:0 0 8px;font-size:28px;letter-spacing:-.03em}p{line-height:1.5;color:#5b7480}.user{margin:18px 0;padding:14px;border-radius:13px;background:#eef7f8}.user strong{display:block;color:#123f52}.button{display:inline-block;margin-top:8px;padding:11px 18px;border-radius:11px;color:#fff;text-decoration:none;font-weight:750;background:linear-gradient(145deg,#0a7d89,#086572);box-shadow:0 8px 18px rgba(8,101,114,.22)}'+
      '</style></head><body><main class="card">'+
      '<div class="check">✓</div>'+
      '<h1>Acesso criado com sucesso</h1>'+
      '<p>Seu perfil inicial foi criado automaticamente conforme sua função no projeto.</p>'+
      '<div class="user"><strong>'+safeName+'</strong><span>'+safeEmail+'</span></div>'+
      '<p>'+safeSummary+'</p>'+
      (
        safeReturn
          ?'<a class="button" href="'+safeReturn+'">Entrar no Povo das Águas</a>'
          :'<p>Volte à aba original do Povo das Águas e atualize a página.</p>'
      )+
      '</main></body></html>'
    );
}

function selfRegistrationFailurePage_(message,returnUrl){
  const safeMessage=String(
    message||
    'Não foi possível concluir o autocadastro.'
  ).replace(/[&<>"']/g,ch=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[ch]);

  const safeReturn=
    /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(
      String(returnUrl||'')
    )
      ?String(returnUrl)
      :'';

  return HtmlService
    .createHtmlOutput(
      '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
      '<meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<title>Povo das Águas — Autocadastro</title>'+
      '<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#163f52;background:#eef6f7}.card{width:min(650px,100%);padding:28px;border:1px solid #c6dce1;border-radius:18px;background:#fff;box-shadow:0 20px 60px rgba(15,48,70,.16)}h1{margin:0 0 10px}.error{padding:12px 14px;border-left:4px solid #bb483e;border-radius:8px;background:#fff1ef;color:#7c3029}.button{display:inline-block;margin-top:14px;padding:10px 15px;border-radius:9px;color:#fff;text-decoration:none;font-weight:700;background:#0b7480}</style>'+
      '</head><body><main class="card"><h1>Não foi possível concluir o acesso</h1><div class="error">'+safeMessage+'</div>'+
      (
        safeReturn
          ?'<a class="button" href="'+safeReturn+'">Voltar ao primeiro acesso</a>'
          :''
      )+
      '</main></body></html>'
    );
}

function doGet(e){
  const params=
    e&&e.parameter
      ?e.parameter
      :{};

  if(
    String(
      params.mode||
      ''
    )==='activate'
  ){
    let returnUrl='';

    try{
      const signed=
        selfRegistrationTokenRead_(
          params.token
        );

      returnUrl=
        signed.returnUrl;

      const result=
        selfRegisterUser_(
          params.token,
          params.nome,
          params.funcao
        );

      return selfRegistrationSuccessPage_(
        result
      );

    }catch(error){
      return selfRegistrationFailurePage_(
        error.message||String(error),
        returnUrl
      );
    }
  }

  const email=
    currentGoogleEmail_();

  if(!email){
    return selfRegistrationLandingPage_(
      '',
      'Não foi possível identificar a Conta Google desta execução. Verifique se a implantação principal está configurada para executar como "Usuário que acessa o app".'
    );
  }

  try{
    authorize_('consulta');

    return HtmlService
      .createTemplateFromFile('Index')
      .evaluate()
      .setTitle(PDA.name)
      .addMetaTag(
        'viewport',
        'width=device-width, initial-scale=1'
      );

  }catch(error){
    /*
     * Uma conta ainda não cadastrada pode não ter qualquer acesso ao Drive.
     * Por isso a página de primeiro acesso não depende da planilha principal.
     */
    return selfRegistrationLandingPage_(
      email,
      error.message||String(error)
    );
  }
}

function include_(name){
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function carregarModulo(code){
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

function api(action,q){
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

      return {
        email:user.email,
        usuario:{
          id:user.id,
          nome:user.nome||'',
          funcao:user.funcao||'',
          email:user.email,
          perfil:user.perfil
        },
        perfil:user.perfil,
        permissoes:effectivePermissions_(user),
        config:cfg_(),
        modulos:availableModules_(user),
        home:homeModule_(user),
        modelo:templateStatus_(),
        portalTransparencia:portalTransparenciaStatus_(),
        deepseek:deepseekStatus_()
      };
    },
    pessoas:()=>personSearch_(q),
    pessoa:()=>get_('Pessoas',q.id),
    ficha:()=>dossier_(q),
    painel:()=>dashboard_(),
    distribuicaoFila:()=>distributionQueue_(),
    tarefasMinhas:()=>myDistributionTasks_(),
    tarefaDistribuicaoDetalhe:()=>distributionTaskDetail_(q),
    processos:()=>processList_(),
    admin:()=>({
      configuracoes:all_('Configuracoes'),
      usuarios:all_('Usuarios').map(u=>
        Object.assign(
          {},
          u,
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
      autocadastro:selfRegistrationStatus_()
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
    autocadastroGatewaySalvar:['administracao',autoCadastroGatewaySave_],
    tarefaDistribuicaoAtribuir:['gestao_distribuicao',distributionTaskAssign_],
    tarefaDistribuicaoConcluir:['distribuicao',completeDistributionTask_],
    tarefaDocumentosZipGerar:['distribuicao',distributionDocumentsZip_],
    tarefasDistribuicaoReconciliar:['gestao_distribuicao',reconcileDistributionTasks_]
  };

  if(reads[action]){
    const readPermissions={
      admin:'administracao',
      documentosImportar:'cadastro',
      distribuicaoFila:'gestao_distribuicao',
      tarefasMinhas:'distribuicao',
      tarefaDistribuicaoDetalhe:'distribuicao'
    };

    authorize_(
      readPermissions[action]||
      'consulta'
    );
    return lock_(()=>{
      resetData_();
      atualizarJurisdicoes_();
      return reads[action]();
    });
  }

  if(!mutations[action])fail_('Operação desconhecida.');

  return lock_(()=>{
    resetData_();

    const email=authorize_(mutations[action][0]);
    atualizarJurisdicoes_();

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
    const previous=all_('Operacoes').find(r=>r.id===op);

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
