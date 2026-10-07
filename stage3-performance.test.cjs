const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=__dirname;
const read=name=>fs.readFileSync(path.join(base,name),'utf8');

const hist=read('HIST_Modulo.gs');
assert.ok(hist.includes('function globalHistory_('));
for(const token of ['cadastros','documentos','processos','Historico']) assert.ok(hist.includes(token),token);

const histUi=read('HIST_Script.html');
for(const token of ['Cadastros','Atividades','Documentos','Processos','historicoGeral','Carregar mais']) assert.ok(histUi.includes(token),token);

const painel=read('PAINEL_Script.html');
assert.ok(painel.includes('home-compact-footer'));
assert.ok(painel.includes("go('HIST')"));
assert.ok(!painel.includes('Cadastros recentes'));
assert.ok(!painel.includes('Atividade recente'));

const painelBackend=read('PAINEL_Modulo.gs');
assert.ok(!painelBackend.includes('ultimosCadastros'));
assert.ok(!painelBackend.includes('atividades'));

const perfil=read('PERF_Script.html');
assert.ok(perfil.includes('App.state.boot'));
assert.ok(perfil.includes('sincronização ocorre em segundo plano'));
assert.ok(!perfil.includes("await auth.request('authProfile'"));

const adm=read('ADM_Script.html');
for(const token of ['adminUsuarios','adminTags','adminIntegracoes','adminConfiguracoes','adm-users-v3-layout']) assert.ok(adm.includes(token),token);

const app=read('App_Script.html');
assert.ok(app.includes("HIST:{"));
assert.ok(app.includes("code:'HIST'"));
assert.ok(app.includes("ADM:['adminUsuarios',{}]"));

const api=read('06_Modulos.gs');
for(const token of ["HIST:'Histórico'",'historicoGeral','adminUsuarios','adminTags','adminIntegracoes','adminConfiguracoes']) assert.ok(api.includes(token),token);

console.log('PASS etapa 3: início compacto, histórico lazy, perfil instantâneo e administração lazy.');
