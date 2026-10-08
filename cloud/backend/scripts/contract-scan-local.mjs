import fs from 'node:fs';

const files=[
  'public/index.html',
  ...fs.readdirSync('public/modules')
    .filter(file=>file.endsWith('.json'))
    .map(file=>'public/modules/'+file)
];

const calls=new Set();
const callPattern=/\bcall\(\s*['"]([^'"]+)['"]/g;

for(const file of files){
  let text=fs.readFileSync(file,'utf8');
  if(file.endsWith('.json')){
    try{
      text=JSON.parse(text).script||'';
    }catch(error){
      console.error('JSON_ERROR',file,error.message);
      process.exitCode=2;
      continue;
    }
  }
  let match;
  while((match=callPattern.exec(text))){
    calls.add(match[1]);
  }
}

const backend=fs.readFileSync('src/actions.mjs','utf8');
const missing=[...calls].filter(action=>
  !backend.includes("'"+action+"'")&&
  !backend.includes('"'+action+'"')&&
  !backend.includes(action+':async')
).sort();

console.log('FRONT_ACTIONS='+calls.size);
console.log('MISSING='+JSON.stringify(missing));
console.log('ACTIONS='+JSON.stringify([...calls].sort()));

if(missing.length)process.exitCode=2;
