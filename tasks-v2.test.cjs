const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const base=__dirname;
const read=name=>fs.readFileSync(path.join(base,name),'utf8');

const cfg=read('00_Config.gs');
for(const token of [
  'TarefaTags',
  "'tags','modoDistribuicao'",
  "'pessoaId','documentoId'",
  'distribuicaoAutomatica:false'
]){
  assert.ok(cfg.includes(token),'Configuração V2 ausente: '+token);
}

const backend=read('TASKS_V2.gs');
for(const fn of [
  'tasksManagementOpenV2_',
  'tasksHistoryV2_',
  'myTasksOpenV2_',
  'myTasksHistoryV2_',
  'personTasksV2_',
  'distributionAutoRun_',
  'distributionRanking_',
  'personDeleteCascade_',
  'taskTagSave_'
]){
  assert.match(backend,new RegExp('function\\s+'+fn.replace(/_/g,'_')+'\\s*\\('));
}
assert.match(backend,/if\(preview\.exigeConfirmacaoReforcada&&!bool_\(q\.confirmarVinculos\)\)/);
assert.match(backend,/mediaProcessosPorLogin/);

const general=read('DIST_TarefasGerais.gs');
assert.match(general,/ANEXO_TAREFA/);
assert.match(general,/personFolder_\(linkedPerson\)/);
assert.match(general,/documentoId/);
assert.match(general,/taskDueState_/);

const distBackend=read('DIST_Modulo.gs');
assert.match(distBackend,/distributionAutoEnabled_\(\)/);
assert.match(distBackend,/modoDistribuicao:autoUser\?'AUTOMATICA':'MANUAL'/);

const api=read('06_Modulos.gs');
for(const action of [
  'tarefasAbertasGestao',
  'tarefasHistorico',
  'tarefasMinhasAbertas',
  'tarefasMinhasHistorico',
  'tarefasPessoa',
  'distribuicaoRanking',
  'pessoaExcluirDefinitivo',
  'distribuicaoAutomaticaSalvar',
  'distribuicaoAutomaticaExecutar'
]){
  assert.ok(api.includes(action),'API V2 ausente: '+action);
}

const tasks=read('TAREFAS_Script.html');
assert.match(tasks,/tarefasMinhasAbertas/);
assert.match(tasks,/tarefasMinhasHistorico/);
assert.match(tasks,/Histórico/);
assert.match(tasks,/Prazo inferior a 96h/);
assert.match(tasks,/task-tags/);

const dist=read('DIST_Script.html');
assert.match(dist,/tarefasAbertasGestao/);
assert.match(dist,/tarefasHistorico/);
assert.match(dist,/distribuicaoRanking/);
assert.match(dist,/distribuicaoAutomaticaSalvar/);
assert.match(dist,/Vincular a um cadastro/);

const acomp=read('ACOMP_Script.html');
assert.match(acomp,/Tarefas vinculadas/);
assert.match(acomp,/Consultar histórico de tarefas/);
assert.match(acomp,/pessoaExcluirPreview/);
assert.match(acomp,/pessoaExcluirDefinitivo/);

const index=read('Index.html');
assert.match(index,/class="pda-sidebar-user"/);
assert.doesNotMatch(index,/<header class="app-header">/);
for(const id of [
  'profileShortcut','identity','headerUserPhoto','headerUserInitials',
  'headerUserFunction','headerUserProfile','taskNotificationButton',
  'profileButton','logoutButton'
]){
  assert.match(index,new RegExp('id="'+id+'"'));
}

const auth=read('AUTH_View.html');
assert.match(auth,/pda-auth-photo-stage/);
assert.match(auth,/Criar meu acesso/);
assert.doesNotMatch(auth,/Entrar com Google|Fazer login com Google|Google Sign-In/i);

const admin=read('ADM_Script.html');
assert.match(admin,/adm-users-v3-layout/);
assert.match(admin,/Tags de tarefas/);
assert.match(admin,/tarefaTagSalvar/);

console.log('PASS tarefas V2, histórico lazy, ranking, vínculos, exclusão e shell lateral protegidos.');
