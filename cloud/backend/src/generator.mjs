import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {PassThrough} from 'node:stream';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import PDFDocument from 'pdfkit';
import archiver from 'archiver';
import {Storage} from '@google-cloud/storage';
import {
  STORAGE_BUCKET,SALARIO_MINIMO_2025,httpError,all,get,findOne,change,config,id,randomId,
  now,bool,moneyBR,address,personOwnerKey,docLabel,sha,causeValue
} from './core.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const storage=new Storage();
const bucket=storage.bucket(STORAGE_BUCKET);
const INITIAL_CAT='INICIAL_SEGURO_DEFESO_2025';
const REPORT_CAT='RELATORIO_SEGURO_DEFESO_2025';
const MODEL_STATUS_CACHE_TTL_MS=30000;
let modelStatusCache={expiresAt:0,value:null};

function safeName(value){
  return String(value||'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,140)||'arquivo';
}
function cpfMask(cpf){
  const s=String(cpf||'').replace(/\D/g,'');
  return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
}
function parcelasText(n){
  const words={1:'uma',2:'duas',3:'três',4:'quatro'};
  const x=Number(n||0);return x+' ('+(words[x]||x)+') parcela'+(x===1?'':'s');
}
function initialData(p){
  const n=Number(p.parcelasNaoRecebidas||0),value=causeValue(n);
  const valueText=moneyBR(value)+' ('+n+' parcela'+(n===1?'':'s')+' não paga'+(n===1?'':'s')+' × salário mínimo de R$ '+moneyBR(SALARIO_MINIMO_2025)+')';
  const city=[p.cidade,p.uf].filter(Boolean).join('/');
  const jurisdiction=String(p.jurisdicao||'').trim();
  const localDate=new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date());
  const common={
    'JURISDIÇÃO':jurisdiction,'JURISDICAO':jurisdiction,
    ENDERECAMENTO:'AO JUÍZO FEDERAL DO JUIZADO ESPECIAL FEDERAL',
    SECAO_JUDICIARIA:jurisdiction?('DA SUBSEÇÃO JUDICIÁRIA DE '+jurisdiction+'/RS'):'',
    LOCAL_DATA:(p.cidade||jurisdiction||'')+', '+localDate,
    NOME:String(p.nome||''),NOME_COMPLETO:String(p.nome||'').toUpperCase(),'NOME COMPLETO':String(p.nome||'').toUpperCase(),
    CPF:cpfMask(p.cpf),NASCIMENTO:p.nascimento||'',DATA_NASCIMENTO:p.nascimento||'',EMAIL:p.email||'',
    ENDERECO:address(p),'ENDEREÇO':address(p),CEP:p.cep||'',BAIRRO:p.bairro||'',VIA:[p.tipoVia,p.via].filter(Boolean).join(' '),
    NUMERO:p.numero||'',COMPLEMENTO:p.complemento||'',
    CIDADE_UF:city,CIDADE:city,MUNICIPIO:p.cidade||'',MUNICÍPIO:p.cidade||'',UF:p.uf||'',TELEFONE:p.telefone||'',
    ENTIDADE:p.entidade==='Outro'?(p.outraEntidade||'Outro'):(p.entidade||''),
    PARCELAS_NAO_RECEBIDAS:parcelasText(n),'PARCELAS QUE NÃO RECEBEU':parcelasText(n),
    VALOR_CAUSA:valueText,'##VALOR':valueText
  };
  return common;
}
function renderTemplate(bytes,data){
  let zip;
  try{zip=new PizZip(bytes);}catch{throw httpError(400,'O modelo DOCX é inválido ou está corrompido.');}
  let doc;
  try{
    doc=new Docxtemplater(zip,{paragraphLoop:true,linebreaks:true,delimiters:{start:'<<',end:'>>'},nullGetter:()=>''});
    doc.render(data);
  }catch(e){
    const detail=e?.properties?.explanation||e?.message||String(e);
    throw httpError(422,'Não foi possível preencher o modelo DOCX: '+detail);
  }
  return Buffer.from(doc.getZip().generate({type:'nodebuffer',compression:'DEFLATE'}));
}
function docxText(bytes){
  try{
    const zip=new PizZip(bytes),xml=zip.file('word/document.xml')?.asText()||'';
    return xml.replace(/<w:tab\/?[^>]*>/g,'\t').replace(/<\/w:p>/g,'\n').replace(/<\/w:tc>/g,'\t')
      .replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/\n{3,}/g,'\n\n').trim();
  }catch{return '';}
}
async function pdfFromText(title,text){
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margins:{top:54,bottom:54,left:58,right:58},info:{Title:title}});
    const chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
    doc.font('Times-Bold').fontSize(13).text(title,{align:'center'}).moveDown(1.3);
    doc.font('Times-Roman').fontSize(11).text(text||title,{align:'justify',lineGap:2});
    doc.end();
  });
}
const REPORT_NOTE='O relatório registra apenas o conteúdo disponibilizado pela API oficial no momento da consulta.';
function xmlEscape(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function docxParagraph(text,{bold=false}={}){
  const runProps=bold?'<w:rPr><w:b/></w:rPr>':'';
  return '<w:p><w:r>'+runProps+'<w:t xml:space="preserve">'+xmlEscape(text)+'</w:t></w:r></w:p>';
}
function docxReport(p,consulta){
  const rows=consulta.registros||[];
  const paragraphs=[
    docxParagraph('POVO DAS ÁGUAS',{bold:true}),
    docxParagraph('Relatório Seguro-Defeso 2025',{bold:true}),
    docxParagraph('Pessoa: '+(p.nome||'-')),
    docxParagraph('CPF: '+cpfMask(p.cpf)),
    docxParagraph('Município: '+[p.cidade,p.uf].filter(Boolean).join(' / ')),
    docxParagraph('Consulta: '+new Date(consulta.consultadoEm||Date.now()).toLocaleString('pt-BR')),
    docxParagraph('Fonte: '+consulta.fonte),
    docxParagraph('Registros localizados: '+consulta.quantidade+' · Valor total: R$ '+moneyBR(consulta.valorTotal),{bold:true})
  ];
  for(const r of rows){
    paragraphs.push(
      docxParagraph('Parcela '+(r.parcela||'-')+' · '+(r.dataMesReferencia||'-'),{bold:true}),
      docxParagraph('Situação: '+(r.situacao||'-')+' · Valor: R$ '+moneyBR(r.valor)+' · Saque: '+(r.dataSaque||'-'))
    );
    if(r.rgp)paragraphs.push(docxParagraph('RGP: '+r.rgp));
  }
  paragraphs.push(docxParagraph(REPORT_NOTE));
  const zip=new PizZip();
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+paragraphs.join('')+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>');
  return Buffer.from(zip.generate({type:'nodebuffer',compression:'DEFLATE'}));
}
async function pdfReport(p,consulta){
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margins:{top:45,bottom:45,left:45,right:45},info:{Title:'Relatório Seguro-Defeso 2025 - '+p.nome}});
    const chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
    const line=(label,value)=>{doc.font('Helvetica-Bold').text(label+': ',{continued:true});doc.font('Helvetica').text(String(value||'—'));};
    doc.font('Helvetica-Bold').fontSize(16).text('POVO DAS ÁGUAS',{align:'center'});
    doc.fontSize(13).text('Relatório Seguro-Defeso 2025',{align:'center'}).moveDown();
    doc.fontSize(10);line('Pessoa',p.nome);line('CPF',cpfMask(p.cpf));line('Município',p.cidade+' / '+p.uf);line('Consulta',new Date(consulta.consultadoEm||Date.now()).toLocaleString('pt-BR'));line('Fonte',consulta.fonte);
    doc.moveDown().font('Helvetica-Bold').text('Registros localizados: '+consulta.quantidade+' · Valor total: R$ '+moneyBR(consulta.valorTotal)).moveDown(.5);
    const rows=consulta.registros||[];
    for(const r of rows){
      if(doc.y>720)doc.addPage();
      doc.font('Helvetica-Bold').fontSize(9).text('Parcela '+(r.parcela||'—')+' · '+(r.dataMesReferencia||'—'),{continued:false});
      doc.font('Helvetica').fontSize(9).text('Situação: '+(r.situacao||'—')+' · Valor: R$ '+moneyBR(r.valor)+' · Saque: '+(r.dataSaque||'—'));
      if(r.rgp)doc.text('RGP: '+r.rgp);
      doc.moveDown(.45);
    }
    doc.moveDown().fontSize(8).fillColor('#555').text(REPORT_NOTE,{align:'justify'});
    doc.end();
  });
}
async function putObject(name,bytes,mime,meta={}){
  const file=bucket.file(name);
  await file.save(bytes,{contentType:mime,resumable:false,metadata:{metadata:meta}});
  return 'gcs:'+name;
}
async function setConfig(client,ctx,key,value){
  const old=await findOne('Configuracoes','chave=$1',[key],client);
  return change(client,ctx,'Configuracoes',old?.id||id('CFG',key),{chave:key,valor:JSON.stringify(value)},old?.versao);
}
export async function modelStatus(client){
  if(!client&&modelStatusCache.value&&modelStatusCache.expiresAt>Date.now())return modelStatusCache.value;
  const c=await config(client);
  const configured=String(c.templateId||'').startsWith('gcs:');
  let name=configured?'Modelo DOCX ativo no Google Cloud':'Modelo padrão embarcado';
  if(configured){try{const [m]=await bucket.file(String(c.templateId).slice(4)).getMetadata();name=m.metadata?.originalName||name;}catch{}}
  const result={configurado:true,aprovado:configured?bool(c.templateAprovado):true,nome:name,origem:configured?'Cloud Storage':'Modelo padrão da migração'};
  if(!client)modelStatusCache={value:result,expiresAt:Date.now()+MODEL_STATUS_CACHE_TTL_MS};
  return result;
}
export async function uploadModel(q,user,client,ctx){
  const mime=String(q.mime||'');
  if(mime!=='application/vnd.openxmlformats-officedocument.wordprocessingml.document')throw httpError(400,'Envie um arquivo DOCX.');
  const bytes=Buffer.from(String(q.base64||''),'base64');
  if(!bytes.length||bytes.length>10*1024*1024)throw httpError(400,'O modelo DOCX deve ter no máximo 10 MB.');
  let zip;try{zip=new PizZip(bytes);}catch{throw httpError(400,'O arquivo não é um DOCX válido.');}
  const text=Object.values(zip.files).filter(f=>/^word\/.*\.xml$/.test(f.name)).map(f=>{try{return f.asText().replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'");}catch{return '';}}).join(' ');
  const alternatives=[
    ['NOME_COMPLETO','NOME COMPLETO'],['CPF'],['ENDERECO','ENDEREÇO'],['CIDADE_UF','CIDADE'],
    ['TELEFONE'],['ENTIDADE'],['JURISDICAO','JURISDIÇÃO','ENDERECAMENTO','SECAO_JUDICIARIA'],['LOCAL_DATA'],
    ['PARCELAS_NAO_RECEBIDAS','PARCELAS QUE NÃO RECEBEU'],['VALOR_CAUSA','##VALOR']
  ];
  const missing=alternatives.filter(group=>!group.some(tag=>text.includes('<<'+tag+'>>'))).map(g=>g[0]);
  if(missing.length)throw httpError(400,'O modelo não contém os marcadores obrigatórios: '+missing.join(', ')+'.');
  const object='templates/modelo-ativo-'+Date.now()+'.docx';
  await putObject(object,bytes,mime,{originalName:String(q.nome||'modelo.docx').slice(0,180),uploadedBy:user.email});
  await setConfig(client,ctx,'templateId','gcs:'+object);
  await setConfig(client,ctx,'templateAprovado',true);
  modelStatusCache={expiresAt:0,value:null};
  return {configurado:true,aprovado:true,nome:q.nome||'modelo.docx',mensagem:'Modelo DOCX enviado e ativado no Google Cloud.'};
}
const MODEL_CATALOG_KEY='modelosDocumentos';
const SYSTEM_MODEL_CONFIG_KEY='modeloSistemaInicial';
export const SYSTEM_MODEL_ID='SISTEMA_INICIAL_SEGURO_DEFESO_2025';
const SYSTEM_DEFAULT_PLACEHOLDERS=Object.freeze([
  'JURISDIÇÃO','NOME_COMPLETO','CPF','ENDEREÇO','CIDADE_UF','TELEFONE',
  'ENTIDADE','PARCELAS_NAO_RECEBIDAS','VALOR_CAUSA','LOCAL_DATA'
]);

function extractPlaceholders(bytes){
  try{
    const zip=new PizZip(bytes);
    const text=Object.values(zip.files)
      .filter(f=>/^word\/.*\.xml$/.test(f.name))
      .map(f=>{try{return f.asText().replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');}catch{return '';}})
      .join(' ');
    return [...new Set([...text.matchAll(/<<\s*([^<>]+?)\s*>>/g)].map(m=>String(m[1]||'').trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));
  }catch{return [];}
}

function catalogModels(c){
  return Array.isArray(c?.[MODEL_CATALOG_KEY])?c[MODEL_CATALOG_KEY].filter(Boolean):[];
}

function normalizeList(value){
  if(Array.isArray(value))return [...new Set(value.map(x=>String(x||'').trim()).filter(Boolean))];
  return [...new Set(String(value||'').split(/[;,\n]/).map(x=>x.trim()).filter(Boolean))];
}

function modelApplicable(model,p,context={}){
  const normalize=value=>String(value||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const jurisdictions=normalizeList(model.jurisdicoes).map(normalize);
  const entities=normalizeList(model.entidades).map(normalize);
  const origins=normalizeList(model.origensCadastro).map(normalize);
  const parcels=normalizeList(model.parcelas).map(value=>String(value||'').trim()).filter(Boolean);
  const demands=normalizeList(model.demandas).map(normalize);
  const personEntity=normalize(p.entidade==='Outro'?(p.outraEntidade||'Outro'):(p.entidade||''));
  const jurisdiction=normalize(p.jurisdicao);
  const origin=normalize(p.origemCadastro||'INTERNA');
  const parcel=String(p.parcelasNaoRecebidas||'').trim();
  const demand=normalize(context.demanda||'Seguro-Defeso 2025');
  return (!jurisdictions.length||jurisdictions.includes(jurisdiction))&&
    (!entities.length||entities.includes(personEntity))&&
    (!origins.length||origins.includes(origin))&&
    (!parcels.length||parcels.includes(parcel))&&
    (!demands.length||demands.includes(demand));
}

function systemModelFromConfig(c,status){
  const raw=
    c?.[SYSTEM_MODEL_CONFIG_KEY]&&
    typeof c[SYSTEM_MODEL_CONFIG_KEY]==='object'&&
    !Array.isArray(c[SYSTEM_MODEL_CONFIG_KEY])
      ?c[SYSTEM_MODEL_CONFIG_KEY]
      :{};

  const configuredFile=
    String(c?.templateId||'')
      .startsWith('gcs:');

  const placeholders=
    normalizeList(raw.placeholders);

  const automatic=
    raw.automatico===undefined
      ?true
      :bool(raw.automatico);

  return {
    id:SYSTEM_MODEL_ID,
    nome:String(
      raw.nome||
      'Petição inicial - Seguro-Defeso 2025'
    ),
    descricao:String(
      raw.descricao||
      'Modelo principal do sistema para a petição inicial do Seguro-Defeso 2025.'
    ),
    categoria:String(
      raw.categoria||
      'PETICAO_INICIAL'
    ),
    finalidade:String(
      raw.finalidade||
      'Petição inicial'
    ),
    jurisdicoes:normalizeList(raw.jurisdicoes),
    entidades:normalizeList(raw.entidades),
    origensCadastro:normalizeList(raw.origensCadastro),
    parcelas:normalizeList(raw.parcelas),
    demandas:normalizeList(
      raw.demandas?.length
        ?raw.demandas
        :['Seguro-Defeso 2025']
    ),
    automatico:automatic,
    gatilho:automatic
      ?'CONCLUSAO_CADASTRO'
      :'MANUAL',
    ativo:raw.ativo===undefined
      ?true
      :bool(raw.ativo),
    sistema:true,
    principal:true,
    versao:Math.max(
      1,
      Number(raw.versao||1)
    ),
    placeholders:placeholders.length
      ?placeholders
      :[...SYSTEM_DEFAULT_PLACEHOLDERS],
    arquivoNome:String(
      raw.arquivoNome||
      status.nome||
      'modelo.docx'
    ),
    origem:configuredFile
      ?'Cloud Storage'
      :status.origem,
    fileId:configuredFile
      ?String(c.templateId)
      :'default',
    criadoEm:raw.criadoEm||'',
    criadoPor:raw.criadoPor||'',
    alteradoEm:raw.alteradoEm||'',
    alteradoPor:raw.alteradoPor||''
  };
}

export async function listDocumentModels(client){
  const c=await config(client);
  const status=await modelStatus(client);
  const system=
    systemModelFromConfig(
      c,
      status
    );

  const customs=catalogModels(c).map(model=>({
    ...model,
    sistema:false,
    principal:model.principal===true,
    ativo:model.ativo!==false,
    automatico:model.automatico===true,
    gatilho:model.automatico===true?'CONCLUSAO_CADASTRO':'MANUAL',
    jurisdicoes:normalizeList(model.jurisdicoes),
    entidades:normalizeList(model.entidades),
    origensCadastro:normalizeList(model.origensCadastro),
    parcelas:normalizeList(model.parcelas),
    demandas:normalizeList(model.demandas),
    placeholders:normalizeList(model.placeholders)
  }));

  return [system,...customs];
}

export async function saveDocumentModel(q,user,client,ctx){
  const c=await config(client);
  const models=catalogModels(c);
  const modelId=String(q.id||'').trim()||randomId('MOD');

  if(modelId===SYSTEM_MODEL_ID){
    const status=await modelStatus(client);
    const prior=
      systemModelFromConfig(
        c,
        status
      );

    const nome=
      String(
        q.nome||
        prior.nome||
        ''
      ).trim();

    if(!nome){
      throw httpError(
        400,
        'Informe o nome do modelo.'
      );
    }

    let fileId=
      String(
        prior.fileId||
        'default'
      );

    let fileName=
      String(
        prior.arquivoNome||
        'modelo.docx'
      );

    let placeholders=
      normalizeList(
        prior.placeholders
      );

    let version=
      Math.max(
        1,
        Number(
          prior.versao||
          1
        )
      );

    if(q.base64){
      const mime=
        String(
          q.mime||
          ''
        );

      if(
        mime!==
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ){
        throw httpError(
          400,
          'Envie um arquivo DOCX.'
        );
      }

      const bytes=
        Buffer.from(
          String(
            q.base64||
            ''
          ),
          'base64'
        );

      if(
        !bytes.length||
        bytes.length>10*1024*1024
      ){
        throw httpError(
          400,
          'O modelo DOCX deve ter no máximo 10 MB.'
        );
      }

      try{
        new PizZip(bytes);
      }catch{
        throw httpError(
          400,
          'O arquivo não é um DOCX válido.'
        );
      }

      placeholders=
        extractPlaceholders(bytes);

      if(!placeholders.length){
        throw httpError(
          400,
          'O modelo não possui placeholders no formato <<CAMPO>>.'
        );
      }

      version+=1;
      fileName=
        String(
          q.arquivoNome||
          q.nomeArquivo||
          nome+'.docx'
        ).slice(
          0,
          180
        );

      const object=
        'templates/system/'+
        SYSTEM_MODEL_ID+
        '/v'+
        version+
        '-'+
        Date.now()+
        '.docx';

      fileId=
        await putObject(
          object,
          bytes,
          mime,
          {
            modelId:
              SYSTEM_MODEL_ID,
            version:
              String(version),
            originalName:
              fileName,
            uploadedBy:
              user.email
          }
        );

      await setConfig(
        client,
        ctx,
        'templateId',
        fileId
      );

      await setConfig(
        client,
        ctx,
        'templateAprovado',
        true
      );

      modelStatusCache={
        expiresAt:0,
        value:null
      };
    }

    const automatic=
      q.automatico===undefined
        ?prior.automatico===true
        :bool(q.automatico);

    const saved={
      id:
        SYSTEM_MODEL_ID,
      nome,
      descricao:
        String(
          q.descricao??
          prior.descricao??
          ''
        )
          .trim()
          .slice(0,1500),
      categoria:
        String(
          q.categoria||
          prior.categoria||
          'PETICAO_INICIAL'
        )
          .trim()
          .toUpperCase()
          .slice(0,80),
      finalidade:
        String(
          q.finalidade||
          prior.finalidade||
          'Petição inicial'
        )
          .trim()
          .slice(0,180),
      jurisdicoes:
        normalizeList(
          q.jurisdicoes??
          prior.jurisdicoes
        ),
      entidades:
        normalizeList(
          q.entidades??
          prior.entidades
        ),
      origensCadastro:
        normalizeList(
          q.origensCadastro??
          prior.origensCadastro
        ),
      parcelas:
        normalizeList(
          q.parcelas??
          prior.parcelas
        )
          .filter(
            value=>
              ['1','2','3','4']
                .includes(
                  String(value)
                )
          ),
      demandas:
        normalizeList(
          q.demandas??
          prior.demandas
        ),
      automatico:
        automatic,
      gatilho:
        automatic
          ?'CONCLUSAO_CADASTRO'
          :'MANUAL',
      ativo:
        q.ativo===undefined
          ?prior.ativo!==false
          :bool(q.ativo),
      sistema:true,
      principal:true,
      fileId,
      arquivoNome:
        fileName,
      placeholders,
      versao:
        version,
      criadoEm:
        prior.criadoEm||
        now(),
      criadoPor:
        prior.criadoPor||
        user.email,
      alteradoEm:
        now(),
      alteradoPor:
        user.email
    };

    await setConfig(
      client,
      ctx,
      SYSTEM_MODEL_CONFIG_KEY,
      saved
    );

    return {
      modelo:saved,
      mensagem:
        q.base64
          ?'Modelo principal atualizado e nova versão DOCX ativada.'
          :'Configurações do modelo principal atualizadas.'
    };
  }

  const index=models.findIndex(m=>m.id===modelId);
  const prior=index>=0?models[index]:null;
  const nome=String(q.nome||prior?.nome||'').trim();
  if(!nome)throw httpError(400,'Informe o nome do modelo.');
  const descricao=String(q.descricao??prior?.descricao??'').trim().slice(0,1500);
  const categoria=String(q.categoria||prior?.categoria||'OUTRO').trim().toUpperCase().slice(0,80);
  const finalidade=String(q.finalidade||prior?.finalidade||'').trim().slice(0,180);
  let fileId=String(prior?.fileId||'');
  let fileName=String(prior?.arquivoNome||'');
  let placeholders=normalizeList(prior?.placeholders);
  let version=Math.max(1,Number(prior?.versao||0));

  if(q.base64){
    const mime=String(q.mime||'');
    if(mime!=='application/vnd.openxmlformats-officedocument.wordprocessingml.document')throw httpError(400,'Envie um arquivo DOCX.');
    const bytes=Buffer.from(String(q.base64||''),'base64');
    if(!bytes.length||bytes.length>10*1024*1024)throw httpError(400,'O modelo DOCX deve ter no máximo 10 MB.');
    try{new PizZip(bytes);}catch{throw httpError(400,'O arquivo não é um DOCX válido.');}
    placeholders=extractPlaceholders(bytes);
    if(!placeholders.length)throw httpError(400,'O modelo não possui placeholders no formato <<CAMPO>>.');
    version=prior?version+1:1;
    fileName=String(q.arquivoNome||q.nomeArquivo||nome+'.docx').slice(0,180);
    const object='templates/catalog/'+modelId+'/v'+version+'-'+Date.now()+'.docx';
    fileId=await putObject(object,bytes,mime,{modelId,version:String(version),originalName:fileName,uploadedBy:user.email});
  }else if(!prior){
    throw httpError(400,'Envie o arquivo DOCX do novo modelo.');
  }

  const saved={
    id:modelId,
    nome,
    descricao,
    categoria,
    finalidade,
    jurisdicoes:normalizeList(q.jurisdicoes??prior?.jurisdicoes),
    entidades:normalizeList(q.entidades??prior?.entidades),
    origensCadastro:normalizeList(q.origensCadastro??prior?.origensCadastro),
    parcelas:normalizeList(q.parcelas??prior?.parcelas)
      .filter(value=>['1','2','3','4'].includes(String(value))),
    demandas:normalizeList(q.demandas??prior?.demandas),
    automatico:q.automatico===undefined?(prior?.automatico===true):bool(q.automatico),
    gatilho:(q.automatico===undefined?(prior?.automatico===true):bool(q.automatico))
      ?'CONCLUSAO_CADASTRO'
      :'MANUAL',
    ativo:q.ativo===undefined?(prior?.ativo!==false):bool(q.ativo),
    fileId,
    arquivoNome:fileName,
    placeholders,
    versao:version,
    criadoEm:prior?.criadoEm||now(),
    criadoPor:prior?.criadoPor||user.email,
    alteradoEm:now(),
    alteradoPor:user.email
  };
  if(index>=0)models[index]=saved;else models.push(saved);
  await setConfig(client,ctx,MODEL_CATALOG_KEY,models);
  return {modelo:saved,mensagem:prior?'Modelo atualizado.':'Modelo adicionado ao Hub de Minutas.'};
}

export async function setDocumentModelActive(q,user,client,ctx){
  const c=await config(client);
  const modelId=
    String(
      q.id||
      ''
    );

  if(modelId===SYSTEM_MODEL_ID){
    const status=
      await modelStatus(client);

    const prior=
      systemModelFromConfig(
        c,
        status
      );

    const saved={
      ...prior,
      ativo:bool(q.ativo),
      alteradoEm:now(),
      alteradoPor:user.email
    };

    await setConfig(
      client,
      ctx,
      SYSTEM_MODEL_CONFIG_KEY,
      saved
    );

    return {
      modelo:saved,
      mensagem:saved.ativo
        ?'Modelo principal ativado.'
        :'Modelo principal inativado. Ele não será usado na geração automática.'
    };
  }

  const models=catalogModels(c);
  const index=models.findIndex(m=>m.id===modelId);
  if(index<0)throw httpError(404,'Modelo não localizado.');
  models[index]={...models[index],ativo:bool(q.ativo),alteradoEm:now(),alteradoPor:user.email};
  await setConfig(client,ctx,MODEL_CATALOG_KEY,models);
  return {modelo:models[index],mensagem:models[index].ativo?'Modelo ativado.':'Modelo desativado.'};
}

export async function deleteDocumentModel(q,user,client,ctx){
  const modelId=
    String(
      q.id||
      ''
    );

  if(modelId===SYSTEM_MODEL_ID){
    throw httpError(
      400,
      'O modelo principal do sistema não pode ser excluído. Inative-o ou substitua o arquivo DOCX.'
    );
  }

  const c=await config(client);
  const models=catalogModels(c);
  const index=models.findIndex(m=>m.id===modelId);
  if(index<0)throw httpError(404,'Modelo não localizado.');
  const [removed]=models.splice(index,1);
  await setConfig(client,ctx,MODEL_CATALOG_KEY,models);
  if(String(removed.fileId||'').startsWith('gcs:')){
    bucket.file(String(removed.fileId).slice(4)).delete({ignoreNotFound:true}).catch(()=>{});
  }
  return {id:removed.id,nome:removed.nome,mensagem:'Modelo removido do Hub. Documentos já gerados foram preservados.'};
}

export async function generateFromDocumentModel(client,ctx,p,modelId){
  const models=await listDocumentModels(client);
  const model=
    models.find(
      item=>
        item.id===
        String(
          modelId||
          ''
        )
    );

  if(!model)throw httpError(404,'Modelo não localizado.');
  if(model.ativo===false)throw httpError(400,'Este modelo está desativado.');
  if(!modelApplicable(model,p))throw httpError(403,'Este modelo não se aplica à jurisdição ou entidade deste cadastro.');

  if(model.sistema){
    return generateInitial(
      client,
      ctx,
      p,
      model
    );
  }

  if(!String(model.fileId||'').startsWith('gcs:'))throw httpError(409,'O arquivo do modelo não está disponível no Cloud Storage.');

  const source=(await bucket.file(String(model.fileId).slice(4)).download())[0];
  const data=initialData(p);
  const rendered=renderTemplate(source,data);
  const stamp=Date.now();
  const base='DOC.'+safeName(String(model.nome||'MODELO').toUpperCase())+'.'+safeName(String(p.nome||'').toUpperCase());
  const docxObject='pessoas/'+p.id+'/gerados/'+base+'.'+stamp+'.docx';
  const pdfObject='pessoas/'+p.id+'/gerados/'+base+'.'+stamp+'.pdf';
  const pdf=await pdfFromText(model.nome,docxText(rendered));
  const docxRef=await putObject(docxObject,rendered,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',{pessoaId:p.id,tipo:'modelo-personalizado',modeloId:model.id});
  const pdfRef=await putObject(pdfObject,pdf,'application/pdf',{pessoaId:p.id,tipo:'modelo-personalizado',modeloId:model.id});

  const pdfId=randomId('DOC');
  const pdfDoc=await change(client,ctx,'Documentos',pdfId,{
    atendimentoId:personOwnerKey(p.id),categoria:'MODELO_GERADO',fileId:pdfRef,url:'/api/v1/files/'+pdfId,
    nome:base+'.pdf',hash:sha(pdf),mime:'application/pdf',substituiId:'',vigente:true,vencimento:'',
    terceiro:false,conferido:false,declaracaoTerceiro:false,processoCompleto:false,anexoPresente:false,rogo:false,testemunhas:false,
    observacoes:'Gerado a partir do modelo "'+model.nome+'" (versão '+model.versao+').'
  });
  const mid=randomId('MIN');
  const minuta=await change(client,ctx,'Minutas',mid,{
    atendimentoId:personOwnerKey(p.id),fileId:docxRef,url:'',numero:'',situacao:'GERADA',
    snapshot:JSON.stringify({pessoaId:p.id,geradoEm:now(),dados:data,modelo:model}),
    templateId:model.fileId,templateModified:model.alteradoEm||'',revisor:'',revisadaEm:'',pdfFileId:pdfRef,pdfUrl:'/api/v1/files/'+pdfId
  });
  return {
    modelo:model,
    documentos:[pdfDoc],
    documento:pdfDoc,
    minuta,
    docxFileId:docxRef,
    pdfFileId:pdfRef,
    mensagem:'PDF gerado e adicionado ao cadastro. A versão editável DOCX foi preservada apenas internamente na minuta.'
  };
}

async function templateBytes(client){
  const c=await config(client);
  if(String(c.templateId||'').startsWith('gcs:')){
    try{return (await bucket.file(String(c.templateId).slice(4)).download())[0];}catch{}
  }
  return fs.readFile(path.join(__dirname,'../assets/default-template.docx'));
}
async function retireCategory(client,ctx,personId,category){
  const owner=personOwnerKey(personId);
  const docs=(await all('Documentos',client)).filter(d=>d.atendimentoId===owner&&d.categoria===category&&bool(d.vigente));
  for(const d of docs)await change(client,ctx,'Documentos',d.id,{...d,vigente:false},d.versao);
}
export async function generateInitial(client,ctx,p,modelOverride=null){
  if(!p.jurisdicao)throw httpError(400,'O município informado não possui jurisdição definida para a geração da petição.');

  const systemModel=
    modelOverride||
    (await listDocumentModels(client))
      .find(
        model=>
          model.id===
          SYSTEM_MODEL_ID
      );

  if(!systemModel){
    throw httpError(
      409,
      'O modelo principal da petição inicial não está configurado.'
    );
  }

  if(systemModel.ativo===false){
    throw httpError(
      400,
      'O modelo principal da petição inicial está inativo.'
    );
  }

  if(!modelApplicable(systemModel,p)){
    throw httpError(
      403,
      'O modelo principal não se aplica a este cadastro.'
    );
  }

  const source=await templateBytes(client);
  const rendered=renderTemplate(source,initialData(p));
  const base='INI.'+safeName(p.jurisdicao)+'.'+safeName(String(p.nome||'').toUpperCase());
  const stamp=Date.now();
  const docxObject='pessoas/'+p.id+'/gerados/'+base+'.'+stamp+'.docx';
  const pdfObject='pessoas/'+p.id+'/gerados/'+base+'.'+stamp+'.pdf';
  const pdf=await pdfFromText('PETIÇÃO INICIAL — '+p.jurisdicao,docxText(rendered));
  const docxRef=await putObject(docxObject,rendered,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',{pessoaId:p.id,tipo:'peticao-inicial'});
  const pdfRef=await putObject(pdfObject,pdf,'application/pdf',{pessoaId:p.id,tipo:'peticao-inicial'});
  await retireCategory(client,ctx,p.id,INITIAL_CAT);
  const did=randomId('DOC');
  const doc=await change(client,ctx,'Documentos',did,{
    atendimentoId:personOwnerKey(p.id),categoria:INITIAL_CAT,fileId:pdfRef,url:'/api/v1/files/'+did,
    nome:base+'.pdf',hash:sha(pdf),mime:'application/pdf',substituiId:'',vigente:true,vencimento:'',
    terceiro:false,conferido:false,declaracaoTerceiro:false,processoCompleto:false,anexoPresente:false,rogo:false,testemunhas:false,
    observacoes:'PDF gerado no Google Cloud. Versão editável DOCX preservada na minuta.'
  });
  const mid=randomId('MIN');
  const minuta=await change(client,ctx,'Minutas',mid,{
    atendimentoId:personOwnerKey(p.id),fileId:docxRef,url:'',numero:'',situacao:'GERADA',
    snapshot:JSON.stringify({pessoaId:p.id,geradoEm:now(),dados:initialData(p)}),templateId:(await config(client)).templateId||'default',
    templateModified:'',revisor:'',revisadaEm:'',pdfFileId:pdfRef,pdfUrl:'/api/v1/files/'+did
  });
  return {
    modelo:systemModel,
    documento:doc,
    documentos:[doc],
    minuta,
    docxFileId:docxRef,
    pdfFileId:pdfRef,
    mensagem:'Petição inicial gerada em PDF e adicionada aos documentos da pessoa. A versão editável DOCX foi preservada apenas internamente na minuta.'
  };
}
export async function generateSeguroReport(client,ctx,p,consulta){
  const pdf=await pdfReport(p,consulta),docx=docxReport(p,consulta);
  const base='RELATORIO.SEGURO_DEFESO_2025.'+safeName(String(p.nome||'').toUpperCase());
  const stamp=Date.now();
  const pdfObject='pessoas/'+p.id+'/gerados/'+base+'.'+stamp+'.pdf';
  const docxObject='pessoas/'+p.id+'/gerados/'+base+'.'+stamp+'.docx';
  const pdfRef=await putObject(pdfObject,pdf,'application/pdf',{pessoaId:p.id,tipo:'relatorio-seguro-defeso',formato:'pdf'});
  const docxRef=await putObject(docxObject,docx,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',{pessoaId:p.id,tipo:'relatorio-seguro-defeso',formato:'docx'});
  await retireCategory(client,ctx,p.id,REPORT_CAT);
  const pdfId=randomId('DOC');
  const pdfDoc=await change(client,ctx,'Documentos',pdfId,{
    atendimentoId:personOwnerKey(p.id),categoria:REPORT_CAT,fileId:pdfRef,url:'/api/v1/files/'+pdfId,nome:base+'.pdf',
    hash:sha(pdf),mime:'application/pdf',substituiId:'',vigente:true,vencimento:'',terceiro:false,conferido:true,
    declaracaoTerceiro:false,processoCompleto:false,anexoPresente:false,rogo:false,testemunhas:false,
    observacoes:REPORT_NOTE
  });
  const docxId=randomId('DOC');
  const docxDoc=await change(client,ctx,'Documentos',docxId,{
    atendimentoId:personOwnerKey(p.id),categoria:REPORT_CAT,fileId:docxRef,url:'/api/v1/files/'+docxId,nome:base+'.docx',
    hash:sha(docx),mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',substituiId:'',vigente:true,vencimento:'',terceiro:false,conferido:true,
    declaracaoTerceiro:false,processoCompleto:false,anexoPresente:false,rogo:false,testemunhas:false,
    observacoes:REPORT_NOTE
  });
  return {...consulta,documento:pdfDoc,documentos:[pdfDoc,docxDoc],pdfFileId:pdfRef,docxFileId:docxRef,mensagem:'Relatório do Seguro-Defeso 2025 gerado em PDF e DOCX e adicionado aos documentos.'};
}
async function zipBuffer(entries){
  return new Promise((resolve,reject)=>{
    const pass=new PassThrough(),chunks=[],archive=archiver('zip',{zlib:{level:9}});
    pass.on('data',c=>chunks.push(c));pass.on('end',()=>resolve(Buffer.concat(chunks)));pass.on('error',reject);archive.on('error',reject);
    archive.pipe(pass);for(const e of entries)archive.append(e.data,{name:e.name});archive.finalize();
  });
}
export async function generateDocumentsZip(task,user){
  const p=await get('Pessoas',task.pessoaId),owner=personOwnerKey(p.id);
  const docs=(await all('Documentos')).filter(d=>d.atendimentoId===owner&&bool(d.vigente));
  if(!docs.length)throw httpError(400,'Nenhum documento vigente foi localizado para esta pessoa.');
  const entries=[];let total=0,index=0;
  for(const doc of docs){
    index++;
    let data,name=safeName(String(index).padStart(2,'0')+' - '+docLabel(doc.categoria)+' - '+(doc.nome||'documento'));
    if(String(doc.fileId||'').startsWith('gcs:')){
      try{data=(await bucket.file(String(doc.fileId).slice(4)).download())[0];}catch{continue;}
    }else if(doc.url){
      data=Buffer.from('Documento legado no Google Drive:\n'+doc.url+'\n','utf8');
      name=name+'.link.txt';
    }else continue;
    total+=data.length;if(total>45*1024*1024)throw httpError(413,'O conjunto de documentos ultrapassa 45 MB.');
    entries.push({name,data});
  }
  if(!entries.length)throw httpError(404,'Os arquivos registrados não puderam ser lidos.');
  const zip=await zipBuffer(entries),fingerprint=sha(entries.map(e=>[e.name,e.data.length]));
  const object='zips/'+task.id+'/'+fingerprint+'.zip';
  await putObject(object,zip,'application/zip',{taskId:task.id,pessoaId:p.id,createdBy:user.email});
  const key=Buffer.from(object,'utf8').toString('base64url');
  return {nome:'DOCUMENTOS.DISTRIBUICAO.'+safeName(p.nome)+'.zip',quantidade:entries.length,downloadUrl:'/api/v1/downloads/'+key,driveUrl:'',mensagem:entries.length+' documento(s) preparados para download.'};
}
export async function downloadObjectFromKey(key){
  let object='';try{object=Buffer.from(String(key||''),'base64url').toString('utf8');}catch{}
  if(!/^(zips|pessoas)\//.test(object))throw httpError(400,'Download inválido.');
  const file=bucket.file(object),[exists]=await file.exists();if(!exists)throw httpError(404,'Arquivo não localizado.');
  return file;
}
