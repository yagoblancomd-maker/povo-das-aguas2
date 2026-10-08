import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.argv[2];
const out=path.join(root,'cloud','backend','public','modules');
await fs.mkdir(out,{recursive:true});
const codes=['PAINEL','PESS','ACOMP','DEFESO','TAREFAS','MIN','DIST','PROC','PERF','ADM'];
for(const code of codes){
  const [view,style,script]=await Promise.all([
    fs.readFile(path.join(root,code+'_View.html'),'utf8'),
    fs.readFile(path.join(root,code+'_Style.html'),'utf8'),
    fs.readFile(path.join(root,code+'_Script.html'),'utf8')
  ]);
  await fs.writeFile(path.join(out,code+'.json'),JSON.stringify({view,style,script}));
  console.log(code,Buffer.byteLength(view)+Buffer.byteLength(style)+Buffer.byteLength(script));
}
