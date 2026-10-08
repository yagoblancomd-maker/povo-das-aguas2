import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\//,''));
const pub=path.join(root,'public');
const src=path.join(root,'src');
const modulesDir=path.join(pub,'modules');

const failures=[];
const checks=[];
function ok(name,cond){
  checks.push({name,ok:!!cond});
  if(!cond)failures.push(name);
}
function read(p){return fs.readFileSync(p,'utf8');}
function moduleJson(name){
  const raw=read(path.join(modulesDir,name+'.json'));
  const data=JSON.parse(raw);
  const body=String(data.script||'')
    .replace(/^\s*<script>\s*/i,'')
    .replace(/\s*<\/script>\s*$/i,'');
  new Function(body);
  ok(name+' JSON completo',!!data.view&&!!data.style&&!!data.script);
  return data;
}

const adm=moduleJson('ADM');
ok('Admin excluir usuário',adm.script.includes('usuarioExcluir'));
ok('Admin exclusão visível no topo',adm.script.includes('adm-user-delete-top'));

const min=moduleJson('MIN');
ok('Hub de Minutas',min.script.includes('Hub de Minutas'));
ok('Minutas salvar modelo',min.script.includes('modeloDocumentoSalvar'));
ok('Minutas gerar por cadastro',min.script.includes('modeloDocumentoGerar'));
ok('Minutas adicionar DOCX',min.script.includes('+ Adicionar modelo'));

const dist=moduleJson('DIST');
ok('Checkbox de distribuição em lote',dist.script.includes('dist-bulk-check'));
ok('Distribuição em lote',dist.script.includes('tarefasAtribuirLote'));
ok('Checkbox com coluna/reserva visual',dist.style.includes('padding-left:46px')&&dist.style.includes('left:9px'));

const proc=moduleJson('PROC');
ok('Processos carregam ao abrir',proc.script.includes('await load_(0,false);'));
ok('Processos permitem pesquisa e filtros',proc.script.includes("'processos'")&&proc.script.includes('processoFiltros'));

const acomp=moduleJson('ACOMP');
ok('Consultar cadastro tem Pesquisar',acomp.script.includes("'Pesquisar'"));
ok('Consultar cadastro usa listagem leve',acomp.script.includes("'pessoasLeve'"));
ok('Consultar cadastro aceita Enter',acomp.script.includes("event.key!=='Enter'"));

moduleJson('TAREFAS');

const index=read(path.join(pub,'index.html'));
ok('Alertas com tratamento individual',index.includes('notificacaoTarefaTratar'));
ok('Alertas com tratamento em lote',index.includes('notificacoesTarefasTratarLote'));
ok('Alertas podem reabrir',index.includes('notificacaoTarefaReabrir'));
ok('Alertas tratados têm visão separada',index.includes('Ver tratados'));

const access=read(path.join(src,'access.mjs'));
ok('Entidade pode criar tarefa',access.includes("COLONIA_PESCADOR:['consulta','cadastro','retificacao_propria','criar_tarefa_entidade']"));

const core=read(path.join(src,'core.mjs'));
ok('Escopo de colônia por entidade',core.includes('personInUserScope')&&core.includes('normalizeEntityScope'));

const compat=read(path.join(src,'compat.mjs'));
ok('Tarefa interna de entidade',compat.includes('COLONIA_INTERNA:'));
ok('Tarefa de entidade para equipe',compat.includes('COLONIA_EQUIPE:'));
ok('Cadastro/tarefa tag criado pela colônia',compat.includes('CRIADO PELA COLÔNIA'));
ok('Alertas persistem estado tratado',compat.includes('alertasTratados:'));
ok('Alertas em lote backend',compat.includes('treatNotificationsBatch'));

const actions=read(path.join(src,'actions.mjs'));
ok('Exclusão de usuário backend',actions.includes("idempotentMutation('usuarioExcluir'"));
ok('Hub de modelos backend',actions.includes('documentModelSave')&&actions.includes('documentModelGenerate'));

const datajud=read(path.join(src,'datajud.mjs'));
ok('Processos respeitam escopo de pessoas',datajud.includes('scopedPeople(people,user)'));

for(const item of checks)console.log((item.ok?'PASS ':'FAIL ')+item.name);
if(failures.length){
  console.error('\nFalhas:',failures.join('; '));
  process.exit(1);
}
console.log('\nVERIFY_ADJUSTMENTS_OK='+checks.length);
