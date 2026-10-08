import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {Storage} from '@google-cloud/storage';
import {getPool,tx} from './db.mjs';
import {publicUser,ROLES} from './access.mjs';
import {
  id,randomId,now,bool,httpError,sha,STORAGE_BUCKET,all,get,change,findOne,
  ENTIDADES_PADRAO
} from './core.mjs';

const H=12;
const RECOVERY_MINUTES=30;
const storage=new Storage();
const bucket=storage.bucket(STORAGE_BUCKET);
const PASSWORD_ALGORITHM='bcrypt-sha256-v1';
const SELF_FUNCTIONS=['Professor','Residente','Colaborador','Aluno','Colônia de Pescador'];

function normalizeEmail(value){
  const email=String(value||'').trim().toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    throw httpError(400,'Informe um e-mail válido.');
  }
  return email;
}

export function normalizeUsername(value){
  const username=String(value||'').trim().toLowerCase();
  if(
    username.length<3||
    username.length>40||
    !/^[a-z0-9._-]+$/.test(username)
  ){
    throw httpError(
      400,
      'O nome de usuário deve ter de 3 a 40 caracteres e usar apenas letras sem acentos, números, ponto, hífen ou sublinhado.'
    );
  }
  return username;
}

function password(value){
  if(typeof value!=='string'||value.length===0)throw httpError(400,'Informe uma senha.');
  if(value.length>4096)throw httpError(400,'A senha excede o limite de 4096 caracteres.');
  return value;
}

async function passwordFields(value){
  const pre=sha(password(value));
  return {
    senhaHash:await bcrypt.hash(pre,12),
    senhaSalt:'',
    senhaAlgoritmo:PASSWORD_ALGORITHM
  };
}

async function matches(user,value){
  return !!(
    user&&
    user.senhaAlgoritmo===PASSWORD_ALGORITHM&&
    user.senhaHash&&
    await bcrypt.compare(
      sha(password(value)),
      user.senhaHash
    )
  );
}

function selfAccess(funcao){
  if(funcao==='Professor'||funcao==='Residente'){
    return {perfil:'PROFESSOR_RESIDENTE',permissoes:[...(ROLES.PROFESSOR_RESIDENTE||[])]};
  }
  if(funcao==='Colaborador'){
    return {perfil:'COLABORADOR',permissoes:[...(ROLES.COLABORADOR||[])]};
  }
  if(funcao==='Aluno'){
    return {perfil:'ALUNO',permissoes:[...(ROLES.ALUNO||[])]};
  }
  if(funcao==='Colônia de Pescador'){
    return {perfil:'COLONIA_PESCADOR',permissoes:[...(ROLES.COLONIA_PESCADOR||[])]};
  }
  throw httpError(400,'Função de autocadastro inválida.');
}

function sessionToken(){
  return crypto.randomBytes(32).toString('hex');
}

async function availableUsername(client,username,userId=''){
  const user=await findOne(
    'Usuarios',
    'lower(nome_usuario)=lower($1) AND id<>$2',
    [username,userId],
    client
  );
  if(user)throw httpError(409,'Este nome de usuário já está em uso.');
}

async function newSession(client,user){
  const token=sessionToken();
  const exp=new Date(Date.now()+H*3600000);

  await change(
    client,
    {email:user.email},
    'Sessoes',
    id('SES',token),
    {
      usuarioId:user.id,
      tokenHash:sha(token),
      expiraEm:exp.toISOString(),
      sessionVersion:Number(user.sessionVersion||0),
      revogada:false
    }
  );

  return {
    status:'AUTHENTICATED',
    sessionToken:token,
    expiresAt:exp.getTime(),
    usuario:publicUser(user)
  };
}

