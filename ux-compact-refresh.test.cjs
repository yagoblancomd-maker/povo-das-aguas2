const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=__dirname;
const read=name=>fs.readFileSync(path.join(base,name),'utf8');

const index=read('Index.html');
assert.ok(index.includes('id="reloadButton"'));

const app=read('App_Script.html');
for(const token of ['function softRefresh_','clearReadCaches_();','Dados atualizados agora.','openPersonDrawer_']) assert.ok(app.includes(token),token);

const taskStyle=read('TAREFAS_Style.html');
assert.ok(taskStyle.includes('TAREFAS — LISTA OPERACIONAL COMPACTA'));
assert.ok(taskStyle.includes('grid-template-columns:1fr!important'));
assert.ok(taskStyle.includes('min-height:70px!important'));

const distStyle=read('DIST_Style.html');
assert.ok(distStyle.includes('DISTRIBUIÇÃO — FILA OPERACIONAL COMPACTA'));
assert.ok(distStyle.includes('grid-template-areas'));
assert.ok(distStyle.includes('min-height:82px!important'));

const scripts=fs.readdirSync(base).filter(name=>/_Script\.html$/.test(name));
for(const file of scripts){
  const src=read(file);
  assert.ok(!/drive\.google\.com|docs\.google\.com|driveUrl|downloadUrl/.test(src),file+' expõe armazenamento externo');
}

console.log('PASS etapa 3: tarefas compactas, distribuição compacta e refresh suave global.');
