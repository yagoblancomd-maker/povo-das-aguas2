const MODULES={
  PAINEL:'Painel',
  PESS:'Pessoas',
  ATEND:'Atendimentos',
  ACOMP:'Ficha e conferência',
  MIN:'Minutas',
  DIST:'Distribuição',
  PROC:'Processos',
  ADM:'Administração'
};

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
  authorize_(code==='ADM'?'administracao':'consulta');
  if(!MODULES[code])fail_('Módulo inválido.');

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
    bootstrap:()=>({
      email:identity_(),
      perfil:all_('Usuarios').find(u=>u.email===identity_()).perfil,
      config:cfg_(),
      modulos:MODULES,
      modelo:templateStatus_(),
      portalTransparencia:portalTransparenciaStatus_()
    }),
    pessoas:()=>personSearch_(q),
    pessoa:()=>get_('Pessoas',q.id),
    atendimentos:()=>all_('Atendimentos'),
    ficha:()=>dossier_(q),
    painel:()=>dashboard_(),
    admin:()=>({
      configuracoes:all_('Configuracoes'),
      usuarios:all_('Usuarios'),
      perfis:Object.keys(ROLES),
      modelo:templateStatus_(),
      portalTransparencia:portalTransparenciaStatus_()
    }),
    aptidao:()=>eligibility_(get_('Atendimentos',q.id),true),
    seguroDefesoConsultar:()=>seguroDefesoConsultar_(q),
    cepConsultar:()=>cepConsultaViaCep_(q)
  };

  const mutations={
    pessoaSalvar:['cadastro',personSave_],
    pessoaUpload:['cadastro',personUpload_],
    pessoaDocumentoExcluir:['retificacao',personDocumentDelete_],
    pessoaFinalizarCadastro:['cadastro',personFinalize_],
    atendimentoSalvar:['cadastro',atendSave_],
    upload:['cadastro',upload_],
    encaminhar:['cadastro',forward_],
    documentoConferir:['conferencia',checkDoc_],
    pendenciaSalvar:['retificacao',pendSave_],
    atendimentoConferir:['conferencia',checkAtend_],
    minutaGerar:['minuta',generate_],
    minutaRevisar:['minuta',reviewMin_],
    modeloUpload:['administracao',modelUpload_],
    portalApiKeySalvar:['administracao',portalApiKeySave_],
    seguroDefesoRelatorioGerar:['cadastro',seguroDefesoRelatorioGerar_],
    configSalvar:['administracao',adminSave_],
    usuarioSalvar:['administracao',userSave_]
  };

  if(reads[action]){
    authorize_(action==='admin'?'administracao':'consulta');
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
