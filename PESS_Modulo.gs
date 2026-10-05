function personSave_(ctx,q){
  const before=q.id?get_('Pessoas',q.id):null;

  if(before)authorize_('retificacao');

  const c=cfg_();
  const p=validatePerson_(q,c,c.rascunhos!=='PERMITIR');

  const other=all_('Pessoas').find(r=>r.cpf===p.cpf&&r.id!==q.id);
  if(other)fail_('CPF já cadastrado. Abra a pessoa existente: '+other.id);

  const saved=change_(ctx,'Pessoas',q.id||id_('PES',ctx.op),p,q.versao);
  const folder=personFolder_(saved);

  ctx.effects.push('Pasta da pessoa preservada no Drive: '+folder.getUrl());

  if(before){
    all_('Atendimentos')
      .filter(a=>a.pessoaId===before.id)
      .forEach(a=>touch_(ctx,a));
  }

  return Object.assign({},saved,{
    folderId:folder.getId(),
    folderUrl:folder.getUrl()
  });
}

/**
 * Chamado pelo formulário de Pessoas somente depois que o cadastro e todos os
 * uploads selecionados já foram confirmados em operações anteriores.
 */
function personFinalize_(ctx,q){
  required_(q.pessoaId,'pessoa');

  const p=get_('Pessoas',q.pessoaId);
  parcelasDefeso_(p.parcelasNaoRecebidas);

  const folder=personFolder_(p);
  const minuta=generatePersonDraft_(ctx,p);

  return {
    pessoaId:p.id,
    folderId:folder.getId(),
    folderUrl:folder.getUrl(),
    minutaBase:minuta,
    mensagem:'Cadastro, documentos e minuta concluídos.'
  };
}

function personSearch_(q){
  const term=String(q.busca||'').trim().toLowerCase();

  return all_('Pessoas')
    .filter(p=>
      !term||
      p.nome.toLowerCase().includes(term)||
      p.cpf.includes(term.replace(/[.\- ]/g,''))
    )
    .slice(0,200);
}
