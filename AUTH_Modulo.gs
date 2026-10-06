let PDA_AUTH_CONTEXT_EMAIL_='';
const PDA_AUTH_SESSION_HOURS=12;
const PDA_AUTH_RECOVERY_MINUTES=30;
const PDA_AUTH_PASSWORD_ALGORITHM='bcrypt-sha256-v1';

function authEnsureSchema_(){
  ['Usuarios','Sessoes','Recuperacoes'].forEach(entity=>{
    if(!ss_().getSheetByName(entity))ss_().insertSheet(entity);
    ensureEntitySchema_(entity);
  });
  if(props_().getProperty('AUTH_BANK_PRIVATE')!=='v1'){
    const bank=DriveApp.getFileById(ss_().getId());
    const roots=[DriveApp.getFolderById(PDA.parent),DriveApp.getFolderById(props_().getProperty('ROOT_FOLDER_ID'))];
    const owner=String(props_().getProperty('OWNER_EMAIL')||'').trim().toLowerCase();
    all_('Usuarios').forEach(u=>{
      if(u.email&&u.email!==owner){bank.removeViewer(u.email);roots.forEach(folder=>folder.removeViewer(u.email));}
    });
    props_().setProperty('AUTH_BANK_PRIVATE','v1');
  }
}

function authEmail_(input){
  const email=String(input||'').trim().toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail_('Informe um e-mail válido.');
  return email;
}

function authPassword_(input){
  // Sem composição ou tamanho mínimo. Espaços são preservados.
  if(typeof input!=='string'||input.length===0)fail_('Informe uma senha.');
  if(input.length>4096)fail_('A senha excede o limite de 4096 caracteres.');
  return input;
}

function authSecret_(){
  let value=props_().getProperty('APP_AUTH_SECRET');
  if(!value){
    value=[uid_(),uid_(),uid_(),uid_()].join(':');
    props_().setProperty('APP_AUTH_SECRET',value);
  }
  return value;
}

function authRandom_(){
  return Utilities.computeHmacSha256Signature(uid_()+':'+uid_(),authSecret_())
    .map(x=>('0'+((x+256)%256).toString(16)).slice(-2)).join('');
}

function authPasswordFields_(senha){
  const bytes=authRandom_().slice(0,32).match(/../g).map(x=>parseInt(x,16));
  const salt='$2a$12$'+PDA_BCRYPT_.encodeBase64(bytes,16);
  return {
    // Pré-hash evita truncamento do bcrypt em 72 bytes para senhas longas/Unicode.
    senhaHash:PDA_BCRYPT_.hashSync(hash_(authPassword_(senha)),salt),
    senhaSalt:salt,senhaAlgoritmo:PDA_AUTH_PASSWORD_ALGORITHM
  };
}

function authPasswordMatches_(user,senha){
  if(!user||user.senhaAlgoritmo!==PDA_AUTH_PASSWORD_ALGORITHM||!user.senhaHash)return false;
  return PDA_BCRYPT_.compareSync(hash_(senha),user.senhaHash);
}

function authAliases_(user){
  try{return JSON.parse(user.emailsAnteriores||'[]');}catch(e){return [];}
}

function authUserEmailMatches_(user,email){
  const normalized=String(email||'').trim().toLowerCase();
  return user.email===normalized||authAliases_(user).includes(normalized);
}

function authFindUser_(email){
  return all_('Usuarios').find(user=>String(user.email||'').trim().toLowerCase()===email)||null;
}

function authCheckAvailableEmail_(email,userId){
  if(all_('Usuarios').some(u=>u.id!==userId&&authUserEmailMatches_(u,email)))
    fail_('Este e-mail já possui cadastro. Use Entrar ou Esqueci minha senha.');
  const owner=String(props_().getProperty('OWNER_EMAIL')||'').trim().toLowerCase();
  if(email===owner&&userId!==id_('USR',owner))fail_('Use Esqueci minha senha para ativar o acesso do proprietário.');
}

