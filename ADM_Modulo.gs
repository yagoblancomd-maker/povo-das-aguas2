function adminSave_(ctx,q){const allowed=['rascunhos','vencimentoFuturo','anexoOrientacao','templateId','templateAprovado','entidades','municipios','demandas','categorias','situacoes'];
if(!allowed.includes(q.chave))fail_('Configuração não editável.');
if(q.chave==='rascunhos'&&!['PENDENTE','PERMITIR','PROIBIR'].includes(q.valor))fail_('Política inválida.');
if(q.chave==='vencimentoFuturo'&&!['PENDENTE','ACEITAR','RECUSAR'].includes(q.valor))fail_('Política inválida.');
if(['entidades','municipios','demandas','categorias','situacoes'].includes(q.chave)){if(!Array.isArray(q.valor)||!q.valor.length||q.valor.some(v=>typeof v!=='string'||!v.trim()))fail_('Informe uma lista não vazia.');
if(q.chave==='situacoes'&&DEFAULTS.situacoes.some(x=>!q.valor.includes(x)))fail_('Situações do fluxo inicial não podem ser removidas.');
if(q.chave==='categorias'&&DEFAULTS.categorias.some(x=>!q.valor.includes(x)))fail_('Categorias iniciais obrigatórias não podem ser removidas.');
}if(q.chave==='templateId'&&q.valor){const f=DriveApp.getFileById(q.valor);
if(f.getMimeType()!==MimeType.GOOGLE_DOCS)fail_('Modelo deve ser Google Docs.');
validateTemplate_(q.valor);
}if(q.chave==='templateAprovado'){q.valor=bool_(q.valor);
if(q.valor)validateTemplate_(cfg_().templateId);
}const old=all_('Configuracoes').find(r=>r.chave===q.chave);
const result=change_(ctx,'Configuracoes',old.id,{chave:q.chave,valor:JSON.stringify(q.valor)},q.versao);
if(q.chave==='templateId'){const approval=all_('Configuracoes').find(r=>r.chave==='templateAprovado');
change_(ctx,'Configuracoes',approval.id,{chave:'templateAprovado',valor:'false'},approval.versao);
}return result;
}
function userSave_(ctx,q){const email=String(q.email||'').trim().toLowerCase();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!ROLES[q.perfil])fail_('E-mail ou perfil inválido.');
const old=all_('Usuarios').find(u=>u.email===email);
if(q.id&&get_('Usuarios',q.id).email!==email)fail_('O e-mail identifica o usuário e não pode ser alterado. Desative o antigo e cadastre outro.');
if(old&&old.id!==q.id)fail_('Abra o usuário existente.');
if(old&&old.email===ctx.email&&(!bool_(q.ativo)||q.perfil!=='ADMIN'))fail_('Não remova seu próprio acesso administrativo.');
return change_(ctx,'Usuarios',old?old.id:id_('USR',email),{email,perfil:q.perfil,ativo:bool_(q.ativo)},q.versao);
}
