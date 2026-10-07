const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=__dirname;
const read=n=>fs.readFileSync(path.join(base,n),'utf8');

const index=read('Index.html');
assert.ok(index.includes('pdf.min.js'));
assert.ok(index.includes('pdf.worker.min.js'));

const app=read('App_Script.html');
for(const token of ['pda-file-viewer-dialog','dialog.showModal()','window.pdfjsLib','getDocument({','pda-pdf-canvas','Baixar pela plataforma']) assert.ok(app.includes(token),token);
assert.ok(!app.includes("frame.src=objectUrl"));

const style=read('App_Style.html');
assert.ok(style.includes('.pda-file-viewer-dialog::backdrop'));
assert.ok(style.includes('.pda-pdf-canvas-wrap'));

console.log('PASS etapa 2: PDF.js e dialog top-layer ativos.');
