import crypto from 'node:crypto';
import {getPool,closeDb} from '../src/db.mjs';

const base='https://povo-das-aguas-api-22665r35ja-rj.a.run.app';
const suffix=Date.now().toString().slice(-8);
const username='cloudflow'+suffix;
const email=username+'@example.invalid';
const password='Tst_'+crypto.randomBytes(18).toString('base64url')+'Aa9!';
const result={email,checks:{}};
let userId='';

async function request(path,options={}){
  const res=await fetch(base+path,options);
  const text=await res.text();
  let body=null;
  try{body=JSON.parse(text);}catch{body=text;}
  return {res,body,text};
}

try{
  const reg=await request('/api/v1/auth/register',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      nome:'Teste Fluxo Cloud',
      nomeUsuario:username,
      email,
      funcao:'Colaborador',
      senha:password
    })
  });
  result.checks.register=reg.res.status;
  if(!reg.res.ok)throw new Error('register '+reg.res.status+' '+reg.text.slice(0,300));

  const cookie=(reg.res.headers.get('set-cookie')||'').split(';')[0];
  if(!cookie)throw new Error('cookie de sessão ausente');

  const session=await request('/api/v1/auth/session',{headers:{cookie}});
  result.checks.session=session.res.status;
  if(!session.res.ok)throw new Error('session '+session.res.status);

  const profile=await request('/api/v1/auth/profile',{headers:{cookie}});
  result.checks.profile=profile.res.status;
  if(!profile.res.ok)throw new Error('profile '+profile.res.status);

  const bootstrap=await request('/api/v1/action/bootstrap',{
    method:'POST',
    headers:{'content-type':'application/json',cookie},
    body:'{}'
  });
  result.checks.bootstrap=bootstrap.res.status;
  if(!bootstrap.res.ok)throw new Error('bootstrap '+bootstrap.res.status+' '+bootstrap.text.slice(0,300));
  result.modules=Object.keys(bootstrap.body?.modulos||{});
  result.permissions=bootstrap.body?.permissoes||[];

  const people=await request('/api/v1/action/pessoas',{
    method:'POST',
    headers:{'content-type':'application/json',cookie},
    body:JSON.stringify({busca:''})
  });
  result.checks.pessoas=people.res.status;
  if(!people.res.ok)throw new Error('pessoas '+people.res.status);
  result.peopleCount=Array.isArray(people.body)?people.body.length:null;

  const logout=await request('/api/v1/auth/logout',{
    method:'POST',
    headers:{'content-type':'application/json',cookie},
    body:'{}'
  });
  result.checks.logout=logout.res.status;

  const afterLogout=await request('/api/v1/auth/session',{headers:{cookie}});
  result.checks.sessionAfterLogout=afterLogout.res.status;
  result.ok=Object.values(result.checks).every((v)=>[200,201,204,401].includes(v))&&afterLogout.res.status===401;
}finally{
  const pool=await getPool();
  try{
    const q=await pool.query('select id from usuarios where lower(email)=lower($1) limit 1',[email]);
    userId=q.rows[0]?.id||'';
    if(userId){
      await pool.query('begin');
      await pool.query('delete from sessoes where usuario_id=$1',[userId]);
      await pool.query('delete from recuperacoes where usuario_id=$1',[userId]);
      await pool.query("delete from historico where entidade='Usuarios' and registro_id=$1",[userId]);
      await pool.query('delete from usuarios where id=$1',[userId]);
      await pool.query('commit');
    }
    const left=await pool.query('select count(*)::int n from usuarios where lower(email)=lower($1)',[email]);
    result.cleanupRemaining=left.rows[0].n;
  }catch(e){
    try{await pool.query('rollback');}catch{}
    result.cleanupError=e.message;
  }
  await closeDb();
}
console.log('AUTH_FLOW='+JSON.stringify(result));
if(!result.ok||result.cleanupRemaining!==0)process.exit(2);
