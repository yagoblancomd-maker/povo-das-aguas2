import {all} from '../src/core.mjs';
import {permissions} from '../src/access.mjs';
import {executeAction} from '../src/actions.mjs';
import {closeDb} from '../src/db.mjs';

const group=String(process.env.TEST_GROUP||'people');
const users=(await all('Usuarios')).filter(u=>u.ativo===true||u.ativo==='true');
const consultaUser=users.find(u=>(permissions(u)||[]).includes('consulta'))||users[0];
const adminUser=users.find(u=>(permissions(u)||[]).includes('administracao'))||consultaUser;
const managerUser=users.find(u=>(permissions(u)||[]).includes('gestao_distribuicao'))||adminUser;
const distUser=users.find(u=>(permissions(u)||[]).includes('distribuicao'))||managerUser;

const people=await all('Pessoas');
const tasks=await all('Tarefas');
const processes=await all('Processos');

const out={group,checks:{},errors:[]};
async function check(name,user,payload={}){
  const started=Date.now();
  try{
    const value=await executeAction(name,payload,user);
    out.checks[name]={
      ok:true,
      ms:Date.now()-started,
      kind:Array.isArray(value)?'array':typeof value,
      size:Array.isArray(value)?value.length:(value&&typeof value==='object'?Object.keys(value).length:null)
    };
    return value;
  }catch(e){
    out.checks[name]={ok:false,ms:Date.now()-started,error:e.message,status:e.statusCode||null};
    out.errors.push(name+': '+e.message);
    return null;
  }
}

if(group==='people'){
  await check('bootstrap',consultaUser);
  await check('painel',consultaUser);
  await check('pessoas',consultaUser,{busca:''});
  await check('pessoasLeve',consultaUser,{busca:'',limit:50});
  await check('historicoGeral',consultaUser,{pagina:1,limite:20});
  await check('perfilRanking',consultaUser,{});
  await check('imagensSistema',consultaUser,{});
  if(people[0]){
    const id=people[0].id;
    await check('pessoa',consultaUser,{id});
    await check('pessoaResumo',consultaUser,{id});
    await check('pessoaFichaMeta',consultaUser,{id});
    await check('pessoaFichaCargaInicial',consultaUser,{id});
    await check('pessoaCadastroEstado',consultaUser,{id});
    await check('pessoaDocumentos',consultaUser,{pessoaId:id,pagina:1,limite:20});
    await check('pessoaProcessos',consultaUser,{pessoaId:id,pagina:1,limite:20});
    await check('pessoaAtendimentos',consultaUser,{pessoaId:id,pagina:1,limite:20});
    await check('pessoaHistorico',consultaUser,{pessoaId:id,pagina:1,limite:20});
    await check('ficha',consultaUser,{pessoaId:id});
  }
}

if(group==='tasks'){
  await check('tarefasMinhas',consultaUser,{});
  await check('tarefasMinhasAbertas',consultaUser,{pagina:1,limite:50});
  await check('tarefasMinhasHistorico',consultaUser,{pagina:1,limite:50});
  await check('tarefasTags',consultaUser,{});
  await check('tarefaCriarOpcoes',consultaUser,{});
  await check('notificacoesTarefas',consultaUser,{});
  await check('processos',consultaUser,{});
  await check('processoFiltros',consultaUser,{});
  if(people[0])await check('tarefasPessoa',consultaUser,{pessoaId:people[0].id});
  if(processes[0])await check('processoDetalhe',consultaUser,{id:processes[0].id});
  await check('distribuicaoFila',managerUser,{});
  await check('tarefasAbertasGestao',managerUser,{pagina:1,limite:50});
  await check('tarefasHistorico',managerUser,{pagina:1,limite:50});
  await check('distribuicaoRanking',managerUser,{});
  const task=tasks.find(t=>t.responsavel&&String(t.responsavel).toLowerCase()===String(distUser.email||'').toLowerCase())||tasks[0];
  if(task){
    await check('tarefaGeralDetalhe',consultaUser,{id:task.id});
    await check('tarefaGeralMovimentos',consultaUser,{id:task.id});
  }
}

if(group==='admin'){
  await check('admin',adminUser,{});
  await check('adminUsuarios',adminUser,{});
  await check('adminTags',adminUser,{});
  await check('adminIntegracoes',adminUser,{});
  await check('adminConfiguracoes',adminUser,{});
  const imgs=await check('adminImagens',adminUser,{});
  if(Array.isArray(imgs)&&imgs[0]?.id){
    await check('imagemSistemaConteudo',adminUser,{id:imgs[0].id});
  }
  await check('cepConsultar',consultaUser,{cep:'96010000'});
}

out.ok=out.errors.length===0;
console.log('MATRIX_'+group.toUpperCase()+'='+JSON.stringify(out));
await closeDb();
if(!out.ok)process.exit(2);
