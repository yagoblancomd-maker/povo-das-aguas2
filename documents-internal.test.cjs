const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=__dirname;
const read=name=>fs.readFileSync(path.join(base,name),'utf8');

const backend=read('CONSULTA_V2.gs');
for(const fn of ['personDocumentContent_','personDrawerInitial_','personDocumentPublic_']) assert.ok(backend.includes('function '+fn+'('),fn);
assert.ok(backend.includes("DriveApp.getFileById(document.fileId)"));
assert.ok(backend.includes('base64:Utilities.base64Encode'));

const api=read('06_Modulos.gs');
for(const token of ['pessoaFichaCargaInicial','documentoConteudo']) assert.ok(api.includes(token),token);

const app=read('App_Script.html');
for(const token of ['openFileViewer_','pda-file-viewer-overlay','pessoaFichaCargaInicial','drawerDocumentsTable_']) assert.ok(app.includes(token),token);
assert.ok(!app.includes('Carregar ficha completa'));

for(const file of ['DIST_Script.html','TAREFAS_Script.html','ACOMP_Script.html','MIN_Script.html']){
  const src=read(file);
  assert.ok(!/drive\.google\.com|docs\.google\.com|d\.url|driveUrl|downloadUrl|window\.open/.test(src),file+' ainda expõe navegação externa');
}

const tarefas=read('TAREFAS_Script.html');
assert.ok(tarefas.includes('App.openFileViewer'));
const dist=read('DIST_Script.html');
assert.ok(dist.includes('App.openFileViewer'));

console.log('PASS etapa 1: ficha completa automática e documentos somente dentro da plataforma.');
