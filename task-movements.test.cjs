const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {C,vm}=require('./tests/apps-script-fixture.cjs');

let seq=0;
const op=()=>`MOVE_TEST_${++seq}_${crypto.randomUUID()}`;
const context=email=>({email,op:op(),hash:'move-'+seq,changes:[],effects:[]});
const as=email=>vm.runInContext('PDA_AUTH_CONTEXT_EMAIL_='+JSON.stringify(email),C);
const commit=(ctx,result)=>C.commit_(ctx,result);
const wait=()=>{const until=Date.now()+8;while(Date.now()<until){}};

function addUser(email,nome,perfil='ALUNO',funcao='Aluno'){
  const ctx=context('admin@example.test');
  const row=C.change_(ctx,'Usuarios',C.id_('USR',email),{
    email,perfil,ativo:true,nome,funcao
  });
  commit(ctx,row);
  return row;
}

C.instalar_();
addUser('resp-move@example.test','Responsável Movimento');

as('admin@example.test');
const personCtx=context('admin@example.test');
const person=C.change_(personCtx,'Pessoas','PES_MOVE',{
  nome:'Pessoa Movimento',
  cpf:'12345678901',
  cidade:'Pelotas',
  uf:'RS',
  jurisdicao:'PELOTAS',
  entidade:'PEL – COLÔNIA Z-3',
  criadoPor:'admin@example.test'
});
commit(personCtx,person);

const createCtx=context('admin@example.test');
const created=C.generalTaskCreate_(createCtx,{
  titulo:'Solicitar documento',
  descricao:'Teste de manifestação',
  responsavel:'resp-move@example.test',
  prioridade:'NORMAL',
  prazo:'2026-12-20',
  pessoaId:'PES_MOVE'
});
commit(createCtx,created);

as('resp-move@example.test');
const globalSeenCtx=context('resp-move@example.test');
commit(globalSeenCtx,C.taskNotificationsMarkSeen_(globalSeenCtx));
assert.equal(C.taskNotifications_().naoLidas,0);

wait();
as('admin@example.test');
const messageCtx=context('admin@example.test');
commit(messageCtx,C.generalTaskMessageSend_(messageCtx,{
  id:created.tarefa.id,
  mensagem:'Nova manifestação de teste.'
}));

as('resp-move@example.test');
let mine=C.myTasksOpenV2_({});
const task=mine.tarefas.find(row=>row.id===created.tarefa.id);
assert.ok(task,'tarefa deve aparecer para o responsável');
assert.equal(task.pessoa,'Pessoa Movimento');
assert.equal(task.novaManifestacao,true);
assert.equal(mine.tarefas[0].id,created.tarefa.id);

let notifications=C.taskNotifications_();
const notice=notifications.itens.find(row=>row.id===created.tarefa.id);
assert.ok(notice);
assert.equal(notice.novaManifestacao,true);
assert.ok(notifications.naoLidas>=1);

const readCtx=context('resp-move@example.test');
commit(readCtx,C.taskViewMark_(readCtx,{id:created.tarefa.id}));

mine=C.myTasksOpenV2_({});
assert.equal(mine.tarefas.find(row=>row.id===created.tarefa.id).novaManifestacao,false);

notifications=C.taskNotifications_();
assert.equal(
  notifications.itens.find(row=>row.id===created.tarefa.id).novaManifestacao,
  false
);

as('admin@example.test');
const creatorTasks=C.myTasksOpenV2_({});
assert.ok(
  creatorTasks.tarefas.some(row=>row.id===created.tarefa.id),
  'criador também deve encontrar a tarefa em Minhas tarefas'
);

console.log('PASS manifestações: pessoa vinculada, prioridade, leitura individual e notificação.');
