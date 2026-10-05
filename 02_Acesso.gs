function identity_(){const email=Session.getActiveUser().getEmail().toLowerCase().trim();
if(!email)fail_('Identidade Google indisponível. Acesso bloqueado; revise a implantação.');
return email;
}
function authorize_(permission){const email=identity_();
const u=all_('Usuarios').find(r=>r.email===email&&bool_(r.ativo));
if(!u||!(ROLES[u.perfil]||[]).includes(permission))fail_('Acesso não autorizado para '+permission+'.');
return email;
}
function lock_(fn){const lock=LockService.getScriptLock();
if(!lock.tryLock(30000))fail_('Sistema ocupado. Tente novamente com a mesma operação.');
try{return fn();
}finally{lock.releaseLock();
}}
