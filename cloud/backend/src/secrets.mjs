import {SecretManagerServiceClient} from '@google-cloud/secret-manager';
import {httpError} from './core.mjs';

const client=new SecretManagerServiceClient();
const PROJECT=process.env.GOOGLE_CLOUD_PROJECT||process.env.GCLOUD_PROJECT||'povo-das-aguas-2026-yago';

export const SECRET_IDS=Object.freeze({
  portal:'povo-portal-api-key',
  deepseek:'povo-deepseek-api-key'
});

const secretName=id=>'projects/'+PROJECT+'/secrets/'+id;
const versionName=id=>secretName(id)+'/versions/latest';
const configuredCache=new Map();
const CONFIGURED_CACHE_TTL_MS=30000;

export async function getSecret(id,{required=false,label='segredo'}={}){
  try{
    const [version]=await client.accessSecretVersion({name:versionName(id)});
    const value=version.payload?.data?.toString('utf8').trim()||'';
    if(required&&!value)throw httpError(503,'A configuração de '+label+' ainda não foi informada.');
    return value;
  }catch(e){
    if(e.statusCode)throw e;
    if(required)throw httpError(503,'A configuração de '+label+' ainda não foi informada.');
    return '';
  }
}

export async function secretConfigured(id){
  const cached=configuredCache.get(id);
  if(cached&&cached.expiresAt>Date.now())return cached.value;
  const value=!!(await getSecret(id).catch(()=>''));
  configuredCache.set(id,{value,expiresAt:Date.now()+CONFIGURED_CACHE_TTL_MS});
  return value;
}

export async function saveSecret(id,value,{minLength=8,label='chave'}={}){
  const clean=String(value||'').trim();
  if(clean.length<minLength)throw httpError(400,'Informe uma '+label+' válida.');
  await client.addSecretVersion({
    parent:secretName(id),
    payload:{data:Buffer.from(clean,'utf8')}
  });
  configuredCache.delete(id);
  return true;
}
