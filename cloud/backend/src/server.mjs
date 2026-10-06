import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import {getPool,closeDb} from './db.mjs';
import {ensureSchema} from './schema.mjs';
import {login,register,logout,bearer,requireAuth} from './auth.mjs';
import {modules,permissions,publicUser,has} from './access.mjs';
import {coreRoutes} from './modules.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=Fastify({logger:true,trustProxy:true,bodyLimit:6*1024*1024});

if(process.env.AUTO_MIGRATE==='true'){
  await ensureSchema();
}

app.get('/healthz',async()=>({ok:true,service:'povo-das-aguas-cloud-api'}));

app.get('/readyz',async(req,reply)=>{
  try{
    await (await getPool()).query('SELECT 1');
    return {ok:true,database:'ready'};
  }catch(e){
    req.log.error(e);
    return reply.code(503).send({ok:false,database:'unavailable'});
  }
});

app.post('/api/v1/auth/register',async(req,reply)=>{
  try{return reply.code(201).send(await register(req.body||{}));}
  catch(e){return reply.code(e.statusCode||500).send({error:'AUTH',message:e.message});}
});

app.post('/api/v1/auth/login',async(req,reply)=>{
  try{return await login(req.body?.email,req.body?.senha);}
  catch(e){return reply.code(e.statusCode||500).send({error:'AUTH',message:e.message});}
});

app.get('/api/v1/auth/session',{preHandler:requireAuth},async req=>({
  status:'AUTHENTICATED',
  expiresAt:req.auth.expiresAt,
  usuario:publicUser(req.auth.user)
}));

app.post('/api/v1/auth/logout',async(req,reply)=>{
  await logout(bearer(req));
  return reply.send({ok:true});
});

app.get('/api/v1/bootstrap',{preHandler:requireAuth},async req=>{
  const pool=await getPool();
  const rows=(await pool.query('SELECT chave,valor FROM configuracoes ORDER BY chave')).rows;
  return {
    email:req.auth.user.email,
    usuario:publicUser(req.auth.user),
    perfil:req.auth.user.perfil,
    permissoes:permissions(req.auth.user),
    config:Object.fromEntries(rows.map(r=>[r.chave,r.valor])),
    modulos:modules(req.auth.user),
    home:'PAINEL'
  };
});

app.get('/api/v1/pessoas',{preHandler:requireAuth},async(req,reply)=>{
  if(!has(req.auth.user,'consulta')){
    return reply.code(403).send({error:'FORBIDDEN'});
  }
  const busca=String(req.query?.busca||'').trim();
  const limit=Math.min(Math.max(Number(req.query?.limit)||50,1),200);
  const offset=Math.max(Number(req.query?.offset)||0,0);
  const pool=await getPool();
  const q=await pool.query(
    `SELECT id,versao,criado_em,alterado_em,nome,cpf,nascimento,telefone,cidade,uf,
            entidade,jurisdicao,cep,email,criado_por
       FROM pessoas
      WHERE $1='' OR nome ILIKE $2 OR cidade ILIKE $2 OR cpf LIKE $3
      ORDER BY nome LIMIT $4 OFFSET $5`,
    [busca,'%'+busca+'%','%'+busca.replace(/\D/g,'')+'%',limit,offset]
  );
  return q.rows;
});

await app.register(coreRoutes);

app.get('/api/v1/pessoas/:id',{preHandler:requireAuth},async(req,reply)=>{
  if(!has(req.auth.user,'consulta')){
    return reply.code(403).send({error:'FORBIDDEN'});
  }
  const q=await (await getPool()).query(
    'SELECT * FROM pessoas WHERE id=$1 LIMIT 1',
    [req.params.id]
  );
  return q.rows[0]||reply.code(404).send({
    error:'NOT_FOUND',
    message:'Pessoa não localizada.'
  });
});

await app.register(fastifyStatic,{
  root:path.join(__dirname,'../public'),
  prefix:'/'
});

app.setNotFoundHandler((req,reply)=>{
  if(req.url.startsWith('/api/')){
    return reply.code(404).send({error:'NOT_FOUND'});
  }
  return reply.sendFile('index.html');
});

app.setErrorHandler((e,req,reply)=>{
  req.log.error(e);
  if(!reply.sent){
    reply.code(e.statusCode||500).send({
      error:'SERVER_ERROR',
      message:process.env.NODE_ENV==='production'
        ?'Não foi possível concluir a operação.'
        :e.message
    });
  }
});

const shutdown=async()=>{
  await app.close();
  await closeDb();
  process.exit(0);
};
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);

await app.listen({
  port:Number(process.env.PORT||8080),
  host:'0.0.0.0'
});
