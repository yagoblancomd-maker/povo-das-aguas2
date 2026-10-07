const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {C,vm}=require('./tests/apps-script-fixture.cjs');

C.instalar_();
vm.runInContext("PDA_AUTH_CONTEXT_EMAIL_='admin@example.test'",C);

const ctx={email:'admin@example.test',op:'IDX_RUNTIME_1',hash:'x',changes:[],effects:[]};
const p=C.change_(ctx,'Pessoas','PES_IDX',{nome:'Pessoa Índice',cpf:'99988877766',cidade:'Pelotas',uf:'RS',jurisdicao:'PELOTAS',criadoPor:'admin@example.test'});
C.commit_(ctx,p);

assert.equal(C.get_('Pessoas','PES_IDX').nome,'Pessoa Índice');
assert.equal(C.where_('Pessoas','id','PES_IDX').length,1);
assert.ok(C.row_('Pessoas','PES_IDX')!==null);

const dados=fs.readFileSync(path.join(__dirname,'01_Dados.gs'),'utf8');
for(const token of ['DATA_INDEX_CACHE_','ROW_INDEX_CACHE_','function indexBy_','function where_','createTextFinder']) assert.ok(dados.includes(token),token);

const tasks=fs.readFileSync(path.join(__dirname,'TASKS_V2.gs'),'utf8');
assert.ok(tasks.includes('where_('));
assert.ok(tasks.includes("'Atendimentos'"));
assert.ok(tasks.includes('root.getFoldersByName'));
assert.ok(!tasks.includes('const iterator=root.getFolders()'));

const app=fs.readFileSync(path.join(__dirname,'App_Script.html'),'utf8');
assert.ok(app.includes("silent:true"));
assert.ok(app.includes('onOptimistic'));
assert.ok(app.includes('onRollback'));

const acomp=fs.readFileSync(path.join(__dirname,'ACOMP_Script.html'),'utf8');
assert.ok(acomp.includes('optimisticDelete_'));
assert.ok(acomp.includes('rollbackDelete_'));

console.log('PASS etapa 2: índices, leitura seletiva e exclusão otimista.');
