import ExcelJS from 'exceljs';
const wb=new ExcelJS.Workbook();
await wb.xlsx.readFile('C:/Users/yagof/PovoDasAguasCloud/PDA-Banco-snapshot.xlsx');

function rows(name){
  const sh=wb.getWorksheet(name); if(!sh)return [];
  const headers=[];
  sh.getRow(1).eachCell({includeEmpty:true},(c,i)=>headers[i-1]=String(c.value??''));
  const out=[];
  sh.eachRow({includeEmpty:false},(row,n)=>{
    if(n===1)return;
    const o={}; let any=false;
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
      o[h]=v??'';
    }
    if(any)out.push(o);
  });
  return out;
}

const peopleIds=new Set(rows('Pessoas').map(x=>String(x.id||'')));
const tasks=rows('Tarefas');
const validTasks=tasks.filter(t=>!t.pessoaId||peopleIds.has(String(t.pessoaId)));
const validTaskIds=new Set(validTasks.map(t=>String(t.id||'')));
const orphanTasks=tasks.filter(t=>!validTaskIds.has(String(t.id||'')));

const result={orphanTasks:orphanTasks.map(t=>({id:t.id,pessoaId:t.pessoaId,situacao:t.situacao}))};
for(const sheet of ['TarefaMensagens','TarefaAnexos','TarefaLeituras']){
  const data=rows(sheet);
  const orphan=data.filter(x=>String(x.tarefaId||'')&&!validTaskIds.has(String(x.tarefaId)));
  result[sheet]={total:data.length,orphanCount:orphan.length,orphans:orphan.map(x=>({id:x.id,tarefaId:x.tarefaId}))};
}
console.log(JSON.stringify(result,null,2));