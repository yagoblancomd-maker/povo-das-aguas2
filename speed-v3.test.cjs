const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=__dirname;
const read=n=>fs.readFileSync(path.join(base,n),'utf8');

const dados=read('01_Dados.gs');
for(const token of ['function batchAll_','Sheets.Spreadsheets.Values.batchGet','function findById_','ENTITY_SCHEMA_OK_']) assert.ok(dados.includes(token),token);
assert.ok(dados.includes("c.before\n          ?row_(")||dados.includes('c.before\n          ?row_('));

const app=read('App_Script.html');
for(const token of ['renderInstantModuleShell_','runModuleWarmup_()','ensurePdfJs_','pda-file-viewer-dialog','tasksOpenPromise','historyPromise','noLoader:true']) assert.ok(app.includes(token),token);
assert.ok(!/iframe/i.test(app),'App não deve usar iframe para documentos');

const consulta=read('CONSULTA_V2.gs');
const drawer=consulta.slice(consulta.indexOf('function personDrawerInitial_'),consulta.indexOf('function personDocumentsPage_'));
assert.ok(!drawer.includes("'TarefaMensagens'"));
assert.ok(!drawer.includes("'Historico'"));

const tasks=read('TASKS_V2.gs');
assert.ok(tasks.includes('function profileRanking_'));
assert.ok(tasks.includes('novaManifestacao'));
assert.ok(/novaManifestacao[\s\S]*?return a\.novaManifestacao\s*\?-1/.test(tasks));

const api=read('06_Modulos.gs');
for(const token of ['perfilRanking','ephemeral','findById_']) assert.ok(api.includes(token),token);

const perf=read('PERF_Script.html');
for(const token of ['Minha participação','Novos cadastros','Tarefas concluídas','Processos distribuídos','perfilRanking']) assert.ok(perf.includes(token),token);

const tarefaStyle=read('TAREFAS_Style.html');
assert.ok(tarefaStyle.includes('min-height:54px!important'));
const distStyle=read('DIST_Style.html');
assert.ok(distStyle.includes('NOVA MANIFESTAÇÃO')||distStyle.includes('dist-new-movement'));

console.log('PASS V3: navegação instantânea, batch Sheets, PDF interno, ranking e manifestações.');
