import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2];
const files=fs.readdirSync(root).filter(x=>/_Script\.html$/.test(x));
const out={};
for(const f of files){
  const s=fs.readFileSync(path.join(root,f),'utf8');
  const hits=[...s.matchAll(/\bcall\(\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
  out[f]=[...new Set(hits)].sort();
}
console.log(JSON.stringify(out,null,2));
