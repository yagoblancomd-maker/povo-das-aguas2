import {all} from '../src/core.mjs';
import {permissions} from '../src/access.mjs';
import {executeAction} from '../src/actions.mjs';
import {closeDb} from '../src/db.mjs';

const users=(await all('Usuarios')).filter(u=>u.ativo===true||u.ativo==='true');
const user=users.find(u=>(permissions(u)||[]).includes('consulta'))||users[0];
const manager=users.find(u=>(permissions(u)||[]).includes('gestao_distribuicao'))||user;
if(!user)throw new Error('Nenhum usuário ativo.');

const profile=await executeAction('perfilRanking',{},user);
const row=profile.usuario;
const required=['rankCadastros','rankTarefas','rankProcessos','cadastros','tarefasConcluidas','processosDistribuidos'];
const profileOk=!!row&&required.every(k=>Number.isFinite(Number(row[k])))&&Number(profile.totalUsuarios)>0&&profile.de&&profile.ate;

let distOk=true;
let distRows=0;
if((permissions(manager)||[]).includes('gestao_distribuicao')){
  const dist=await executeAction('distribuicaoRanking',{},manager);
  distRows=(dist.linhas||[]).length;
  distOk=(dist.linhas||[]).every(r=>['rankCadastros','rankTarefas','rankProcessos','rankMedia'].every(k=>Number.isFinite(Number(r[k]))));
}

const out={
  profileOk,
  distOk,
  totalUsuarios:profile.totalUsuarios,
  periodo:{de:profile.de,ate:profile.ate},
  usuario:row?{
    email:row.email,
    rankCadastros:row.rankCadastros,
    rankTarefas:row.rankTarefas,
    rankProcessos:row.rankProcessos,
    cadastros:row.cadastros,
    tarefasConcluidas:row.tarefasConcluidas,
    processosDistribuidos:row.processosDistribuidos
  }:null,
  comparativo:profile.comparativo?.evolucao||null,
  distRows
};
console.log('RANK_SHAPE='+JSON.stringify(out));
await closeDb();
if(!profileOk||!distOk)process.exit(2);