function authPublicUser_(user){
  const allowed=COMMON.concat(['email','perfil','ativo','nome','funcao','permissoes',
    'permissoesVersao','ultimoLogin','nomeUsuario']);
  return Object.fromEntries(allowed.map(k=>[k,user[k]===undefined?'':user[k]]));
}

function authAuditRecord_(entity,record){
  if(!record)return null;
  if(entity==='Usuarios')return authPublicUser_(record);
  if(entity==='Sessoes'||entity==='Recuperacoes'){
    const safe=Object.assign({},record);delete safe.tokenHash;return safe;
  }
  return record;
}

function authContext_(email){
  return {email,op:'AUTH_'+uid_(),hash:'auth',changes:[],effects:[]};
}

function authPersist_(ctx){
  // Nunca registrar senha, hash de senha ou tokens nos recibos/auditoria.
  if(ctx.changes.length)commit_(ctx,{ok:true});
}

function authLimit_(kind,key,max,minutes){
  // Persistente: expulsão de cache não libera tentativas.
  const p=props_(),now=Date.now(),prefix='AUTH_LIMIT_',property=prefix+kind+'_'+hash_(key);
  const values=p.getProperties();
  Object.keys(values).filter(k=>k.indexOf(prefix)===0).forEach(k=>{
    try{if(JSON.parse(values[k]).until<=now)p.deleteProperty(k);}catch(e){p.deleteProperty(k);}
  });
  let state;
  try{state=JSON.parse(p.getProperty(property)||'null');}catch(e){}
  if(!state||state.until<=now)state={count:0,until:now+minutes*60000};
  if(state.count>=max)fail_('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  state.count++;p.setProperty(property,JSON.stringify(state));
  return property;
}

function authNewSession_(ctx,user){
  const token=authRandom_();
  const expiresAt=Date.now()+PDA_AUTH_SESSION_HOURS*3600000;
  change_(ctx,'Sessoes',id_('SES',token),{
    usuarioId:user.id,tokenHash:hash_(token),expiraEm:new Date(expiresAt).toISOString(),
    sessionVersion:Number(user.sessionVersion||0),revogada:false
  });
  return {status:'AUTHENTICATED',sessionToken:token,expiresAt,usuario:authPublicUser_(user)};
}

function authSessionRead_(token){
  if(!/^[a-f0-9]{64}$/.test(String(token||'')))fail_('AUTH: entre com seu e-mail e senha.');
  resetData_();authEnsureSchema_();
  const session=all_('Sessoes').find(s=>s.tokenHash===hash_(token));
  const user=session&&all_('Usuarios').find(u=>u.id===session.usuarioId);
  if(!session||bool_(session.revogada)||!(Date.parse(session.expiraEm)>Date.now())||
     !user||!bool_(user.ativo)||Number(user.sessionVersion||0)!==Number(session.sessionVersion))
    fail_('AUTH: sua sessão expirou. Entre novamente.');
  return {email:user.email,user,session,expiresAt:Date.parse(session.expiraEm)};
}

function withAuthSession_(token,fn){
  /*
   * Sessões de leitura são validadas sem ScriptLock global.
   * all_()/getDisplayValues() são leituras e podem executar em paralelo.
   * Qualquer mutação revalida novamente a sessão dentro do lock de escrita.
   */
  const session=
    authSessionRead_(token);

  const before=
    PDA_AUTH_CONTEXT_EMAIL_;

  PDA_AUTH_CONTEXT_EMAIL_=
    session.email;

  try{
    return fn(session);
  }finally{
    PDA_AUTH_CONTEXT_EMAIL_=
      before;
  }
}

function withAuthMutationSession_(token,fn){
  /*
   * Operações que alteram autenticação/perfil mantêm validação e escrita
   * sob o mesmo ScriptLock, preservando a semântica transacional anterior.
   */
  return lock_(()=>{
    const session=
      authSessionRead_(token);

    const before=
      PDA_AUTH_CONTEXT_EMAIL_;

    PDA_AUTH_CONTEXT_EMAIL_=
      session.email;

    try{
      return fn(session);
    }finally{
      PDA_AUTH_CONTEXT_EMAIL_=
        before;
    }
  });
}

function authRegister(q){
  q=q||{};
  const email=authEmail_(q.email),senha=authPassword_(q.senha);
  const nome=String(q.nome||'').trim().replace(/\s+/g,' '),funcao=String(q.funcao||'').trim();
  if(!nome||nome.length>140)fail_('Informe seu nome, com até 140 caracteres.');
  if(!SELF_REGISTRATION_FUNCTIONS.includes(funcao))fail_('Selecione sua função no projeto.');
  return lock_(()=>{
    resetData_();authEnsureSchema_();
    authLimit_('register-global','global',40,60);authLimit_('register',email,5,15);
    authCheckAvailableEmail_(email);
    // Códigos por função são opcionais, sem aprovações individuais.
    let codes={};
    try{codes=JSON.parse(props_().getProperty('AUTH_ROLE_CODES')||'{}');}catch(e){fail_('Configuração de códigos de acesso inválida.');}
    if(codes[funcao]&&String(q.codigo||'')!==String(codes[funcao]))fail_('Código de acesso à função inválido.');
    const access=selfRegistrationAccess_(funcao),ctx=authContext_(email);
    const user=change_(ctx,'Usuarios',id_('USR',uid_()),Object.assign({
      email,nome,nomeUsuario:nome,funcao,perfil:access.perfil,ativo:true,
      permissoes:JSON.stringify(access.permissoes),permissoesVersao:2,
      sessionVersion:1,ultimoLogin:now_(),emailsAnteriores:'[]'
    },authPasswordFields_(senha)));
    const result=authNewSession_(ctx,user);authPersist_(ctx);return result;
  });
}

function authLogin(emailInput,senhaInput){
  const email=authEmail_(emailInput),senha=authPassword_(senhaInput);
  return lock_(()=>{
    resetData_();authEnsureSchema_();authLimit_('login-global','global',120,1);
    const limit=authLimit_('login',email,8,15),user=authFindUser_(email);
    // Trabalho equivalente para e-mails inexistentes, sem revelar cadastro.
    const ok=user&&user.senhaHash?authPasswordMatches_(user,senha):
      (PDA_BCRYPT_.hashSync(hash_(senha),'$2a$12$......................')&&false);
    if(!ok||!bool_(user.ativo))fail_('E-mail ou senha incorretos.');
    const ctx=authContext_(email);
    const updated=change_(ctx,'Usuarios',user.id,Object.assign({},user,{ultimoLogin:now_()}),user.versao);
    const result=authNewSession_(ctx,updated);authPersist_(ctx);props_().deleteProperty(limit);return result;
  });
}

function authResume(token){
  return withAuthSession_(token,s=>({status:'AUTHENTICATED',expiresAt:s.expiresAt,usuario:authPublicUser_(s.user)}));
}

function authLogout(token){
  return lock_(()=>{
    let s;try{s=authSessionRead_(token);}catch(e){return {ok:true};}
    const ctx=authContext_(s.email);
    change_(ctx,'Sessoes',s.session.id,Object.assign({},s.session,{revogada:true}),s.session.versao);
    authPersist_(ctx);return {ok:true};
  });
}

function authRequestRecovery(emailInput){
  const email=authEmail_(emailInput);
  const response={ok:true,mensagem:'Se este e-mail possui uma conta ativa, o link de recuperação será enviado. Confira também a pasta de spam.'};
  return lock_(()=>{
    resetData_();authEnsureSchema_();authLimit_('recovery-global','global',30,60);authLimit_('recovery',email,3,15);
    const user=authFindUser_(email);
    if(!user||!bool_(user.ativo))return response;
    const appUrl=String(ScriptApp.getService().getUrl()||'');
    if(!/^https:\/\/script\.google\.com\/.+\/exec$/.test(appUrl))fail_('Publique o aplicativo para habilitar a recuperação de senha.');
    const token=authRandom_(),ctx=authContext_(email);
    change_(ctx,'Recuperacoes',id_('REC',token),{
      usuarioId:user.id,tokenHash:hash_(token),expiraEm:new Date(Date.now()+PDA_AUTH_RECOVERY_MINUTES*60000).toISOString(),
      sessionVersion:Number(user.sessionVersion||0),usada:false
    });
    authPersist_(ctx);
    try{
      MailApp.sendEmail({to:email,subject:'Povo das Águas — recuperação de senha',name:'Povo das Águas',
        body:'Para definir uma nova senha, abra este link:\n\n'+appUrl+'?reset='+encodeURIComponent(token)+
          '\n\nO link vale por 30 minutos e pode ser usado uma única vez. Se não solicitou a recuperação, ignore esta mensagem.'});
    }catch(e){fail_('Não foi possível enviar o link. Tente novamente mais tarde.');}
    return response;
  });
}

function authResetPassword(token,senhaInput){
  const senha=authPassword_(senhaInput);
  if(!/^[a-f0-9]{64}$/.test(String(token||'')))fail_('Link de recuperação inválido ou expirado.');
  return lock_(()=>{
    resetData_();authEnsureSchema_();authLimit_('reset-global','global',40,15);
    const recovery=all_('Recuperacoes').find(r=>r.tokenHash===hash_(token));
    const user=recovery&&all_('Usuarios').find(u=>u.id===recovery.usuarioId);
    if(!recovery||bool_(recovery.usada)||!(Date.parse(recovery.expiraEm)>Date.now())||
       !user||!bool_(user.ativo)||Number(user.sessionVersion||0)!==Number(recovery.sessionVersion))
      fail_('Link de recuperação inválido ou expirado.');
    const ctx=authContext_(user.email);
    change_(ctx,'Usuarios',user.id,Object.assign({},user,authPasswordFields_(senha),{
      sessionVersion:Number(user.sessionVersion||0)+1
    }),user.versao);
    change_(ctx,'Recuperacoes',recovery.id,Object.assign({},recovery,{usada:true}),recovery.versao);
    authPersist_(ctx);props_().deleteProperty('AUTH_LIMIT_login_'+hash_(user.email));
    return {ok:true,mensagem:'Senha alterada. Entre com seu e-mail e a nova senha.'};
  });
}

function authPageBootstrap_(e){
  const reset=String(e&&e.parameter&&e.parameter.reset||'');
  let codes={};try{codes=JSON.parse(props_().getProperty('AUTH_ROLE_CODES')||'{}');}catch(error){}
  return {appUrl:String(ScriptApp.getService().getUrl()||''),resetToken:/^[a-f0-9]{64}$/.test(reset)?reset:'',
    funcoes:Array.from(SELF_REGISTRATION_FUNCTIONS),funcoesComCodigo:Object.keys(codes).filter(k=>!!codes[k])};
}


function authPortalPeople(){
  // Recurso visual somente de leitura. Nunca deve disputar o ScriptLock
  // usado por login, cadastro, perfil ou operações de negócio.
  resetData_();
  authEnsureSchema_();

  return all_('Usuarios')
    .filter(user=>bool_(user.ativo)&&String(user.fotoId||'').trim())
    .sort((a,b)=>{
      const ad=Date.parse(a.ultimoLogin||'')||0;
      const bd=Date.parse(b.ultimoLogin||'')||0;
      return bd-ad;
    })
    .slice(0,5)
    .map(user=>{
      try{
        return {foto:profilePhoto_(user)};
      }catch(e){
        return {foto:''};
      }
    })
    .filter(item=>!!item.foto);
}
