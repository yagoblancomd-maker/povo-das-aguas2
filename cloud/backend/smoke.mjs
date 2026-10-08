import {all} from './src/core.mjs';
import {executeAction} from './src/actions.mjs';
import {closeDb} from './src/db.mjs';
const users=(await all('Usuarios')).filter(u=>u.ativo===true||u.ativo==='true');
const user=users.find(u=>u.perfil==='ADMIN')||users[0];
if(!user)throw new Error('No active user');
const out={user:user.email};
const boot=await executeAction('bootstrap',{},user);
out.modules=Object.keys(boot.modulos||{});
const panel=await executeAction('painel',{},user);
out.panel={pessoas:panel.pessoas,documentos:panel.documentos,processos:panel.acoesTramitacao};
const people=await executeAction('pessoas',{},user);
out.people=people.length;
if(people[0]){const f=await executeAction('ficha',{pessoaId:people[0].id},user);out.ficha={docs:f.documentos.length,processos:f.processos.length};}
if((boot.permissoes||[]).includes('distribuicao')){const t=await executeAction('tarefasMinhas',{},user);out.minhasTarefas=(t.pendentes||[]).length+(t.concluidas||[]).length;}
if((boot.permissoes||[]).includes('gestao_distribuicao')){const d=await executeAction('distribuicaoFila',{},user);out.distribuicao=d.tarefas.length;}
const p=await executeAction('processos',{},user);out.processos=p.length;
if((boot.permissoes||[]).includes('administracao')){const a=await executeAction('admin',{},user);out.admin={usuarios:a.usuarios.length,configuracoes:a.configuracoes.length};}
console.log(JSON.stringify(out,null,2));
await closeDb();
