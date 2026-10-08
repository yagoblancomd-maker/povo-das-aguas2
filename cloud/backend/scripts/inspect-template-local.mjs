import fs from 'node:fs';
import PizZip from 'pizzip';

const zip=new PizZip(fs.readFileSync('assets/default-template.docx'));
const xml=zip.file('word/document.xml').asText();

function decode(value){
  return value
    .replace(/<[^>]+>/g,'')
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"')
    .replace(/&apos;/g,"'");
}

const paragraphs=[...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
  .map((match,index)=>({index,text:decode(match[0])}));

for(const p of paragraphs){
  if(/quarta|última|terceira|parcelas? ora|parcelas? do seguro/i.test(p.text)){
    console.log(p.index+' | '+p.text);
  }
}
