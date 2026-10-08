import crypto from 'node:crypto';

const base='http://127.0.0.1:18081';
const suffix=Date.now().toString().slice(-8);
const username='cloudtest'+suffix;
const email=username+'@example.invalid';
const password='Tst_'+crypto.randomBytes(18).toString('base64url')+'Aa9!';

async function req(path,options={}){
  const res=await fetch(base+path,options);
  const text=await res.text();
  return {res,text};
}

const reg=await req('/api/v1/auth/register',{
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
console.log('REGISTER='+reg.res.status);
console.log(reg.text.slice(0,600));
if(!reg.res.ok)process.exit(2);

const cookie=(reg.res.headers.get('set-cookie')||'').split(';')[0];
const ses=await req('/api/v1/auth/session',{headers:{cookie}});
console.log('SESSION='+ses.res.status);
console.log(ses.text.slice(0,600));

const people=await req('/api/v1/action/pessoas',{
  method:'POST',
  headers:{'content-type':'application/json',cookie},
  body:JSON.stringify({busca:''})
});
console.log('PESSOAS='+people.res.status);
console.log(people.text.slice(0,800));

console.log('TEST_EMAIL='+email);
