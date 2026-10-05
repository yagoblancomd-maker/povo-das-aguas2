function personSave_(ctx,q){const before=q.id?get_('Pessoas',q.id):null;
if(before)authorize_('retificacao');
const p=validatePerson_(q,cfg_(),cfg_().rascunhos!=='PERMITIR');
const other=all_('Pessoas').find(r=>r.cpf===p.cpf&&r.id!==q.id);
if(other)fail_('CPF já cadastrado. Abra a pessoa existente: '+other.id);
const saved=change_(ctx,'Pessoas',q.id||id_('PES',ctx.op),p,q.versao);
if(before)all_('Atendimentos').filter(a=>a.pessoaId===before.id).forEach(a=>touch_(ctx,a));
return saved;
}
function personSearch_(q){const term=String(q.busca||'').trim().toLowerCase();
return all_('Pessoas').filter(p=>!term||p.nome.toLowerCase().includes(term)||p.cpf.includes(term.replace(/[.\- ]/g,''))).slice(0,200);
}
