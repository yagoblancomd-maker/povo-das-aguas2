function atendSave_(ctx,q){const previous=q.id?get_('Atendimentos',q.id):null;
if(previous)authorize_('retificacao');
const a=validateAtend_(q,cfg_());
get_('Pessoas',a.pessoaId);
if(previous&&previous.pessoaId!==a.pessoaId)fail_('Não é permitido trocar a pessoa do atendimento.');
const duplicate=all_('Atendimentos').find(r=>r.id!==q.id&&r.pessoaId===a.pessoaId&&r.demanda===a.demanda&&r.referencia.toLowerCase()===a.referencia.toLowerCase());
if(duplicate)fail_('Demanda e referência já cadastradas: '+duplicate.id+'. Use outra referência somente para demanda efetivamente distinta.');
return change_(ctx,'Atendimentos',q.id||id_('ATE',ctx.op),Object.assign({},previous||{},a,{situacao:'EM_PREPARACAO',revisao:Number(previous&&previous.revisao||0)+1,conferencia:''}),q.versao);
}
function forward_(ctx,q){const a=get_('Atendimentos',q.id);
version_(a,q.versao);
const errors=eligibility_(a,false);
if(errors.length)fail_(errors.join('\n'));
const folder=folder_(a);
ctx.effects.push('Pasta preservada: '+folder.getUrl());
return change_(ctx,'Atendimentos',a.id,Object.assign({},a,{folderId:folder.getId(),situacao:'ENCAMINHADO',conferencia:''}),a.versao);
}
