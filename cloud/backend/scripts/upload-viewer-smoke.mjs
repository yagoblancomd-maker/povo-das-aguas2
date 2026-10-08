import PDFDocument from 'pdfkit';
import {all,config,canWritePersonContent} from '../src/core.mjs';
import {permissions} from '../src/access.mjs';
import {executeAction} from '../src/actions.mjs';
import {closeDb} from '../src/db.mjs';

async function pdfBuffer(){
  return await new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:50});
    const chunks=[];
    doc.on('data',chunk=>chunks.push(chunk));
    doc.on('end',()=>resolve(Buffer.concat(chunks)));
    doc.on('error',reject);
    doc.fontSize(18).text('Teste do visualizador interno');
    doc.moveDown().fontSize(11).text('PDF sintetico para validar upload, Cloud Storage, leitura em base64 e deduplicacao.');
    doc.end();
  });
}

const users=(await all('Usuarios')).filter(u=>u.ativo===true||u.ativo==='true');
const creator=users.find(u=>(permissions(u)||[]).includes('cadastro'));
if(!creator)throw new Error('Nenhum usuario com cadastro.');

const people=await all('Pessoas');
const person=people.find(p=>canWritePersonContent(creator,p));
if(!person)throw new Error('Nenhuma pessoa de teste editavel.');

const cfg=await config();
const categoria=(cfg.categorias||[]).find(x=>x!=='RESIDENCIA')||(cfg.categorias||[])[0];
if(!categoria)throw new Error('Nenhuma categoria configurada.');

const bytes=await pdfBuffer();
const payload={
  pessoaId:person.id,
  categoria,
  nome:'teste-visualizador-cloud.pdf',
  mime:'application/pdf',
  base64:bytes.toString('base64'),
  vencimento:'01/12/2026',
  terceiro:false,
  declaracaoTerceiro:false
};

const before=(await all('Documentos')).length;
const first=await executeAction('pessoaUpload',payload,creator);
const middle=(await all('Documentos')).length;
const second=await executeAction('pessoaUpload',payload,creator);
const after=(await all('Documentos')).length;

const content=await executeAction('documentoConteudo',{
  pessoaId:person.id,
  id:first.documento.id
},creator);

const downloaded=Buffer.from(content.base64||'','base64');
const out={
  user:creator.email,
  pessoa:{id:person.id,nome:person.nome},
  categoria,
  documento:first.documento.id,
  fileId:first.documento.fileId,
  uploadOk:String(first.documento.fileId||'').startsWith('gcs:'),
  contentOk:content.mime==='application/pdf'&&downloaded.subarray(0,5).toString()==='%PDF-'&&downloaded.length>100,
  dedupeOk:first.documento.id===second.documento.id&&after===middle,
  counts:{before,middle,after}
};
out.ok=out.uploadOk&&out.contentOk&&out.dedupeOk;
console.log('UPLOAD_VIEWER_SMOKE='+JSON.stringify(out));
await closeDb();
if(!out.ok)process.exit(2);
