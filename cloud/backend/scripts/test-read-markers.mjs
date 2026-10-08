import {all} from '../src/core.mjs';
import {permissions} from '../src/access.mjs';
import {executeAction} from '../src/actions.mjs';
import {closeDb} from '../src/db.mjs';

const users=(await all('Usuarios')).filter(u=>u.ativo===true||u.ativo==='true');
const user=users.find(u=>(permissions(u)||[]).includes('gestao_distribuicao'))||users.find(u=>(permissions(u)||[]).includes('consulta'))||users[0];
const tasks=await all('Tarefas');
if(!user)throw new Error('Nenhum usuário ativo.');
if(!tasks.length)throw new Error('Nenhuma tarefa para testar.');

const task=tasks.find(t=>!t.responsavel||String(t.responsavel).toLowerCase()===String(user.email||'').toLowerCase())||tasks[0];
const before=(await all('TarefaLeituras')).length;
const viewed=await executeAction('tarefaMarcarVista',{id:task.id},user);
const seen=await executeAction('notificacoesTarefasMarcarLidas',{},user);
const rows=await all('TarefaLeituras');
const email=String(user.email||'').toLowerCase();
const taskRead=rows.find(r=>String(r.usuario||'').toLowerCase()===email&&String(r.tarefaId||'')===task.id);
const globalRead=rows.find(r=>String(r.usuario||'').toLowerCase()===email&&!r.tarefaId);

const out={
  user:user.email,
  task:task.id,
  viewed,
  seen,
  before,
  after:rows.length,
  taskRead:!!taskRead,
  globalRead:!!globalRead,
  ok:!!taskRead&&!!globalRead
};
console.log('READ_MARKERS='+JSON.stringify(out));
await closeDb();
if(!out.ok)process.exit(2);
