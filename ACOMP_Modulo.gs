function dossier_(q){
  const p=get_('Pessoas',q.pessoaId);
  const owner=personOwnerKey_(p.id);

  const docs=
    all_('Documentos')
      .filter(d=>
        d.atendimentoId===owner
      );

  const processos=
    all_('Processos')
      .filter(x=>
        x.pessoaId===p.id
      );

  const related=[
    p.id,
    ...docs.map(d=>d.id),
    ...processos.map(x=>x.id)
  ];

  return {
    pessoa:p,
    documentos:docs,
    documentosPessoa:docs,
    processos,
    historico:
      all_('Historico')
        .filter(h=>
          related.includes(
            h.registroId
          )
        ),

    /*
     * Campos legados vazios mantidos temporariamente para compatibilidade
     * com versões já publicadas durante a transição do modelo antigo.
     */
    atendimentos:[],
    pendencias:[],
    minutas:[],
    aptidao:[]
  };
}

function checkDoc_(ctx,q){
  const d=get_('Documentos',q.id);
  version_(d,q.versao);

  if(!bool_(d.vigente)){
    fail_('Versão anterior não pode receber conferência.');
  }

  const personId=
    personIdFromOwner_(
      d.atendimentoId
    );

  let a=null;

  if(!personId){
    a=get_('Atendimentos',d.atendimentoId);
    version_(a,q.atendimentoVersao);
  }

  const data=
    Object.assign({},d);

  [
    'conferido',
    'declaracaoTerceiro',
    'processoCompleto',
    'anexoPresente',
    'rogo',
    'testemunhas'
  ].forEach(k=>data[k]=bool_(q[k]));

  if(d.categoria==='RESIDENCIA'){
    date_(q.vencimento);
    data.vencimento=q.vencimento;
    data.terceiro=bool_(q.terceiro);
  }

  data.observacoes=
    String(q.observacoes||'');

  const result=
    change_(
      ctx,
      'Documentos',
      d.id,
      data,
      d.versao
    );

  if(personId){
    all_('Atendimentos')
      .filter(item=>item.pessoaId===personId)
      .forEach(item=>touch_(ctx,item));
  }else{
    touch_(ctx,a);
  }

  return result;
}

function pendSave_(ctx,q){
  const old=q.id?get_('Pendencias',q.id):null;
  const aid=old?old.atendimentoId:q.atendimentoId;
  const a=get_('Atendimentos',aid);

  version_(a,q.atendimentoVersao);
  required_(q.descricao,'descrição');

  if(!['ABERTA','RESOLVIDA'].includes(q.situacao)){
    fail_('Situação inválida.');
  }

  if(
    q.responsavel&&
    !all_('Usuarios').some(
      u=>
        u.email===q.responsavel&&
        bool_(u.ativo)
    )
  ){
    fail_('Responsável não autorizado.');
  }

  const r=
    change_(
      ctx,
      'Pendencias',
      q.id||id_('PEN',ctx.op),
      {
        atendimentoId:aid,
        descricao:q.descricao,
        responsavel:q.responsavel||'',
        situacao:q.situacao
      },
      q.versao
    );

  touch_(ctx,a);
  return r;
}

function checkAtend_(ctx,q){
  const a=get_('Atendimentos',q.id);
  version_(a,q.versao);

  const errors=eligibility_(a,true);

  if(errors.length){
    fail_(errors.join('\n'));
  }

  return change_(
    ctx,
    'Atendimentos',
    a.id,
    Object.assign(
      {},
      a,
      {
        situacao:'CONFERIDO',
        conferencia:
          ctx.email+
          ' — '+
          now_()
      }
    ),
    a.versao
  );
}
