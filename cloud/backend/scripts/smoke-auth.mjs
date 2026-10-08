import crypto from 'node:crypto';

const base='https://candidate---povo-das-aguas-api-22665r35ja-rj.a.run.app';
const suffix=Date.now().toString().slice(-8);
const username='cloudtest'+suffix;
const email=username+'@example.invalid';
const password='Tst_'+crypto.randomBytes(18).toString('base64url')+'Aa9!';

async function request(path,options={}){
  const res=await fetch(base+path,options);
  const text=await res.text();
  return {res,text};
}

const reg=await request('/api/v1/auth/register',{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({
    nome:'Teste Migração Cloud',
    nomeUsuario:username,
    email,
    funcao:'Colaborador',
    senha:password
  })
});

console.log('REGISTER_STATUS='+reg.res.status);
if(!reg.res.ok){
  console.log('REGISTER_BODY='+reg.text.slice(0,800));
  process.exit(2);
}

const cookie=(reg.res.headers.get('set-cookie')||'').split(';')[0];
if(!cookie)throw new Error('Cookie de sessão não retornado.');

const session=await request('/api/v1/auth/session',{headers:{cookie}});
console.log('SESSION_STATUS='+session.res.status);
console.log('SESSION_BODY='+session.text.slice(0,500));

const people=await request('/api/v1/action/pessoas',{
  method:'POST',
  headers:{'content-type':'application/json',cookie},
  body:JSON.stringify({busca:''})
});
console.log('PESSOAS_STATUS='+people.res.status);
console.log('PESSOAS_BODY='+people.text.slice(0,700));

console.log('TEST_USER_EMAIL='+email);
console.log('TEST_USER_USERNAME='+username);
