import {Storage} from '@google-cloud/storage';
import crypto from 'node:crypto';
import {STORAGE_BUCKET,httpError,required} from './core.mjs';

const storage=new Storage();
const bucket=storage.bucket(STORAGE_BUCKET);
const PREFIX='visuals/';
const MIMES=new Set(['image/jpeg','image/png','image/webp']);

function defaultUses(name){
  const value=String(name||'').toLowerCase();
  if(/pesca|porto|cais|molhes|agua/.test(value))return ['LOGIN','PAINEL','TERRITORIO'];
  if(/furg|historico|praca/.test(value))return ['LOGIN','PAINEL','INSTITUCIONAL'];
  if(/taim|capivara|fauna/.test(value))return ['LOGIN','PAINEL','TERRITORIO'];
  return ['LOGIN','PAINEL'];
}

function parseMeta(meta,name){
  const custom=meta?.metadata||{};
  let uses=[];
  try{uses=JSON.parse(custom.usos||'[]');}catch{}
  if(!Array.isArray(uses)||!uses.length)uses=defaultUses(name);
  return {
    ativo:String(custom.ativo??'true')!=='false',
    usos:uses.map(v=>String(v||'').trim().toUpperCase()).filter(Boolean),
    legenda:String(custom.legenda||''),
    ordem:Number(custom.ordem||0)
  };
}

async function objectRow(file){
  const [meta]=await file.getMetadata();
  const name=String(meta.name||file.name).replace(/^visuals\//,'');
  const m=parseMeta(meta,name);
  return {
    id:Buffer.from(file.name).toString('base64url'),
    nome:name,
    mime:meta.contentType||'application/octet-stream',
    ativo:m.ativo,usos:m.usos,legenda:m.legenda,ordem:m.ordem,
    atualizadoEm:meta.updated||meta.timeCreated||''
  };
}

function objectFromId(id){
  try{
    const object=Buffer.from(String(id||''),'base64url').toString('utf8');
    if(!object.startsWith(PREFIX))return '';
    return object;
  }catch{return '';}
}

export async function listVisuals(){
  const [files]=await bucket.getFiles({prefix:PREFIX});
  const rows=[];
  for(const file of files){
    if(file.name.endsWith('/'))continue;
    try{
      const row=await objectRow(file);
      if(MIMES.has(row.mime))rows.push(row);
    }catch{}
  }
  rows.sort((a,b)=>Number(a.ordem||0)-Number(b.ordem||0)||a.nome.localeCompare(b.nome,'pt-BR',{sensitivity:'base'}));
  return {pastaId:'gcs:'+STORAGE_BUCKET+'/'+PREFIX,quantidade:rows.length,imagens:rows};
}

export async function visualContent(q){
  const object=objectFromId(required(q.id,'imagem'));
  if(!object)throw httpError(404,'Imagem não localizada na biblioteca visual.');
  const file=bucket.file(object);
  const [exists]=await file.exists();if(!exists)throw httpError(404,'Imagem não localizada.');
  const [meta]=await file.getMetadata();
  const mime=meta.contentType||'';
  if(!MIMES.has(mime))throw httpError(400,'O arquivo informado não é uma imagem válida.');
  const [bytes]=await file.download();
  if(bytes.length>3*1024*1024)throw httpError(413,'A imagem ultrapassa 3 MB.');
  return {id:q.id,nome:String(object).replace(PREFIX,''),mime,base64:bytes.toString('base64')};
}

export async function randomVisual(q={}){
  const usage=String(q.uso||'PAINEL').trim().toUpperCase();
  const excluded=new Set((Array.isArray(q.excluirIds)?q.excluirIds:[]).map(String));
  const data=await listVisuals();
  const eligible=data.imagens.filter(item=>item.ativo&&!excluded.has(item.id)&&(!usage||item.usos.includes(usage)));
  if(!eligible.length)return null;
  const picked=eligible[Math.floor(Math.random()*eligible.length)];
  return visualContent({id:picked.id});
}

export async function uploadVisual(q,user){
  const mime=String(q.mime||'').toLowerCase();
  if(!MIMES.has(mime))throw httpError(400,'Envie uma imagem JPEG, PNG ou WebP.');
  const bytes=Buffer.from(String(required(q.base64,'imagem')),'base64');
  if(!bytes.length||bytes.length>1200*1024)throw httpError(400,'A imagem otimizada deve ter no máximo 1,2 MB.');
  const extension=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
  const base=String(q.nome||'imagem').replace(/\.[^.]+$/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._ -]/g,' ').replace(/\s+/g,' ').trim().slice(0,100)||'imagem';
  const object=PREFIX+Date.now()+'_'+crypto.randomUUID().slice(0,8)+'_'+base+'.'+extension;
  await bucket.file(object).save(bytes,{
    contentType:mime,resumable:false,
    metadata:{metadata:{
      ativo:String(q.ativo!==false),
      usos:JSON.stringify(Array.isArray(q.usos)?q.usos:['LOGIN','PAINEL']),
      legenda:String(q.legenda||''),
      ordem:String(Number(q.ordem||0)),
      uploadedBy:String(user.email||'')
    }}
  });
  return {imagem:await objectRow(bucket.file(object)),mensagem:'Imagem salva no Cloud Storage.'};
}

export async function saveVisualMeta(q){
  const object=objectFromId(required(q.id,'imagem'));
  if(!object)throw httpError(404,'Imagem não localizada.');
  const file=bucket.file(object);
  const [meta]=await file.getMetadata();
  await file.setMetadata({
    metadata:{
      ...(meta.metadata||{}),
      ativo:String(q.ativo!==false),
      usos:JSON.stringify(Array.isArray(q.usos)?q.usos:defaultUses(object)),
      legenda:String(q.legenda||''),
      ordem:String(Number(q.ordem||0))
    }
  });
  return {imagem:await objectRow(file),mensagem:'Imagem atualizada.'};
}

export async function deleteVisual(q){
  const object=objectFromId(required(q.id,'imagem'));
  if(!object)throw httpError(404,'Imagem não localizada.');
  await bucket.file(object).delete({ignoreNotFound:true});
  return {ok:true,mensagem:'Imagem excluída.'};
}
