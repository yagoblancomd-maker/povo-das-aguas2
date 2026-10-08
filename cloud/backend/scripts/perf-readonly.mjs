import {performance} from 'node:perf_hooks';
import {all} from '../src/core.mjs';
import {executeAction} from '../src/actions.mjs';
import {closeDb} from '../src/db.mjs';

const users=(await all('Usuarios')).filter(u=>u.ativo===true||u.ativo==='true');
const user=users.find(u=>String(u.perfil||'').toUpperCase()==='ADMIN')||users[0];
if(!user) throw new Error('No active user');

const rawPeople=await all('Pessoas');
const results={
  user:{email:user.email,perfil:user.perfil,entidade:user.entidade||''},
  timings:{},
  counts:{rawPessoas:rawPeople.length}
};

async function time(label,fn){
  const t0=performance.now();
  const value=await fn();
  results.timings[label]=Math.round((performance.now()-t0)*100)/100;
  return value;
}

const boot=await time('bootstrap_cold_ms',()=>executeAction('bootstrap',{},user));
await time('bootstrap_warm_ms',()=>executeAction('bootstrap',{},user));
await time('painel_ms',()=>executeAction('painel',{},user));

const people=await time('pessoas_ms',()=>executeAction('pessoas',{},user));
results.counts.pessoasAction=Array.isArray(people)?people.length:null;
results.counts.modulos=Object.keys(boot.modulos||{}).length;

if(rawPeople[0]){
  try{
    await time('ficha_primeira_pessoa_ms',()=>executeAction('ficha',{pessoaId:rawPeople[0].id},user));
    results.ficha='ok';
  }catch(e){
    results.ficha='erro: '+e.message;
  }
}

await time('processos_ms',()=>executeAction('processos',{},user));

if((boot.permissoes||[]).includes('distribuicao')){
  await time('tarefasMinhas_ms',()=>executeAction('tarefasMinhas',{},user));
}
if((boot.permissoes||[]).includes('gestao_distribuicao')){
  await time('distribuicaoFila_ms',()=>executeAction('distribuicaoFila',{},user));
}
if((boot.permissoes||[]).includes('administracao')){
  await time('admin_warm_1_ms',()=>executeAction('admin',{},user));
  await time('admin_warm_2_ms',()=>executeAction('admin',{},user));
}

console.log('PDA_PERF='+JSON.stringify(results));
await closeDb();
