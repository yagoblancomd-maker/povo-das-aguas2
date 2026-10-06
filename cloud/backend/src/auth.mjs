import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {getPool,tx} from './db.mjs';
import {publicUser} from './access.mjs';

const H=12;
const sha=v=>crypto.createHash('sha256').update(String(v),'utf8').digest('hex');

export async function login(emailInput,senha){
  const email=String(emailInput||'').trim().toLowerCase();
  if(!email||typeof senha!=='string'||!senha.length)throw Object.assign(new Error('E-mail ou senha incorretos.'),{statusCode:401});

  return tx(async c=>{
    const q=await c.query(
      'SELECT * FROM usuarios WHERE lower(email)=lower($1) AND ativo=true FOR UPDATE',
      [email]
    );
    const u=q.rows[0];
    const ok=u&&u.senha_algoritmo==='bcrypt-sha256-v1'&&u.senha_hash&&
      await bcrypt.compare(sha(senha),u.senha_hash);

    if(!ok)throw Object.assign(new Error('E-mail ou senha incorretos.'),{statusCode:401});

    const token=crypto.randomBytes(32).toString('hex');
    const exp=new Date(Date.now()+H*3600000);

    await c.query(
      'UPDATE usuarios SET ultimo_login=now(),alterado_em=now(),versao=versao+1 WHERE id=$1',
      [u.id]
    );
    await c.query(
      `INSERT INTO sessoes
       (id,versao,criado_em,alterado_em,usuario_email,usuario_id,token_hash,expira_em,session_version,revogada)
       VALUES($1,1,now(),now(),$2,$3,$4,$5,$6,false)`,
      ['SES_'+sha(token).slice(0,28),u.email,u.id,sha(token),exp,Number(u.session_version||0)]
    );

    const fresh=(await c.query('SELECT * FROM usuarios WHERE id=$1',[u.id])).rows[0];
    return {status:'AUTHENTICATED',sessionToken:token,expiresAt:exp.getTime(),usuario:publicUser(fresh)};
  });
}

export async function session(token){
  if(!/^[a-f0-9]{64}$/.test(String(token||'')))return null;
  const pool=await getPool();
  const q=await pool.query(
    `SELECT u.*,s.id sessao_id,s.expira_em sessao_expira_em
       FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id
      WHERE s.token_hash=$1 AND s.revogada=false AND s.expira_em>now()
        AND u.ativo=true AND u.session_version=s.session_version LIMIT 1`,
    [sha(token)]
  );
  const u=q.rows[0];
  return u?{user:u,sessionId:u.sessao_id,expiresAt:new Date(u.sessao_expira_em).getTime()}:null;
}

export function bearer(req){
  const m=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i);
  return m?m[1].trim():'';
}

export async function requireAuth(req,reply){
  const s=await session(bearer(req));
  if(!s)return reply.code(401).send({error:'AUTH',message:'Sessão expirada ou inválida.'});
  req.auth={...s,token:bearer(req)};
}

export async function logout(token){
  if(!/^[a-f0-9]{64}$/.test(String(token||'')))return;
  const pool=await getPool();
  await pool.query(
    'UPDATE sessoes SET revogada=true,alterado_em=now(),versao=versao+1 WHERE token_hash=$1',
    [sha(token)]
  );
}