export async function login(loginInput,senha){
  const loginValue=String(loginInput||'').trim().toLowerCase();
  if(!loginValue||loginValue.length>254)throw httpError(400,'Informe seu nome de usuário.');
  password(senha);

  return tx(async client=>{
    const q=await client.query(
      `SELECT id
         FROM usuarios
        WHERE ativo=true
          AND (
            lower(coalesce(nome_usuario,''))=lower($1)
            OR lower(email)=lower($1)
          )
        LIMIT 1
        FOR UPDATE`,
      [loginValue]
    );

    const raw=q.rows[0];
    if(!raw)throw httpError(401,'Usuário ou senha incorretos.');

    const user=await get('Usuarios',raw.id,client);

    if(!await matches(user,senha)){
      throw httpError(401,'Usuário ou senha incorretos.');
    }

    const updated=await change(
      client,
      {email:user.email},
      'Usuarios',
      user.id,
      {...user,ultimoLogin:now()},
      user.versao
    );

    return newSession(client,updated);
  });
}

export async function register(q){
  q=q||{};

  const email=normalizeEmail(q.email);
  const senha=password(q.senha);
  const nome=String(q.nome||'').trim().replace(/\s+/g,' ');
  const nomeUsuario=normalizeUsername(q.nomeUsuario);
  const funcao=String(q.funcao||'').trim();

  if(!nome||nome.length>140){
    throw httpError(400,'Informe seu nome, com até 140 caracteres.');
  }

  if(!SELF_FUNCTIONS.includes(funcao)){
    throw httpError(400,'Selecione sua função no projeto.');
  }

  const access=selfAccess(funcao);
  let entidade='';

  if(access.perfil==='COLONIA_PESCADOR'){
    entidade=String(q.entidade||'').trim();
    const allowed=ENTIDADES_PADRAO.filter(x=>x!=='Outro');
    if(!allowed.includes(entidade)){
      throw httpError(400,'Selecione a entidade vinculada à Colônia.');
    }
  }

  return tx(async client=>{
    if(await findOne('Usuarios','lower(email)=lower($1)',[email],client)){
      throw httpError(409,'Este e-mail já possui cadastro. Use Entrar ou Esqueci minha senha.');
    }

    await availableUsername(client,nomeUsuario);

    const fields=await passwordFields(senha);

    const user=await change(
      client,
      {email},
      'Usuarios',
      randomId('USR'),
      {
        email,
        nome,
        nomeUsuario,
        funcao,
        perfil:access.perfil,
        ativo:true,
        permissoes:access.permissoes,
        permissoesVersao:2,
        sessionVersion:1,
        ultimoLogin:now(),
        emailsAnteriores:[],
        entidade,
        ...fields
      }
    );

    return newSession(client,user);
  });
}

export async function session(token){
  if(!/^[a-f0-9]{64}$/.test(String(token||'')))return null;

  const pool=await getPool();

  const q=await pool.query(
    `SELECT u.id,s.id sessao_id,s.expira_em sessao_expira_em
       FROM sessoes s
       JOIN usuarios u ON u.id=s.usuario_id
      WHERE s.token_hash=$1
        AND s.revogada=false
        AND s.expira_em>now()
        AND u.ativo=true
        AND u.session_version=s.session_version
      LIMIT 1`,
    [sha(token)]
  );

  if(!q.rows.length)return null;

  return {
    user:await get('Usuarios',q.rows[0].id),
    sessionId:q.rows[0].sessao_id,
    expiresAt:new Date(q.rows[0].sessao_expira_em).getTime()
  };
}

export function bearer(req){
  const m=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i);
  return m?m[1].trim():String(req.cookies?.pda_session||'');
}

export async function requireAuth(req,reply){
  const s=await session(bearer(req));
  if(!s){
    return reply.code(401).send({
      error:'AUTH',
      message:'AUTH: sua sessão expirou. Entre novamente.'
    });
  }

  req.auth={...s,token:bearer(req)};
}

export async function logout(token){
  if(!/^[a-f0-9]{64}$/.test(String(token||'')))return {ok:true};

  const pool=await getPool();
  await pool.query(
    'UPDATE sessoes SET revogada=true,alterado_em=now(),versao=versao+1 WHERE token_hash=$1',
    [sha(token)]
  );

  return {ok:true};
}

