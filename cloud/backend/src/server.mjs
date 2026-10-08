import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import {getPool,closeDb} from './db.mjs';
import {ensureSchema} from './schema.mjs';
import {
  login,register,resume,logout,bearer,requireAuth,profile,updateProfile,
  changePassword,requestRecovery,resetPassword,portalPeople
} from './auth.mjs';
import {publicUser} from './access.mjs';
import {executeAction,getDocumentForDownload} from './actions.mjs';
import {downloadObjectFromKey} from './generator.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=Fastify({logger:true,trustProxy:true,bodyLimit:15*1024*1024});

await app.register(cookie);
await app.register(rateLimit,{global:false});

if(process.env.AUTO_MIGRATE==='true'){
  await ensureSchema();
}

const authLimit=(max,timeWindow)=>({config:{rateLimit:{max,timeWindow}}});
const setSessionCookie=(reply,result)=>{
  if(result&&result.sessionToken){
    reply.setCookie('pda_session',result.sessionToken,{
      path:'/',httpOnly:true,secure:true,sameSite:'lax',
      maxAge:12*60*60
    });
  }
  return result;
};
const clearSessionCookie=reply=>reply.clearCookie('pda_session',{path:'/'});

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

app.post('/api/v1/auth/login',authLimit(8,'15 minutes'),async(req,reply)=>{
  try{return setSessionCookie(reply,await login(req.body?.login||req.body?.email,req.body?.senha));}
  catch(e){return reply.code(e.statusCode||500).send({error:'AUTH',message:e.message});}
});

app.post('/api/v1/auth/register',authLimit(5,'15 minutes'),async(req,reply)=>{
  try{return setSessionCookie(reply,await register(req.body||{}));}
  catch(e){return reply.code(e.statusCode||500).send({error:'AUTH',message:e.message});}
});

app.get('/api/v1/auth/session',{preHandler:requireAuth},async req=>({
  status:'AUTHENTICATED',
  expiresAt:req.auth.expiresAt,
  usuario:publicUser(req.auth.user)
}));

app.post('/api/v1/auth/logout',async(req,reply)=>{
  const result=await logout(bearer(req));
  clearSessionCookie(reply);
  return reply.send(result);
});

app.get('/api/v1/auth/portal-people',async()=>portalPeople());

app.get('/api/v1/auth/profile',{preHandler:requireAuth},async req=>profile(req.auth.token));

app.put('/api/v1/auth/profile',{preHandler:requireAuth},async(req,reply)=>{
  return setSessionCookie(reply,await updateProfile(req.auth.token,req.body||{}));
});

app.post('/api/v1/auth/change-password',{preHandler:requireAuth},async(req,reply)=>{
  return setSessionCookie(reply,await changePassword(req.auth.token,req.body?.senhaAtual,req.body?.novaSenha));
});

app.post('/api/v1/auth/recovery',authLimit(3,'15 minutes'),async req=>{
  const origin=(req.headers['x-forwarded-proto']||req.protocol||'https')+'://'+req.headers.host;
  return requestRecovery(req.body?.email,origin);
});

app.post('/api/v1/auth/reset',authLimit(6,'15 minutes'),async req=>
  resetPassword(req.body?.token,req.body?.senha)
);

app.post('/api/v1/action/:action',{preHandler:requireAuth},async(req,reply)=>{
  try{
    return await executeAction(String(req.params.action||''),req.body||{},req.auth.user);
  }catch(e){
    req.log.error({err:e,action:req.params.action});
    return reply.code(e.statusCode||500).send({
      error:e.statusCode===403?'FORBIDDEN':'ACTION_ERROR',
      message:e.message||'Não foi possível concluir a operação.'
    });
  }
});

app.get('/api/v1/files/:documentId',{preHandler:requireAuth},async(req,reply)=>{
  const result=await getDocumentForDownload(req.params.documentId,req.auth.user);
  if(result.redirect)return reply.redirect(result.redirect);
  const [meta]=await result.file.getMetadata();
  reply.header('Content-Type',meta.contentType||result.doc.mime||'application/octet-stream');
  reply.header('Content-Disposition','inline; filename*=UTF-8\'\''+encodeURIComponent(result.doc.nome||'documento'));
  reply.header('Cache-Control','private, max-age=60');
  return reply.send(result.file.createReadStream());
});

app.get('/api/v1/downloads/:key',{preHandler:requireAuth},async(req,reply)=>{
  const file=await downloadObjectFromKey(req.params.key);
  const [meta]=await file.getMetadata();
  const original=String(meta.metadata?.originalName||file.name.split('/').pop()||'arquivo');
  reply.header('Content-Type',meta.contentType||'application/octet-stream');
  reply.header('Content-Disposition','attachment; filename*=UTF-8\'\''+encodeURIComponent(original));
  reply.header('Cache-Control','private, no-store');
  return reply.send(file.createReadStream());
});

// Compatibilidade para testes e integrações diretas.
app.get('/api/v1/pessoas',{preHandler:requireAuth},async(req)=>{
  return executeAction('pessoas',{busca:req.query?.busca||''},req.auth.user);
});
app.get('/api/v1/pessoas/:id',{preHandler:requireAuth},async(req)=>{
  return executeAction('pessoa',{id:req.params.id},req.auth.user);
});

await app.register(fastifyStatic,{
  root:path.join(__dirname,'../public'),
  prefix:'/',
  cacheControl:true,
  maxAge:'5m',
  immutable:false
});

app.setNotFoundHandler((req,reply)=>{
  if(req.url.startsWith('/api/')){
    return reply.code(404).send({error:'NOT_FOUND',message:'Recurso não localizado.'});
  }
  return reply.sendFile('index.html');
});

app.setErrorHandler((e,req,reply)=>{
  req.log.error(e);
  if(reply.sent)return;
  const status=e.statusCode||500;
  reply.code(status).send({
    error:status===401?'AUTH':status===403?'FORBIDDEN':'SERVER_ERROR',
    message:process.env.NODE_ENV==='production'&&status>=500
      ?'Não foi possível concluir a operação.'
      :(e.message||String(e))
  });
});

const shutdown=async()=>{
  await app.close();
  await closeDb();
  process.exit(0);
};
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);

await app.listen({port:Number(process.env.PORT||8080),host:'0.0.0.0'});
