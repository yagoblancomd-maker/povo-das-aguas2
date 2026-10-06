const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {C,properties,sentMail,files,vm,failNextBatch}=require('./tests/apps-script-fixture.cjs');
let passed=0;
function test(name,fn){fn();console.log('PASS '+name);passed++;}
const user=id=>{C.resetData_();return C.get_('Usuarios',id);};
const api=(token,action,q={})=>C.api(action,{...q,op:crypto.randomUUID()},token);
const register=(email,funcao='Colaborador',senha='a')=>C.authRegister({email,funcao,senha,nome:'Pessoa Teste'});
const set=(entity,row,patch)=>{C.resetData_();const r=C.get_(entity,row.id),ctx=C.authContext_('admin@example.test');C.change_(ctx,entity,r.id,{...r,...patch},r.versao);C.authPersist_(ctx);};
let owner,collab,student,teacher,resident;
test('instalação e migração aditiva preservam cabeçalhos e contas existentes',()=>{
 C.instalar_();const sheet=C.ss_().getSheetByName('Usuarios'),heads=C.headers_('Usuarios'),record=sheet.rows[1].slice(0,12);
 sheet.rows=sheet.rows.map(r=>r.slice(0,12));C.resetData_();C.authEnsureSchema_();assert.deepEqual(sheet.rows[0],Array.from(heads));assert.deepEqual(sheet.rows[1].slice(0,12),record);
 assert.ok(C.ss_().getSheetByName('Sessoes'));assert.ok(C.ss_().getSheetByName('Recuperacoes'));
});
test('proprietário existente ativa senha pela recuperação, sem reivindicação por autocadastro',()=>{
 assert.throws(()=>register('admin@example.test','Professor'),/já possui/);
 C.authRequestRecovery('admin@example.test');const reset=sentMail.at(-1).body.match(/reset=([a-f0-9]{64})/)[1];
 C.authResetPassword(reset,'owner');owner=C.authLogin('ADMIN@example.test','owner');
 assert.equal(owner.usuario.perfil,'ADMIN');assert.equal(api(owner.sessionToken,'bootstrap').perfil,'ADMIN');
});
test('autocadastro imediato com senha de um caractere, sem aprovação/Google/confirmação',()=>{
 collab=register('colaborador@example.test');student=register('aluno@example.test','Aluno');teacher=register('professor@example.test','Professor');resident=register('residente@example.test','Residente');
 assert.equal(C.authResume(collab.sessionToken).status,'AUTHENTICATED');
 const b=api(teacher.sessionToken,'bootstrap');assert.ok(b.permissoes.includes('conferencia'));assert.ok(b.permissoes.includes('gestao_distribuicao'));assert.ok(!b.permissoes.includes('administracao'));assert.ok(b.modulos.PERF);
 assert.equal(user(collab.usuario.id).senhaAlgoritmo,'bcrypt-sha256-v1');assert.notEqual(user(collab.usuario.id).senhaHash,'a');assert.notEqual(user(collab.usuario.id).senhaHash,user(student.usuario.id).senhaHash);
 assert.equal(files.get(C.ss_().getId()).removedViewers?.includes('colaborador@example.test')||false,false);
});
test('ADMIN e duplicidade de e-mail não podem ser escolhidos no autocadastro',()=>{
 assert.throws(()=>register('invasor@example.test','ADMIN'),/função/);
 assert.throws(()=>register(' COLABORADOR@example.test '),/já possui/);
 assert.throws(()=>C.authRegister({nome:'A',email:'none@example.test',funcao:'Aluno',senha:''}),/senha/);
});
test('senha preserva espaços e Unicode; caracteres após 72 bytes mudam a autenticação',()=>{
 const senha=' '.repeat(3)+'🌊'.repeat(80)+'x ';const result=register('unicode@example.test','Aluno',senha);
 assert.equal(C.authLogin('unicode@example.test',senha).status,'AUTHENTICATED');
 assert.throws(()=>C.authLogin('unicode@example.test',senha.trim()),/incorretos/);
 assert.throws(()=>C.authLogin('unicode@example.test',senha.replace('x','y')),/incorretos/);
 assert.equal(C.authResume(result.sessionToken).usuario.email,'unicode@example.test');
});
test('nenhum token ou hash de senha sai em bootstrap, Administração ou histórico',()=>{
 const admin=api(owner.sessionToken,'admin'),boot=api(collab.sessionToken,'bootstrap');
 for(const value of [admin,boot,C.all_('Historico'),C.all_('Operacoes')]){
  const text=JSON.stringify(value);assert.ok(!text.includes(user(collab.usuario.id).senhaHash));assert.ok(!text.includes(collab.sessionToken));assert.ok(!text.includes('senhaSalt'));assert.ok(!text.includes('senhaHash'));
 }
});
test('API e carregamento de módulos exigem sessão válida e permissão no servidor',()=>{
 assert.throws(()=>C.api('pessoas',{},''),/AUTH:/);assert.throws(()=>C.api('bootstrap',{},'f'.repeat(64)),/AUTH:/);
 assert.throws(()=>api(student.sessionToken,'admin'),/não autorizado/);assert.throws(()=>api(collab.sessionToken,'configSalvar'),/não autorizado/);
 assert.throws(()=>C.carregarModulo('ADM',student.sessionToken),/não autorizado/);assert.ok(C.carregarModulo('PERF',student.sessionToken).view.includes('perf-root'));
 assert.throws(()=>C.authorize_('consulta'),/AUTH:/);
});
let person;
test('cadastro mantém jurisdição e propriedade de pessoas após autenticação nova',()=>{
 person=api(collab.sessionToken,'pessoaSalvar',{nome:'Pessoa Fictícia',cpf:'01234567890',nascimento:'29/02/2000',telefone:'53996321234',tipoVia:'Rua',via:'Via Teste',numero:'105',bairro:'Centro',cidade:'Pelotas',uf:'RS',cep:'96000000',entidade:'COPAPEL',analfabeto:'NAO',parcelasNaoRecebidas:'3'});
 assert.equal(person.jurisdicao,'PELOTAS');assert.equal(person.criadoPor,'colaborador@example.test');assert.ok(C.canRetifyPerson_(user(collab.usuario.id),person));
 assert.equal(C.determinarJurisdicao('Chuí'),'RIO GRANDE');assert.equal(C.determinarJurisdicao('Torres'),'CAPÃO DA CANOA');
});
test('alteração de nome e usuário usa só a conta autenticada; privilégios não mudam',()=>{
 const original=user(collab.usuario.id);C.authUpdateProfile(collab.sessionToken,{...original,nome:'Novo Nome',nomeUsuario:'apelido',perfil:'ADMIN',funcao:'Professor',id:owner.usuario.id,permissoes:['administracao']});
 const updated=user(collab.usuario.id);assert.equal(updated.nome,'Novo Nome');assert.equal(updated.nomeUsuario,'apelido');assert.equal(updated.perfil,'COLABORADOR');assert.equal(updated.funcao,'Colaborador');assert.equal(user(owner.usuario.id).nome,owner.usuario.nome);assert.equal(updated.senhaHash,original.senhaHash);
});
test('troca de e-mail exige senha atual, mantém ID/autoria/tarefas e invalida sessões antigas',()=>{
 let u=user(collab.usuario.id);const ctx=C.authContext_(u.email);C.change_(ctx,'Tarefas','TASK_TEST',{tipo:'DISTRIBUICAO',responsavel:u.email,situacao:'PENDENTE'});C.authPersist_(ctx);
 assert.throws(()=>C.authUpdateProfile(collab.sessionToken,{...u,email:'novo@example.test',senhaAtual:'errada'}),/Senha atual/);
 assert.throws(()=>C.authUpdateProfile(collab.sessionToken,{...u,email:'aluno@example.test',senhaAtual:'a'}),/já possui/);
 const previousToken=collab.sessionToken;const response=C.authUpdateProfile(collab.sessionToken,{...u,email:'novo@example.test',senhaAtual:'a'});assert.equal(response.usuario.id,u.id);collab=response;u=user(u.id);
 assert.throws(()=>C.authResume(previousToken),/AUTH:/);
 assert.ok(C.canRetifyPerson_(u,person));assert.equal(C.get_('Tarefas','TASK_TEST').responsavel,'novo@example.test');
 assert.throws(()=>C.authLogin('colaborador@example.test','a'),/incorretos/);assert.equal(C.authLogin('novo@example.test','a').usuario.id,u.id);
 assert.throws(()=>register('colaborador@example.test'),/já possui/);
});
test('foto pode ser inserida, trocada e removida sem links públicos',()=>{
 const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');let u=user(collab.usuario.id);
 C.authUpdateProfile(collab.sessionToken,{...u,base64:png,mime:'image/png'});u=user(u.id);const first=u.fotoId;
 assert.ok(C.authProfile(collab.sessionToken).foto.startsWith('data:image/png;base64,'));assert.equal(files.get(first).folder,C.profilePhotoFolder_().getId());
 C.authUpdateProfile(collab.sessionToken,{...u,base64:png,mime:'image/png'});u=user(u.id);const second=u.fotoId;assert.notEqual(first,second);assert.ok(files.get(first).isTrashed());
 C.authUpdateProfile(collab.sessionToken,{...u,removerFoto:true});assert.equal(C.authProfile(collab.sessionToken).foto,'');assert.ok(files.get(second).isTrashed());
 assert.throws(()=>C.authUpdateProfile(collab.sessionToken,{...user(u.id),base64:Buffer.from('<svg onload="x">').toString('base64'),mime:'image/png'}),/imagem válida/);
});
test('falha Sheets não substitui perfil nem descarta a foto antiga',()=>{
 const u=user(collab.usuario.id);failNextBatch();assert.throws(()=>C.authUpdateProfile(collab.sessionToken,{...u,nome:'Não Salvar'}),/Falha Sheets/);assert.equal(user(u.id).nome,u.nome);
});
test('troca de senha encerra as outras sessões e não exige confirmação',()=>{
 const oldSession=collab.sessionToken,other=C.authLogin('novo@example.test','a').sessionToken;
 assert.throws(()=>C.authChangePassword(oldSession,'wrong','z'),/Senha atual/);
 collab=C.authChangePassword(oldSession,'a','z');assert.equal(C.authResume(collab.sessionToken).status,'AUTHENTICATED');
 assert.throws(()=>C.authResume(oldSession),/AUTH:/);assert.throws(()=>C.authResume(other),/AUTH:/);assert.throws(()=>C.authLogin('novo@example.test','a'),/incorretos/);assert.equal(C.authLogin('novo@example.test','z').status,'AUTHENTICATED');
});
test('recuperação é genérica, expira em 30 minutos e o link funciona uma única vez',()=>{
 assert.deepEqual(C.authRequestRecovery('inexistente@example.test'),C.authRequestRecovery('novo@example.test'));
 const reset=sentMail.at(-1).body.match(/reset=([a-f0-9]{64})/)[1],old=collab.sessionToken;
 C.authResetPassword(reset,'r');assert.throws(()=>C.authResetPassword(reset,'r'),/inválido/);assert.throws(()=>C.authResume(old),/AUTH:/);collab=C.authLogin('novo@example.test','r');
 C.authRequestRecovery('novo@example.test');const token=sentMail.at(-1).body.match(/reset=([a-f0-9]{64})/)[1],rec=C.all_('Recuperacoes').find(r=>r.tokenHash===C.hash_(token));set('Recuperacoes',rec,{expiraEm:'2000-01-01T00:00:00.000Z'});assert.throws(()=>C.authResetPassword(token,'t'),/inválido/);
});
test('editar usuário pela Administração preserva credenciais e não as retorna',()=>{
 const u=user(collab.usuario.id),saved=api(owner.sessionToken,'usuarioSalvar',{...C.authPublicUser_(u),ativo:true,permissoes:['consulta','cadastro','retificacao_propria']});
 assert.equal(user(u.id).senhaHash,u.senhaHash);assert.ok(!('senhaHash' in saved));assert.equal(C.authLogin(u.email,'r').status,'AUTHENTICATED');
});
test('logout revoga token no servidor e desativação invalida a sessão',()=>{
 const token=C.authLogin('aluno@example.test','a').sessionToken;C.authLogout(token);assert.throws(()=>C.authResume(token),/AUTH:/);C.authLogout(token);
 const u=user(resident.usuario.id);set('Usuarios',u,{ativo:false});assert.throws(()=>C.authResume(resident.sessionToken),/AUTH:/);assert.throws(()=>C.authLogin(u.email,'a'),/incorretos/);
});
test('sessão expirada não permite ler ou gravar dados',()=>{
 C.resetData_();const session=C.all_('Sessoes').find(s=>s.tokenHash===C.hash_(collab.sessionToken));set('Sessoes',session,{expiraEm:'2000-01-01T00:00:00.000Z'});assert.throws(()=>api(collab.sessionToken,'bootstrap'),/AUTH:/);
});
test('tentativas de login e recuperação são limitadas independentemente do cache',()=>{
 for(let i=0;i<8;i++)assert.throws(()=>C.authLogin('aluno@example.test','errada'),/incorretos/);
 assert.throws(()=>C.authLogin('aluno@example.test','a'),/Muitas tentativas/);
 for(let i=0;i<3;i++)C.authRequestRecovery('limite@example.test');assert.throws(()=>C.authRequestRecovery('limite@example.test'),/Muitas tentativas/);
});
test('código opcional por função é validado no servidor, sem aprovação posterior',()=>{
 properties.AUTH_ROLE_CODES=JSON.stringify({Professor:'codigo'});assert.throws(()=>register('comcodigo@example.test','Professor'),/Código/);
 const u=C.authRegister({nome:'Professor Código',email:'comcodigo@example.test',funcao:'Professor',senha:'1',codigo:'codigo'});assert.equal(u.usuario.perfil,'PROFESSOR_RESIDENTE');delete properties.AUTH_ROLE_CODES;
});
test('bootstrap não expõe senhas ou códigos e instalador não é função pública',()=>{
 const boot=C.authPageBootstrap_({parameter:{reset:'bad'}});assert.equal(boot.resetToken,'');assert.ok(!JSON.stringify(boot).includes('codigo'));
 const fs=require('fs');const publicFunctions=fs.readdirSync('.').filter(f=>f.endsWith('.gs')).flatMap(f=>[...fs.readFileSync(f,'utf8').matchAll(/^function ([^(]+)\(/gm)].map(m=>m[1])).filter(n=>!n.endsWith('_'));
 assert.deepEqual(publicFunctions.sort(),['api','authChangePassword','authLogin','authLogout','authProfile','authRegister','authRequestRecovery','authResetPassword','authResume','authUpdateProfile','carregarModulo','determinarJurisdicao','doGet'].sort());
});
console.log(`${passed} cenários de autenticação e integração aprovados (serviços Google simulados).`);
