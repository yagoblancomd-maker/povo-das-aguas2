import {all} from '../src/core.mjs';
import {permissions} from '../src/access.mjs';
import {executeAction} from '../src/actions.mjs';
import {closeDb} from '../src/db.mjs';

const users=(await all('Usuarios')).filter(u=>u.ativo===true||u.ativo==='true');
const admin=users.find(u=>(permissions(u)||[]).includes('administracao'));
if(!admin)throw new Error('Nenhum usuário com permissão de administração.');

const people=await all('Pessoas');
if(!people.length)throw new Error('Nenhuma pessoa para validar as barreiras.');
const person=people[0];

const before={
  pessoas:(await all('Pessoas')).length,
  documentos:(await all('Documentos')).length,
  processos:(await all('Processos')).length,
  tarefas:(await all('Tarefas')).length,
  minutas:(await all('Minutas')).length
};

const preview=await executeAction('pessoaExcluirPreview',{id:person.id},admin);

const guards={confirmacao:false,cpf:false};
try{
  await executeAction('pessoaExcluirDefinitivo',{
    id:person.id,
    versao:person.versao,
    confirmar:false,
    cpfConfirmacao:person.cpf,
    confirmarVinculos:true
  },admin);
}catch(e){
  guards.confirmacao=e.statusCode===400;
}

try{
  await executeAction('pessoaExcluirDefinitivo',{
    id:person.id,
    versao:person.versao,
    confirmar:true,
    cpfConfirmacao:'00000000000',
    confirmarVinculos:true
  },admin);
}catch(e){
  guards.cpf=e.statusCode===400;
}

const after={
  pessoas:(await all('Pessoas')).length,
  documentos:(await all('Documentos')).length,
  processos:(await all('Processos')).length,
  tarefas:(await all('Tarefas')).length,
  minutas:(await all('Minutas')).length
};

console.log('DELETE_GUARDS='+JSON.stringify({
  user:admin.email,
  pessoa:{id:person.id,nome:person.nome},
  preview,
  guards,
  before,
  after,
  unchanged:JSON.stringify(before)===JSON.stringify(after)
}));

await closeDb();
