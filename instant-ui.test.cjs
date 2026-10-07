const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=__dirname;
const read=n=>fs.readFileSync(path.join(base,n),'utf8');

const app=read('App_Script.html');
assert.ok(app.includes('function renderInstantModuleShell_'));
assert.ok(app.includes('renderInstantModuleShell_('));
assert.ok(app.includes("runModuleWarmup_()"));
assert.ok(!/async function go[\s\S]{0,2600}safeBeginProcessing_/.test(app));
const go=app.slice(app.indexOf('async function go'),app.indexOf('const alive=ctx=>'));
assert.ok(go.indexOf('root.replaceChildren')<go.indexOf('await window.PDA_MODULES[code]'));

const tasks=read('TAREFAS_Script.html');
assert.ok(tasks.includes('function openInstantTaskDialog_'));
assert.ok(tasks.includes("openInstantTaskDialog_("));

const dist=read('DIST_Script.html');
assert.ok(dist.includes('function openInstantGeneralDialog_'));

const proc=read('PROC_Script.html');
const procStart=proc.indexOf('return async function(ctx)');
const procCall=proc.indexOf("await call('processos')",procStart);
const procAppend=proc.indexOf('root.append(toolbar)',procStart);
assert.ok(procAppend>=0&&procAppend<procCall);

console.log('PASS etapa 1: módulos e tarefas abrem visualmente antes das leituras.');
