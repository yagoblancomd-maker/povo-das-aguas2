const MODULES={
  PAINEL:'Painel',
  PESS:'Novo Cadastro',
  ACOMP:'Consultar Cadastros',
  DEFESO:'Consultar Defeso 2025',
  MIN:'Minutas',
  DIST:'Distribuição',
  PROC:'Processos',
  ADM:'Administração'
};

const MODULE_PERMISSION=Object.freeze({
  PAINEL:'consulta',
  PESS:'cadastro',
  ACOMP:'consulta',
  DEFESO:'consulta',
  MIN:'minuta',
  DIST:'minuta',
  PROC:'consulta',
  ADM:'administracao'
});

const PROFILE_HOME=Object.freeze({
  CONSULTA:'PAINEL',
  CADASTRO:'PESS',
  CONFERENCIA:'ACOMP',
  JURIDICO:'MIN',
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

function doGet(){
  authorize_('consulta');
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle(PDA.name)
    .addMetaTag('viewport','width=device-width, initial-scale=1');
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
      deepseek:deepseekStatus_()
    }),
    seguroDefesoConsultar:()=>seguroDefesoConsultar_(q),
    cepConsultar:()=>cepConsultaViaCep_(q),
    documentosImportar:()=>deepseekDocumentImport_(q)
  };

  const mutations={
    pessoaSalvar:['cadastro',personSave_],
    pessoaRetificar:['retificacao',personSave_],
    pessoaUpload:['cadastro',personUpload_],
    pessoaDocumentoExcluir:['retificacao',personDocumentDelete_],
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
    usuariosAcessosGoogleSincronizar:['administracao',syncAllGoogleResources_]
  };

  if(reads[action]){
    const readPermission=
      action==='admin'
        ?'administracao'
        :action==='documentosImportar'
          ?'cadastro'
          :'consulta';

    authorize_(readPermission);
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
