const assert=require('node:assert/strict');
const {C,vm}=require('./tests/apps-script-fixture.cjs');

C.instalar_();
vm.runInContext("PDA_AUTH_CONTEXT_EMAIL_='admin@example.test'",C);

const ctx={
  email:'admin@example.test',
  op:'CONSULTA_V2_RUNTIME',
  hash:'runtime',
  changes:[],
  effects:[]
};

const person=C.change_(ctx,'Pessoas','PES_RUNTIME_V2',{
  nome:'Pessoa Teste Consulta',
  cpf:'12345678901',
  nascimento:'01/01/1980',
  telefone:'(53) 99999-0000',
  email:'pessoa@example.test',
  cep:'96000000',
  tipoVia:'Rua',
  endereco:'Teste',
  numero:'10',
  complemento:'',
  bairro:'Centro',
  cidade:'Pelotas',
  uf:'RS',
  entidade:'PEL – COLÔNIA Z-3',
  outraEntidade:'',
  parcelasNaoRecebidas:'2',
  jurisdicao:'PELOTAS',
  criadoPor:'admin@example.test'
});
C.commit_(ctx,person);

const list=C.personListLite_({
  busca:'Pessoa Teste',
  offset:0,
  limit:30
});

assert.equal(list.total,1);
assert.equal(list.pessoas[0].id,'PES_RUNTIME_V2');
assert.equal(list.pessoas[0].jurisdicao,'PELOTAS');
assert.equal(list.pessoas[0].documentos,null);
assert.ok(Object.prototype.hasOwnProperty.call(list.pessoas[0],'tarefasAbertas'));

const summary=C.personQuickSummary_({id:'PES_RUNTIME_V2'});
assert.equal(summary.nome,'Pessoa Teste Consulta');
assert.equal(summary.documentos,0);
assert.equal(summary.processos,0);
assert.equal(summary.tarefasAbertas,0);
assert.equal(summary.podeExcluir,true);

assert.equal(C.personDocumentsPage_({pessoaId:'PES_RUNTIME_V2',limit:20}).total,0);
assert.equal(C.personProcessesPage_({pessoaId:'PES_RUNTIME_V2',limit:20}).total,0);
assert.equal(C.personAttendancesPage_({pessoaId:'PES_RUNTIME_V2',limit:20}).total,0);

const history=C.globalHistory_({
  tipo:'cadastros',
  busca:'Pessoa Teste',
  offset:0,
  limit:50
});
assert.equal(history.total,1);
assert.equal(history.itens[0].pessoaId,'PES_RUNTIME_V2');

const admin=C.adminUsersData_();
assert.ok(Array.isArray(admin.usuarios));
assert.ok(Array.isArray(admin.permissoes));

console.log('PASS runtime: consulta leve, drawer backend, histórico e administração lazy.');
