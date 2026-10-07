const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=__dirname;
const read=name=>fs.readFileSync(path.join(base,name),'utf8');

const dist=read('DIST_Script.html');
assert.ok(dist.includes("call('pessoasLeve'"));
assert.ok(dist.includes("data.distribuicaoAutomatica=!!result.ativo"));
assert.ok(dist.includes("result.alteradas"));
assert.ok(dist.includes("App.openPersonDrawer(task.pessoaId)"));
assert.ok(!/tarefaDistribuicaoAtribuir[\s\S]{0,900}await\s+renderOpen_\(\)/.test(dist));
assert.ok(!/distribuicaoAutomaticaExecutar[\s\S]{0,500}await\s+renderOpen_\(\)/.test(dist));

const tasks=read('TAREFAS_Script.html');
assert.ok(tasks.includes("App.openPersonDrawer(task.pessoaId)"));
assert.ok(tasks.includes('function applyTaskChange_'))
assert.ok(tasks.includes("kind:'complete'"));

const proc=read('PROC_Script.html');
assert.ok(proc.includes('Visualizar cadastro'));
assert.ok(proc.includes('App.openPersonDrawer(row.pessoaId)'));

const backend=read('TASKS_V2.gs');
assert.ok(backend.includes('alteradas'));
assert.ok(backend.includes('distributionAutoAssignee_(staged,users)'));

const consulta=read('CONSULTA_V2.gs');
assert.ok(consulta.includes('function personListIndexes_'));
assert.ok(consulta.includes('A lista não lê Documentos nem Atendimentos'));

const app=read('App_Script.html');
assert.ok(app.includes('Gerar documentos'));
assert.ok(app.includes('Relatório Seguro-Defeso 2025'));
assert.ok(app.includes('Petição inicial — Seguro-Defeso 2025'));

console.log('PASS etapa 4: distribuição incremental, drawers cruzados e ficha lateral operacional.');