export async function resume(token){
  const s=await session(token);
  if(!s)throw httpError(401,'AUTH: sua sessão expirou. Entre novamente.');

  return {
    status:'AUTHENTICATED',
    expiresAt:s.expiresAt,
    usuario:publicUser(s.user)
  };
}

function aliases(user){
  if(Array.isArray(user.emailsAnteriores))return user.emailsAnteriores;
  try{return JSON.parse(user.emailsAnteriores||'[]');}
  catch{return [];}
}

async function availableEmail(client,email,userId){
  const direct=await findOne(
    'Usuarios',
    'lower(email)=lower($1) AND id<>$2',
    [email,userId||''],
    client
  );

  if(direct)throw httpError(409,'Este e-mail já possui cadastro.');

  const users=await all('Usuarios',client);
  if(
    users.some(user=>
      user.id!==userId&&
      aliases(user)
        .map(x=>String(x).toLowerCase())
        .includes(email)
    )
  ){
    throw httpError(409,'Este e-mail já foi utilizado em outra conta.');
  }
}

async function profilePhotoData(user){
  const ref=String(user.fotoId||'');
  if(!ref.startsWith('gcs:'))return '';

  try{
    const file=bucket.file(ref.slice(4));
    const [meta]=await file.getMetadata();
    const [bytes]=await file.download();
    const mime=String(meta.contentType||'image/jpeg');

    if(!/^image\/(jpeg|png|webp)$/.test(mime))return '';

    return 'data:'+mime+';base64,'+bytes.toString('base64');
  }catch{
    return '';
  }
}

export async function profile(token){
  const s=await session(token);
  if(!s)throw httpError(401,'AUTH: sua sessão expirou. Entre novamente.');

  return {
    usuario:publicUser(s.user),
    foto:await profilePhotoData(s.user)
  };
}

async function savePhoto(user,base64,mime){
  if(
    typeof base64!=='string'||
    !base64.length||
    base64.length>410000||
    !/^image\/(jpeg|png|webp)$/.test(mime)
  ){
    throw httpError(400,'Selecione uma imagem JPEG, PNG ou WebP de até 300 KB.');
  }

  const bytes=Buffer.from(base64,'base64');
  if(bytes.length>300*1024)throw httpError(400,'A imagem excede 300 KB.');

  const ext={
    'image/png':'png',
    'image/jpeg':'jpg',
    'image/webp':'webp'
  }[mime];

  const name='profiles/'+user.id+'/'+Date.now()+'.'+ext;

  await bucket.file(name).save(
    bytes,
    {
      contentType:mime,
      resumable:false
    }
  );

  return 'gcs:'+name;
}

async function deletePhoto(ref){
  if(String(ref||'').startsWith('gcs:')){
    try{
      await bucket.file(String(ref).slice(4)).delete({ignoreNotFound:true});
    }catch{}
  }
}

