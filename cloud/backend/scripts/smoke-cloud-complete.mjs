import crypto from 'node:crypto';

const base='https://candidate---povo-das-aguas-api-22665r35ja-rj.a.run.app';
const documentId='DOC_6b5ef6c4f6f2bb1028ed1b04e3df';

function password(){
  return 'Tst_'+crypto.randomBytes(18).toString('base64url')+'Aa9!';
}

async function call(path,options={}){
  const res=await fetch(base+path,options);
  const buf=Buffer.from(await res.arrayBuffer());
  return {
    status:res.status,
    ok:res.ok,
    type:res.headers.get('content-type')||'',
    text:buf.toString('utf8'),
    bytes:buf.length,
    headers:res.headers
  };
}

async function registerUser({funcao,entidade='',label}){
  const suffix=(Date.now().toString()+crypto.randomInt(1000,9999)).slice(-10);
  const username='cloudtest'+suffix;
  const email=username+'@example.invalid';
  const reg=await call('/api/v1/auth/register',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      nome:'Teste Cloud '+label,
      nomeUsuario:username,
      email,
      funcao,
      entidade,
      senha:password()
    })
  });
  console.log(label+'_REGISTER='+reg.status);
  if(!reg.ok){
    console.log(label+'_REGISTER_BODY='+reg.text.slice(0,800));
    throw new Error(label+' register failed');
  }
  const cookie=(reg.headers.get('set-cookie')||'').split(';')[0];
  const body=JSON.parse(reg.text);
  console.log(label+'_PROFILE='+body.usuario.perfil);
  console.log(label+'_ENTITY='+(body.usuario.entidade||''));
  console.log(label+'_PERMS='+JSON.stringify(body.usuario.permissoes||[]));
  return {cookie,email,username};
}

async function action(cookie,name,payload={}){
  const r=await call('/api/v1/action/'+name,{
    method:'POST',
    headers:{'content-type':'application/json',cookie},
    body:JSON.stringify(payload)
  });
  console.log('ACTION_'+name+'='+r.status+' bytes='+r.bytes);
  if(!r.ok)console.log('ACTION_'+name+'_BODY='+r.text.slice(0,800));
  return r;
}

const collaborator=await registerUser({funcao:'Colaborador',label:'COLLAB'});

const session=await call('/api/v1/auth/session',{headers:{cookie:collaborator.cookie}});
console.log('SESSION='+session.status);

const people=await action(collaborator.cookie,'pessoas',{busca:''});
const processes=await action(collaborator.cookie,'processos',{busca:''});
const filters=await action(collaborator.cookie,'processoFiltros',{});
const history=await action(collaborator.cookie,'historicoGeral',{tipo:'todos',limit:20,offset:0});
const visuals=await action(collaborator.cookie,'imagensSistema',{});

if(visuals.ok){
  const parsed=JSON.parse(visuals.text);
  console.log('VISUAL_COUNT='+(parsed.quantidade??parsed.imagens?.length??0));
}

const doc=await call('/api/v1/files/'+documentId,{headers:{cookie:collaborator.cookie}});
console.log('DOCUMENT='+doc.status+' type='+doc.type+' bytes='+doc.bytes);

const portal=await call('/api/v1/auth/portal-people');
console.log('PORTAL_PEOPLE='+portal.status+' bytes='+portal.bytes);

const colony=await registerUser({
  funcao:'Colônia de Pescador',
  entidade:'PEL - COLÔNIA Z-3',
  label:'COLONY'
});
await action(colony.cookie,'pessoas',{busca:''});
await action(colony.cookie,'processos',{busca:''});

console.log('TEST_EMAIL_1='+collaborator.email);
console.log('TEST_EMAIL_2='+colony.email);
