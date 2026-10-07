const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=__dirname;
const read=n=>fs.readFileSync(path.join(base,n),'utf8');

const cfg=read('00_Config.gs');
assert.ok(cfg.includes("TarefaLeituras:['usuario','ultimoVistoEm','tarefaId']"));

const backend=read('DIST_TarefasGerais.gs');
for(const token of ['function taskMovementMaps_','function taskViewMark_','function taskReadSave_','novaManifestacao','ultimaMovimentacaoEm']) assert.ok(backend.includes(token),token);
assert.ok(backend.includes("where_(\n      'TarefaMensagens'"));
assert.ok(backend.includes("where_(\n      'TarefaAnexos'"));

const v2=read('TASKS_V2.gs');
for(const token of ['novaManifestacao','ultimaMovimentacaoEm','q.participante','participant!==responsible','a.novaManifestacao']) assert.ok(v2.includes(token),token);

const tasks=read('TAREFAS_Script.html');
for(const token of ['NOVA MANIFESTAÇÃO','makeTaskRowInteractive_','task-linked-person','tarefaMarcarVista','noLoader:true']) assert.ok(tasks.includes(token),token);

const dist=read('DIST_Script.html');
for(const token of ['NOVA MANIFESTAÇÃO','makeDistRowInteractive_','dist-linked-person','tarefaMarcarVista','noLoader:true']) assert.ok(dist.includes(token),token);

const data=read('01_Dados.gs');
const commit=data.slice(data.indexOf('function commit_'),data.indexOf('function version_'));
assert.ok(commit.includes('Sheets.Spreadsheets.batchUpdate'));
assert.ok(!commit.includes('SpreadsheetApp.flush()'));

const distModule=read('DIST_Modulo.gs');
assert.ok(distModule.includes("where_(\n      'Documentos'"));

console.log('PASS etapa 3: manifestações, tarefas clicáveis e IO otimizado.');
