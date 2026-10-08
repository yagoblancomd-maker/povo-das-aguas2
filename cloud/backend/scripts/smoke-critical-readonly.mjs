import {performance} from 'node:perf_hooks';
import {all} from '../src/core.mjs';
import {executeAction} from '../src/actions.mjs';
import {closeDb} from '../src/db.mjs';

const users=(await all('Usuarios')).filter(u=>u.ativo===true||u.ativo==='true');
const user=users.find(u=>u.perfil==='ADMIN')||users[0];
if(!user)throw new Error('No active user');
const people=await all('Pessoas');
const person=people[0];
if(!person)throw new Error('No person');
const processes=await all('Processos');
const process=processes.find(p=>p.pessoaId===person.id)||processes[0]||null;

const out={user:user.email,pessoaId:person.id};
async function timed(name,action,q={}){
  const t=performance.now();
  const value=await executeAction(action,q,user);
  const ms=Math.round((performance.now()-t)*10)/10;
  out[name]={ms};
  if(Array.isArray(value))out[name].rows=value.length;
  else if(value&&typeof value==='object'){
    for(const key of ['pessoas','documentos','atendimentos','processos','historico','tarefas']){
      if(Array.isArray(value[key]))out[name][key]=value[key].length;
    }
    if(Number.isFinite(Number(value.total)))out[name].total=Number(value.total);
  }
  return value;
}

await timed('pessoasLeve','pessoasLeve',{busca:person.cpf||person.nome,limit:30});
await timed('fichaInicial','pessoaFichaCargaInicial',{pessoaId:person.id});
await timed('documentos','pessoaDocumentos',{pessoaId:person.id,limit:20,offset:0});
await timed('atendimentos','pessoaAtendimentos',{pessoaId:person.id,limit:20,offset:0});
await timed('processosPessoa','pessoaProcessos',{pessoaId:person.id,limit:20,offset:0});
await timed('historicoPessoa','pessoaHistorico',{pessoaId:person.id,limit:30,offset:0});
await timed('minhasTarefas','tarefasMinhasAbertas',{limit:200,offset:0});
if((await executeAction('bootstrap',{},user)).permissoes?.includes('gestao_distribuicao')){
  await timed('gestaoTarefas','tarefasAbertasGestao',{limit:200,offset:0});
}
if(process?.numero){
  await timed('processosBusca','processos',{busca:process.numero,limit:50,offset:0});
}
await timed('historicoGeral','historicoGeral',{tipo:'cadastros',limit:50,offset:0});
console.log(JSON.stringify(out,null,2));
await closeDb();
