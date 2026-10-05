function dossier_(q){
  const p=get_('Pessoas',q.pessoaId);
  const ats=all_('Atendimentos').filter(a=>a.pessoaId===p.id);
  const ids=ats.map(a=>a.id);
  const owner=personOwnerKey_(p.id);

  const docs=all_('Documentos').filter(d=>
    ids.includes(d.atendimentoId)||
    d.atendimentoId===owner
  );

  let activeTemplate=null;

  try{
    activeTemplate=activeTemplate_();
  }catch(e){
    activeTemplate=null;
  }

  const mins=
    all_('Minutas')
      .filter(d=>ids.includes(d.atendimentoId))
      .map(m=>{
        const a=ats.find(item=>item.id===m.atendimentoId);

        const stale=
          !activeTemplate||
          m.snapshot!==snapshot_(a,p)||
          activeTemplate.getId()!==m.templateId||
          String(activeTemplate.getLastUpdated().getTime())!==m.templateModified;

        return Object.assign({},m,{desatualizada:stale});
      });

  const related=[p.id].concat(
    ids,
    docs.map(d=>d.id),
    mins.map(m=>m.id)
  );

  const pend=
    all_('Pendencias')
      .filter(d=>ids.includes(d.atendimentoId));

  pend.forEach(x=>related.push(x.id));

  return {
    pessoa:p,
    atendimentos:ats,
    documentos:docs,
    documentosPessoa:
      docs.filter(d=>d.atendimentoId===owner),
    pendencias:pend,
    minutas:mins,
    historico:
      all_('Historico')
        .filter(h=>related.includes(h.registroId)),
    processos:
      all_('Processos')
        .filter(x=>x.pessoaId===p.id),
    aptidao:
      ats.map(a=>({
        id:a.id,
        pendencias:eligibility_(a,true)
      }))
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
