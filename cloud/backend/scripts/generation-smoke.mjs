import {Storage} from '@google-cloud/storage';
import PizZip from 'pizzip';
import {all,canWritePersonContent} from '../src/core.mjs';
import {permissions} from '../src/access.mjs';
import {executeAction} from '../src/actions.mjs';
import {closeDb} from '../src/db.mjs';

const NOTE='O relatório registra apenas o conteúdo disponibilizado pela API oficial no momento da consulta.';
const storage=new Storage();
const bucket=storage.bucket(process.env.STORAGE_BUCKET);

function wordText(bytes){
  const zip=new PizZip(bytes);
  const xml=zip.file('word/document.xml')?.asText()||'';
  return xml
    .replace(/<w:tab\/?[^>]*>/g,'\t')
    .replace(/<\/w:p>/g,'\n')
    .replace(/<[^>]+>/g,'')
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"')
    .replace(/&apos;/g,"'")
    .replace(/\s+/g,' ')
    .trim();
}

async function gcsBytes(ref){
  if(!String(ref||'').startsWith('gcs:'))throw new Error('Referencia GCS ausente.');
  return (await bucket.file(String(ref).slice(4)).download())[0];
}

const users=(await all('Usuarios')).filter(u=>u.ativo===true||u.ativo==='true');
const creator=users.find(u=>(permissions(u)||[]).includes('cadastro'));
if(!creator)throw new Error('Nenhum usuario com permissao de cadastro.');

const people=await all('Pessoas');
const docs=await all('Documentos');
const person=people.find(p=>
  canWritePersonContent(creator,p)&&
  !docs.some(d=>
    d.atendimentoId==='PESSOA:'+p.id&&
    d.categoria==='RELATORIO_SEGURO_DEFESO_2025'&&
    (d.vigente===true||d.vigente==='true')
  )
)||people.find(p=>canWritePersonContent(creator,p));
if(!person)throw new Error('Nenhuma pessoa ficticia editavel.');

const op='SMOKE_GEN_'+Date.now();
const report=await executeAction('seguroDefesoRelatorioGerar',{
  pessoaId:person.id,
  op:op+'_REPORT'
},creator);

const reportDocs=report.documentos||[report.documento].filter(Boolean);
const pdfReportDoc=reportDocs.find(d=>d.mime==='application/pdf');
const docxReportDoc=reportDocs.find(d=>String(d.mime||'').includes('wordprocessingml.document'));

const reportPdfContent=await executeAction('documentoConteudo',{
  pessoaId:person.id,
  id:pdfReportDoc?.id
},creator);
const reportDocxContent=await executeAction('documentoConteudo',{
  pessoaId:person.id,
  id:docxReportDoc?.id
},creator);

const reportPdfBytes=Buffer.from(reportPdfContent.base64||'','base64');
const reportDocxBytes=Buffer.from(reportDocxContent.base64||'','base64');
const reportText=wordText(reportDocxBytes);
const noteOccurrences=reportText.split(NOTE).length-1;

const initial=await executeAction('pessoaInicialGerar',{
  pessoaId:person.id,
  op:op+'_INITIAL'
},creator);
const generated=initial.minutaBase;
const initialPdfDoc=generated?.documento;
const initialMinuta=generated?.minuta;

const initialPdfContent=await executeAction('documentoConteudo',{
  pessoaId:person.id,
  id:initialPdfDoc?.id
},creator);
const initialPdfBytes=Buffer.from(initialPdfContent.base64||'','base64');
const initialDocxBytes=await gcsBytes(initialMinuta?.fileId);
const initialText=wordText(initialDocxBytes);

const entity=person.entidade==='Outro'?(person.outraEntidade||'Outro'):(person.entidade||'');
const parcels=Number(person.parcelasNaoRecebidas||0);
const reportActive=(await all('Documentos')).filter(d=>
  d.atendimentoId==='PESSOA:'+person.id&&
  d.categoria==='RELATORIO_SEGURO_DEFESO_2025'&&
  (d.vigente===true||d.vigente==='true')
);

const out={
  pessoa:{id:person.id,nome:person.nome,cpf:person.cpf,jurisdicao:person.jurisdicao,entidade:entity,parcelas:parcels},
  report:{
    quantidade:report.quantidade,
    docs:reportDocs.map(d=>({id:d.id,nome:d.nome,mime:d.mime,fileId:d.fileId,observacoes:d.observacoes})),
    activeCount:reportActive.length,
    pdfHeader:reportPdfBytes.subarray(0,5).toString(),
    docxHasDocumentXml:!!new PizZip(reportDocxBytes).file('word/document.xml'),
    noteOccurrences
  },
  initial:{
    pdfName:initialPdfDoc?.nome||'',
    pdfHeader:initialPdfBytes.subarray(0,5).toString(),
    docxFileId:initialMinuta?.fileId||'',
    containsName:initialText.includes(String(person.nome||'').toUpperCase()),
    containsEntity:!!entity&&initialText.includes(entity),
    containsJurisdiction:!!person.jurisdicao&&initialText.includes(person.jurisdicao),
    containsParcels:initialText.includes(String(parcels)+' ('),
    containsMinimumWageFormula:initialText.includes('salário mínimo de R$ 1.518,00'),
    noPlaceholders:!initialText.includes('<<'),
    hasJefAddress:initialText.includes('AO JUÍZO FEDERAL DO JUIZADO ESPECIAL FEDERAL')
  }
};

out.ok=
  reportDocs.length===2&&
  !!pdfReportDoc&&
  !!docxReportDoc&&
  out.report.activeCount===2&&
  out.report.pdfHeader==='%PDF-'&&
  out.report.docxHasDocumentXml&&
  out.report.noteOccurrences===1&&
  reportDocs.every(d=>d.observacoes===NOTE&&String(d.fileId||'').startsWith('gcs:'))&&
  String(out.initial.pdfName).startsWith('INI.'+person.jurisdicao+'.')&&
  out.initial.pdfHeader==='%PDF-'&&
  String(out.initial.docxFileId).startsWith('gcs:')&&
  out.initial.containsName&&
  out.initial.containsEntity&&
  out.initial.containsJurisdiction&&
  out.initial.containsParcels&&
  out.initial.containsMinimumWageFormula&&
  out.initial.noPlaceholders&&
  out.initial.hasJefAddress;

console.log('GENERATION_SMOKE='+JSON.stringify(out));
await closeDb();
if(!out.ok)process.exit(2);
