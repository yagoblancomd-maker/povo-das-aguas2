import ExcelJS from 'exceljs';

const file='C:/Users/yagof/PovoDasAguasCloud/PDA-Banco-snapshot.xlsx';
const wb=new ExcelJS.Workbook();
await wb.xlsx.readFile(file);

function rows(name){
  const sh=wb.getWorksheet(name);
  if(!sh)return [];
  const headers=[];
  sh.getRow(1).eachCell({includeEmpty:true},(c,i)=>headers[i-1]=String(c.value??''));
  const out=[];
  sh.eachRow({includeEmpty:false},(row,n)=>{
    if(n===1)return;
    const obj={};
    let any=false;
    for(let i=1;i<=headers.length;i++){
      const h=headers[i-1]; if(!h)continue;
      let v=row.getCell(i).value;
      if(v&&typeof v==='object'){
        if(v instanceof Date)v=v.toISOString();
        else if(Object.prototype.hasOwnProperty.call(v,'result'))v=v.result;
        else if(Array.isArray(v.richText))v=v.richText.map(x=>x.text||'').join('');
        else if(v.text!==undefined)v=v.text;
      }
      if(v!==''&&v!==null&&v!==undefined)any=true;
      obj[h]=v??'';
    }
    if(any)out.push(obj);
  });
  return out;
}

const people=rows('Pessoas');
const personIds=new Set(people.map(r=>String(r.id||'')));

const checks={};
for(const name of ['Atendimentos','Tarefas','Processos']){
  const data=rows(name);
  const orphan=data.filter(r=>String(r.pessoaId||'')&&!personIds.has(String(r.pessoaId)));
  checks[name]={
    total:data.length,
    valid:data.length-orphan.length,
    orphanCount:orphan.length,
    orphans:orphan.map(r=>({
      id:r.id||'',
      pessoaId:r.pessoaId||'',
      tipo:r.tipo||'',
      titulo:r.titulo||'',
      numero:r.numero||'',
      responsavel:r.responsavel||'',
      situacao:r.situacao||'',
      criadoEm:r.criadoEm||''
    }))
  };
}

const documents=rows('Documentos');
const personOwnerPrefix='PESSOA:';
const docOrphans=documents.filter(r=>{
  const owner=String(r.atendimentoId||'');
  if(!owner.startsWith(personOwnerPrefix))return false;
  return !personIds.has(owner.slice(personOwnerPrefix.length));
});
checks.Documentos={
  total:documents.length,
  directPersonOwnerOrphanCount:docOrphans.length,
  orphans:docOrphans.map(r=>({
    id:r.id||'',
    atendimentoId:r.atendimentoId||'',
    categoria:r.categoria||'',
    nome:r.nome||''
  }))
};

console.log(JSON.stringify({
  people:people.map(r=>({id:r.id,nome:r.nome,cpf:r.cpf})),
  checks
},null,2));