export async function updateProfile(token,q){
  const s=await session(token);
  if(!s)throw httpError(401,'AUTH: sua sessão expirou. Entre novamente.');

  q=q||{};

  const nome=String(q.nome||'').trim().replace(/\s+/g,' ');
  const nomeUsuario=normalizeUsername(q.nomeUsuario);
  const email=normalizeEmail(q.email);

  if(!nome||nome.length>140){
    throw httpError(400,'Informe o nome com até 140 caracteres.');
  }

  const changedEmail=email!==String(s.user.email).toLowerCase();

  if(changedEmail&&!await matches(s.user,password(q.senhaAtual))){
    throw httpError(401,'Senha atual incorreta.');
  }

  let created='';
  if(q.base64)created=await savePhoto(s.user,q.base64,String(q.mime||''));

  try{
    return await tx(async client=>{
      const user=await get('Usuarios',s.user.id,client);

      if(Number(user.versao)!==Number(q.versao)){
        throw httpError(409,'Perfil alterado. Recarregue.');
      }

      if(changedEmail)await availableEmail(client,email,user.id);
      await availableUsername(client,nomeUsuario,user.id);

      const oldEmail=user.email;
      const previousPhoto=user.fotoId||'';
      const list=aliases(user);

      if(changedEmail&&!list.includes(oldEmail))list.push(oldEmail);

      let fotoId=previousPhoto;
      if(q.removerFoto===true)fotoId='';
      if(created)fotoId=created;

      const updated=await change(
        client,
        {email:user.email},
        'Usuarios',
        user.id,
        {
          ...user,
          nome,
          nomeUsuario,
          email,
          fotoId,
          emailsAnteriores:list,
          sessionVersion:Number(user.sessionVersion||0)+(changedEmail?1:0)
        },
        user.versao
      );

      if(changedEmail){
        for(const table of ['tarefas','atendimentos','distribuicao','processos']){
          await client.query(
            `UPDATE ${table}
                SET responsavel=$1,alterado_em=now()
              WHERE lower(coalesce(responsavel,''))=lower($2)`,
            [email,oldEmail]
          );
        }
      }

      const freshSession=changedEmail
        ?await newSession(client,updated)
        :null;

      if(previousPhoto&&previousPhoto!==fotoId){
        setTimeout(()=>deletePhoto(previousPhoto),0);
      }

      return Object.assign(
        {ok:true,usuario:publicUser(updated)},
        freshSession||{}
      );
    });
  }catch(e){
    if(created)await deletePhoto(created);
    throw e;
  }
}

export async function changePassword(token,senhaAtual,novaSenha){
  const s=await session(token);
  password(senhaAtual);
  password(novaSenha);

  if(!s)throw httpError(401,'AUTH: sua sessão expirou. Entre novamente.');

  if(!await matches(s.user,senhaAtual)){
    throw httpError(401,'Senha atual incorreta.');
  }

  const fields=await passwordFields(novaSenha);

  return tx(async client=>{
    const user=await get('Usuarios',s.user.id,client);

    const updated=await change(
      client,
      {email:user.email},
      'Usuarios',
      user.id,
      {
        ...user,
        ...fields,
        sessionVersion:Number(user.sessionVersion||0)+1
      },
      user.versao
    );

    await client.query(
      'UPDATE sessoes SET revogada=true,alterado_em=now() WHERE usuario_id=$1',
      [user.id]
    );

    return newSession(client,updated);
  });
}

export async function adminResetPassword(userId,newPassword,actor){
  const fields=await passwordFields(newPassword);

  return tx(async client=>{
    const user=await get('Usuarios',userId,client);

    const updated=await change(
      client,
      {email:actor.email},
      'Usuarios',
      user.id,
      {
        ...user,
        ...fields,
        sessionVersion:Number(user.sessionVersion||0)+1
      },
      user.versao
    );

    await client.query(
      'UPDATE sessoes SET revogada=true,alterado_em=now(),versao=versao+1 WHERE usuario_id=$1',
      [user.id]
    );

    return {
      usuario:publicUser(updated),
      mensagem:'Senha redefinida. As sessões anteriores deste usuário foram encerradas.'
    };
  });
}

async function sendRecoveryEmail(email,link){
  const clientId=process.env.GMAIL_CLIENT_ID||'';
  const clientSecret=process.env.GMAIL_CLIENT_SECRET||'';
  const refresh=process.env.GMAIL_REFRESH_TOKEN||'';

  if(!clientId||!clientSecret||!refresh)return false;

  const tokenResponse=await fetch(
    'https://oauth2.googleapis.com/token',
    {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({
        client_id:clientId,
        client_secret:clientSecret,
        refresh_token:refresh,
        grant_type:'refresh_token'
      })
    }
  );

  if(!tokenResponse.ok)return false;

  const access=(await tokenResponse.json()).access_token;
  const subject='Povo das Águas — recuperação de senha';

  const message=[
    'To: '+email,
    'Subject: '+subject,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    'Para definir uma nova senha, abra este link:',
    '',
    link,
    '',
    'O link vale por 30 minutos e pode ser usado uma única vez.'
  ].join('\r\n');

  const raw=Buffer.from(message).toString('base64url');

  const sent=await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method:'POST',
      headers:{
        Authorization:'Bearer '+access,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({raw})
    }
  );

  return sent.ok;
}

export async function requestRecovery(emailInput,appUrl){
  const email=normalizeEmail(emailInput);

  const response={
    ok:true,
    mensagem:'Se este e-mail possui uma conta ativa, o link de recuperação será enviado. Confira também a pasta de spam.'
  };

  const pool=await getPool();

  const user=await findOne(
    'Usuarios',
    'lower(email)=lower($1) AND ativo=true',
    [email],
    pool
  );

  if(!user)return response;

  const token=sessionToken();
  const exp=new Date(Date.now()+RECOVERY_MINUTES*60000);

  await tx(async client=>{
    await change(
      client,
      {email},
      'Recuperacoes',
      id('REC',token),
      {
        usuarioId:user.id,
        tokenHash:sha(token),
        expiraEm:exp.toISOString(),
        sessionVersion:Number(user.sessionVersion||0),
        usada:false
      }
    );
  });

  const url=String(appUrl||'').replace(/\/$/,'')+'/?reset='+encodeURIComponent(token);
  const sent=await sendRecoveryEmail(email,url);

  if(!sent){
    throw httpError(
      503,
      'A recuperação por e-mail ainda está sendo configurada no ambiente Cloud. A conta continua acessível com sua senha atual.'
    );
  }

  return response;
}

export async function resetPassword(token,senhaInput){
  password(senhaInput);

  if(!/^[a-f0-9]{64}$/.test(String(token||''))){
    throw httpError(400,'Link de recuperação inválido ou expirado.');
  }

  const fields=await passwordFields(senhaInput);

  return tx(async client=>{
    const q=await client.query(
      `SELECT r.id rec_id,r.usuario_id,u.id user_id
         FROM recuperacoes r
         JOIN usuarios u ON u.id=r.usuario_id
        WHERE r.token_hash=$1
          AND r.usada=false
          AND r.expira_em>now()
          AND u.ativo=true
          AND u.session_version=r.session_version
        LIMIT 1
        FOR UPDATE`,
      [sha(token)]
    );

    if(!q.rows.length){
      throw httpError(400,'Link de recuperação inválido ou expirado.');
    }

    const recovery=await get('Recuperacoes',q.rows[0].rec_id,client);
    const user=await get('Usuarios',q.rows[0].user_id,client);

    await change(
      client,
      {email:user.email},
      'Usuarios',
      user.id,
      {
        ...user,
        ...fields,
        sessionVersion:Number(user.sessionVersion||0)+1
      },
      user.versao
    );

    await change(
      client,
      {email:user.email},
      'Recuperacoes',
      recovery.id,
      {...recovery,usada:true},
      recovery.versao
    );

    await client.query(
      'UPDATE sessoes SET revogada=true WHERE usuario_id=$1',
      [user.id]
    );

    return {
      ok:true,
      mensagem:'Senha alterada. Entre com seu nome de usuário e a nova senha.'
    };
  });
}

export async function portalPeople(){
  const users=(await all('Usuarios'))
    .filter(user=>
      bool(user.ativo)&&
      String(user.fotoId||'').startsWith('gcs:')
    )
    .sort(
      (a,b)=>
        Date.parse(b.ultimoLogin||0)-
        Date.parse(a.ultimoLogin||0)
    )
    .slice(0,5);

  const rows=[];

  for(const user of users){
    const foto=await profilePhotoData(user);
    if(foto)rows.push({foto});
  }

  return rows;
}
