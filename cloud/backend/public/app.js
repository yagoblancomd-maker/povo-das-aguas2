const TOKEN_KEY='pda.cloud.session';
const q=s=>document.querySelector(s);
const qa=s=>Array.from(document.querySelectorAll(s));
let boot=null;
let current='PAINEL';

const labels={
  PAINEL:'Início',PESS:'Novo Cadastro',ACOMP:'Consultar Cadastros',
  DEFESO:'Consultar Defeso 2025',TAREFAS:'Tarefas',MIN:'Minutas',
  DIST:'Atribuir tarefas',PROC:'Processos',PERF:'Meu perfil',ADM:'Administração'
};

const icons={
  PAINEL:'⌂',PESS:'＋',ACOMP:'⌕',DEFESO:'◇',TAREFAS:'✓',
  MIN:'▤',DIST:'⇄',PROC:'§',PERF:'◎',ADM:'⚙'
};

function esc(v){
  return String(v??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function date(v){
  if(!v)return '—';
  const d=new Date(v);
  return Number.isNaN(d.getTime())?String(v):d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
}
function cpf(v){
  const s=String(v||'').replace(/\D/g,'').padStart(11,'0').slice(-11);
  return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
}
function token(){return sessionStorage.getItem(TOKEN_KEY)||'';}
function hasPermission(p){return (boot?.permissoes||[]).includes(p);}

async function api(path,opt={}){
  const headers=new Headers(opt.headers||{});
  if(opt.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  if(token())headers.set('Authorization','Bearer '+token());
  const res=await fetch(path,{...opt,headers});
  const body=await res.json().catch(()=>({}));
  if(res.status===401&&path!='/api/v1/auth/login'&&path!='/api/v1/auth/register'){
    sessionStorage.removeItem(TOKEN_KEY);
    showAuth('Sua sessão expirou. Entre novamente.');
    throw new Error('Sessão expirada.');
  }
  if(!res.ok)throw new Error(body.message||'Não foi possível concluir a operação.');
  return body;
}

function notify(message,error=false){
  const el=q('#notice');
  el.textContent=message;
  el.classList.toggle('error',error);
  el.classList.remove('hidden');
  clearTimeout(notify.timer);
  notify.timer=setTimeout(()=>el.classList.add('hidden'),5500);
}

function showAuth(message=''){
  q('#auth').classList.remove('hidden');
  q('#app').classList.add('hidden');
  q('#authMessage').textContent=message;
}
function showApp(){
  q('#auth').classList.add('hidden');
  q('#app').classList.remove('hidden');
  const user=boot.usuario;
  q('#sideUser').textContent=user.nomeUsuario||user.nome||user.email;
  q('#sideRole').textContent=user.funcao||user.perfil||'';
  q('#avatar').textContent=(user.nomeUsuario||user.nome||user.email||'P').trim().charAt(0).toUpperCase();
  buildNav();
}
function setLoading(){
  q('#content').innerHTML='<div class="loading">Carregando…</div>';
}
function buildNav(){
  const nav=q('#nav');
  nav.replaceChildren();
  Object.entries(boot.modulos||{}).forEach(([code,label])=>{
    const b=document.createElement('button');
    b.className='nav-btn'+(code===current?' active':'');
    b.dataset.module=code;
    b.innerHTML='<span>'+esc(icons[code]||'·')+' &nbsp;'+esc(label)+'</span><small>›</small>';
    b.onclick=()=>go(code);
    nav.appendChild(b);
  });
}
async function go(code){
  current=code;
  q('#pageTitle').textContent=labels[code]||code;
  qa('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.module===code));
  setLoading();
  try{
    const renderers={
      PAINEL:renderDashboard,PESS:()=>renderPersonForm(),ACOMP:renderPeople,
      TAREFAS:renderMyTasks,DIST:renderDistribution,PROC:renderProcesses,
      PERF:renderProfile,ADM:renderAdmin,
      DEFESO:()=>renderMigration('Seguro-Defeso 2025','A integração de consulta e relatórios do Seguro-Defeso ainda usa o serviço do Apps Script. Ela será conectada ao backend Cloud na próxima etapa.'),
      MIN:()=>renderMigration('Minutas','A geração de Google Docs/PDFs será migrada preservando os modelos e placeholders atuais.')
    };
    await (renderers[code]||renderDashboard)();
  }catch(e){
    q('#content').innerHTML='<div class="empty">'+esc(e.message)+'</div>';
    notify(e.message,true);
  }
}

function metric(label,value,sub=''){
  return '<div class="card metric"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong>'+(sub?'<em>'+esc(sub)+'</em>':'')+'</div>';
}

async function renderDashboard(){
  const d=await api('/api/v1/dashboard');
  const jurisdictions=Object.entries(d.jurisdicoes||{}).sort((a,b)=>b[1]-a[1])
    .map(([k,v])=>'<div class="kv"><b>'+esc(k)+'</b><span>'+esc(v)+' cadastro(s)</span></div>').join('');
  const recent=(d.ultimosCadastros||[]).map(p=>
    '<tr><td><b>'+esc(p.nome)+'</b><br><span class="muted">'+esc(cpf(p.cpf))+'</span></td>'+
    '<td>'+esc(p.cidade||'—')+'</td><td><span class="badge">'+esc(p.jurisdicao||'—')+'</span></td>'+
    '<td>'+esc(p.documentos)+'</td><td><button class="secondary open-person" data-id="'+esc(p.id)+'">Abrir</button></td></tr>'
  ).join('');
  const activities=(d.atividades||[]).map(a=>
    '<div class="person-card"><h4>'+esc(a.descricao)+'</h4><p>'+esc(date(a.data))+' · '+esc(a.usuario||'sistema')+'</p></div>'
  ).join('');
  q('#content').innerHTML=
    '<div class="grid cards">'+
      metric('Pessoas',d.pessoas)+metric('Documentos',d.documentos)+metric('A conferir',d.aConferir)+
      metric('Ações em tramitação',d.acoesTramitacao)+metric('Minhas tarefas',d.minhasTarefas)+
      metric('Valor das causas',money(d.valorCausas))+
    '</div>'+
    '<div class="split">'+
      '<div class="panel"><div class="panel-head"><h3>Cadastros recentes</h3><button class="secondary" id="newPerson">Novo cadastro</button></div>'+
      '<div class="table-wrap"><table><thead><tr><th>Pessoa</th><th>Município</th><th>Jurisdição</th><th>Docs</th><th></th></tr></thead><tbody>'+recent+'</tbody></table></div></div>'+
      '<div class="panel"><div class="panel-head"><h3>Jurisdições</h3></div>'+jurisdictions+'</div>'+
    '</div>'+
    '<div class="panel" style="margin-top:16px"><div class="panel-head"><h3>Atividade recente</h3></div><div class="list">'+(activities||'<div class="empty">Sem atividade recente.</div>')+'</div></div>';
  q('#newPerson').onclick=()=>go('PESS');
  qa('.open-person').forEach(b=>b.onclick=()=>openDossier(b.dataset.id));
}

const personFields=[
  ['nome','Nome completo','text','span2'],['cpf','CPF','text',''],['nascimento','Nascimento','text',''],
  ['telefone','Telefone','text',''],['email','E-mail','email',''],['tipoVia','Tipo de via','text',''],['via','Logradouro','text','span2'],
  ['numero','Número','text',''],['complemento','Complemento','text',''],['bairro','Bairro','text',''],['cep','CEP','text',''],
  ['cidade','Município','text','span2'],['uf','UF','text',''],['entidade','Entidade','text','span2'],
  ['outraEntidade','Outra entidade','text',''],['analfabeto','Analfabeto','text',''],['parcelasNaoRecebidas','Parcelas não recebidas','number','']
];

function formPersonHtml(p={}){
  return personFields.map(([name,label,type,cls])=>{
    const snake=name.replace(/[A-Z]/g,m=>'_'+m.toLowerCase());
    const value=p[name]??p[snake]??'';
    return '<div class="field '+cls+'"><label>'+esc(label)+'<input name="'+esc(name)+'" type="'+type+'" value="'+esc(value)+'"'+(name==='nome'||name==='cpf'||name==='cidade'?' required':'')+'></label></div>';
  }).join('');
}

async function renderPersonForm(person=null){
  const editing=!!person;
  q('#content').innerHTML=
    '<div class="panel"><div class="panel-head"><div><h3>'+(editing?'Retificar cadastro':'Novo cadastro')+'</h3>'+
    '<p class="muted">'+(editing?'Atualize somente o que precisa ser corrigido.':'Os dados serão gravados diretamente no PostgreSQL.')+'</p></div></div>'+
    '<form id="personForm"><div class="form-grid">'+formPersonHtml(person||{})+'</div>'+
    '<div class="actions">'+(editing?'<button type="button" class="ghost" id="cancelEdit">Cancelar</button>':'')+
    '<button class="primary" type="submit">'+(editing?'Salvar alterações':'Salvar cadastro')+'</button></div></form></div>';
  if(editing)q('#cancelEdit').onclick=()=>go('ACOMP');
  q('#personForm').onsubmit=async e=>{
    e.preventDefault();
    const data=Object.fromEntries(new FormData(e.currentTarget));
    if(editing)data.versao=person.versao;
    try{
      const saved=await api(editing?'/api/v1/pessoas/'+encodeURIComponent(person.id):'/api/v1/pessoas',{
        method:editing?'PUT':'POST',body:JSON.stringify(data)
      });
      notify(editing?'Cadastro atualizado.':'Cadastro criado.');
      await openDossier(saved.id);
    }catch(err){notify(err.message,true);}
  };
}

async function renderPeople(){
  q('#content').innerHTML=
    '<div class="panel"><div class="toolbar"><div class="grow field"><label>Buscar por nome, CPF ou município<input id="peopleSearch" placeholder="Digite para buscar"></label></div>'+
    '<button class="primary" id="peopleFind">Buscar</button></div><div id="peopleResults" class="loading">Carregando…</div></div>';
  const run=async()=>{
    const term=q('#peopleSearch').value.trim();
    const rows=await api('/api/v1/pessoas?limit=200&busca='+encodeURIComponent(term));
    q('#peopleResults').innerHTML=rows.length?
      '<div class="table-wrap"><table><thead><tr><th>Nome</th><th>CPF</th><th>Município</th><th>Jurisdição</th><th></th></tr></thead><tbody>'+
      rows.map(p=>'<tr><td><b>'+esc(p.nome)+'</b></td><td>'+esc(cpf(p.cpf))+'</td><td>'+esc(p.cidade||'—')+'</td><td><span class="badge">'+esc(p.jurisdicao||'—')+'</span></td><td><button class="secondary open-person" data-id="'+esc(p.id)+'">Abrir</button></td></tr>').join('')+
      '</tbody></table></div>':'<div class="empty">Nenhuma pessoa localizada.</div>';
    qa('.open-person').forEach(b=>b.onclick=()=>openDossier(b.dataset.id));
  };
  q('#peopleFind').onclick=run;
  q('#peopleSearch').onkeydown=e=>{if(e.key==='Enter')run();};
  await run();
}

async function openDossier(id){
  const d=await api('/api/v1/dossie/'+encodeURIComponent(id));
  const p=d.pessoa;
  const docs=(d.documentos||[]).map(x=>
    '<tr><td>'+esc(x.categoria||'Documento')+'</td><td>'+esc(x.nome||'—')+'</td><td>'+(x.conferido?'<span class="badge ok">Conferido</span>':'<span class="badge warn">Pendente</span>')+'</td>'+
    '<td>'+(x.url?'<a class="doc-link" target="_blank" rel="noopener" href="'+esc(x.url)+'">Abrir</a>':'—')+'</td></tr>'
  ).join('');
  const procs=(d.processos||[]).map(x=>'<div class="person-card"><h4>'+esc(x.numero||'Processo')+'</h4><p>'+esc(x.juizo||p.jurisdicao||'')+' · '+esc(date(x.distribuido_em))+'</p></div>').join('');
  q('#dialogBody').innerHTML=
    '<div class="panel-head"><div><div class="eyebrow">DOSSIÊ</div><h3>'+esc(p.nome)+'</h3></div>'+
    ((hasPermission('retificacao')||hasPermission('retificacao_propria'))?'<button class="primary" id="editPerson">Retificar</button>':'')+'</div>'+
    '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">'+
      '<div class="person-card"><h4>Identificação</h4><p>'+esc(cpf(p.cpf))+'</p><p>'+esc(p.nascimento||'')+'</p><p>'+esc(p.telefone||'')+'</p></div>'+
      '<div class="person-card"><h4>Endereço</h4><p>'+esc([p.tipo_via,p.via,p.numero,p.complemento].filter(Boolean).join(' '))+'</p><p>'+esc([p.bairro,p.cidade,p.uf].filter(Boolean).join(' · '))+'</p></div>'+
      '<div class="person-card"><h4>Atendimento</h4><p>Jurisdição: '+esc(p.jurisdicao||'—')+'</p><p>Parcelas: '+esc(p.parcelas_nao_recebidas||'—')+'</p><p>Valor: '+esc(money(Number(p.parcelas_nao_recebidas||0)*1518))+'</p></div>'+
    '</div>'+
    '<h3 style="margin-top:20px">Documentos</h3>'+(docs?'<div class="table-wrap"><table><thead><tr><th>Categoria</th><th>Arquivo</th><th>Status</th><th></th></tr></thead><tbody>'+docs+'</tbody></table></div>':'<div class="empty">Nenhum documento registrado.</div>')+
    '<h3 style="margin-top:20px">Processos</h3><div class="list">'+(procs||'<div class="empty">Nenhum processo registrado.</div>')+'</div>';
  const edit=q('#editPerson');
  if(edit)edit.onclick=()=>{q('#dialog').close();current='PESS';q('#pageTitle').textContent='Retificar cadastro';buildNav();renderPersonForm(p);};
  q('#dialog').showModal();
}

async function renderMyTasks(){
  const data=await api('/api/v1/tarefas/minhas');
  const card=t=>'<div class="task-card"><div class="panel-head"><div><h4>'+esc(t.pessoa)+'</h4><p>'+esc(cpf(t.cpf))+' · '+esc(t.jurisdicao||'—')+'</p></div><span class="badge '+(t.situacao==='CONCLUIDA'?'ok':'warn')+'">'+esc(t.situacao)+'</span></div>'+
    '<p>Valor da causa: <b>'+esc(money(t.valorCausa))+'</b></p>'+
    (t.situacao!=='CONCLUIDA'?'<div class="toolbar"><div class="grow field"><label>Número CNJ<input class="process-number" data-id="'+esc(t.id)+'" placeholder="0000000-00.0000.0.00.0000"></label></div><button class="primary finish-task" data-id="'+esc(t.id)+'">Concluir distribuição</button></div>':'<p>Concluída em '+esc(date(t.concluidaEm))+'</p>')+'</div>';
  q('#content').innerHTML=
    '<div class="split"><div class="panel"><div class="panel-head"><h3>Pendentes</h3><span class="badge warn">'+data.pendentes.length+'</span></div><div class="list">'+(data.pendentes.map(card).join('')||'<div class="empty">Nenhuma tarefa pendente.</div>')+'</div></div>'+
    '<div class="panel"><div class="panel-head"><h3>Concluídas</h3><span class="badge ok">'+data.concluidas.length+'</span></div><div class="list">'+(data.concluidas.map(card).join('')||'<div class="empty">Nenhuma tarefa concluída.</div>')+'</div></div></div>';
  qa('.finish-task').forEach(b=>b.onclick=async()=>{
    const input=q('.process-number[data-id="'+CSS.escape(b.dataset.id)+'"]');
    try{
      await api('/api/v1/distribuicao/'+encodeURIComponent(b.dataset.id)+'/concluir',{method:'POST',body:JSON.stringify({numero:input.value})});
      notify('Distribuição concluída e processo criado.');
      await renderMyTasks();
    }catch(e){notify(e.message,true);}
  });
}

async function renderDistribution(){
  const data=await api('/api/v1/distribuicao');
  const options='<option value="">Selecione</option>'+data.usuarios.map(u=>'<option value="'+esc(u.email)+'">'+esc(u.nome)+' · '+esc(u.funcao)+'</option>').join('');
  const rows=data.tarefas.map(t=>
    '<tr><td><b>'+esc(t.pessoa)+'</b><br><span class="muted">'+esc(cpf(t.cpf))+'</span></td><td>'+esc(t.jurisdicao||'—')+'</td><td>'+esc(money(t.valorCausa))+'</td>'+
    '<td><span class="badge '+(t.situacao==='CONCLUIDA'?'ok':t.situacao==='ATRIBUIDA'?'warn':'')+'">'+esc(t.situacao)+'</span></td>'+
    '<td>'+(t.situacao==='CONCLUIDA'?esc(t.responsavelNome||t.responsavel||'—'):'<select class="assign-user" data-id="'+esc(t.id)+'">'+options+'</select>')+'</td>'+
    '<td>'+(t.situacao==='CONCLUIDA'?'—':'<button class="secondary assign-task" data-id="'+esc(t.id)+'">Atribuir</button>')+'</td></tr>'
  ).join('');
  q('#content').innerHTML=
    '<div class="grid cards">'+metric('Sem responsável',data.indicadores.semResponsavel)+metric('Atribuídas',data.indicadores.atribuidas)+metric('Concluídas',data.indicadores.concluidas)+'</div>'+
    '<div class="panel" style="margin-top:16px"><div class="panel-head"><h3>Fila de distribuição</h3></div>'+
    '<div class="table-wrap"><table><thead><tr><th>Pessoa</th><th>Jurisdição</th><th>Valor</th><th>Situação</th><th>Responsável</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
  qa('.assign-user').forEach(s=>{
    const task=data.tarefas.find(t=>t.id===s.dataset.id);
    if(task?.responsavel)s.value=task.responsavel;
  });
  qa('.assign-task').forEach(b=>b.onclick=async()=>{
    const s=q('.assign-user[data-id="'+CSS.escape(b.dataset.id)+'"]');
    try{
      await api('/api/v1/distribuicao/'+encodeURIComponent(b.dataset.id)+'/atribuir',{method:'PATCH',body:JSON.stringify({responsavel:s.value})});
      notify('Tarefa atribuída.');
      await renderDistribution();
    }catch(e){notify(e.message,true);}
  });
}

async function renderProcesses(){
  const rows=await api('/api/v1/processos');
  q('#content').innerHTML=
    '<div class="panel"><div class="panel-head"><h3>Processos judiciais</h3><span class="badge">'+rows.length+'</span></div>'+
    (rows.length?'<div class="table-wrap"><table><thead><tr><th>Processo</th><th>Pessoa</th><th>CPF</th><th>Jurisdição</th><th>Distribuição</th><th>Responsável</th></tr></thead><tbody>'+
    rows.map(p=>'<tr><td><b>'+esc(p.numero||'—')+'</b></td><td>'+esc(p.pessoa)+'</td><td>'+esc(cpf(p.cpf))+'</td><td>'+esc(p.jurisdicao||'—')+'</td><td>'+esc(date(p.distribuidoEm))+'</td><td>'+esc(p.responsavel||'—')+'</td></tr>').join('')+
    '</tbody></table></div>':'<div class="empty">Nenhum processo registrado.</div>')+'</div>';
}

async function renderProfile(){
  const data=await api('/api/v1/perfil'),u=data.usuario;
  q('#content').innerHTML=
    '<div class="split"><div class="panel"><div class="panel-head"><h3>Dados do perfil</h3></div>'+
    '<form id="profileForm" class="form-grid"><div class="field span2"><label>Nome<input name="nome" value="'+esc(u.nome)+'" required></label></div>'+
    '<div class="field span2"><label>Nome de usuário<input name="nomeUsuario" value="'+esc(u.nomeUsuario)+'" required></label></div>'+
    '<div class="field span2"><label>E-mail<input name="email" type="email" value="'+esc(u.email)+'" required></label></div>'+
    '<div class="field span2"><label>Senha atual <span class="muted">(somente se mudar o e-mail)</span><input name="senhaAtual" type="password"></label></div>'+
    '<div class="actions span4"><button class="primary">Salvar perfil</button></div></form></div>'+
    '<div class="panel"><div class="panel-head"><h3>Alterar senha</h3></div><form id="passwordForm" class="grid">'+
    '<div class="field"><label>Senha atual<input name="senhaAtual" type="password" required></label></div>'+
    '<div class="field"><label>Nova senha<input name="novaSenha" type="password" required></label></div>'+
    '<button class="primary">Alterar senha</button></form></div></div>';
  q('#profileForm').onsubmit=async e=>{
    e.preventDefault();
    try{
      const out=await api('/api/v1/perfil',{method:'PUT',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});
      boot.usuario=out.usuario;boot.email=out.usuario.email;showApp();notify('Perfil atualizado.');
    }catch(err){notify(err.message,true);}
  };
  q('#passwordForm').onsubmit=async e=>{
    e.preventDefault();
    try{await api('/api/v1/perfil/senha',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});e.currentTarget.reset();notify('Senha alterada.');}
    catch(err){notify(err.message,true);}
  };
}

async function renderAdmin(){
  const data=await api('/api/v1/admin');
  const cards=data.usuarios.map(u=>{
    const checks=data.permissoes.map(p=>'<label style="display:flex;gap:6px;align-items:center;font-size:11px"><input style="width:auto" type="checkbox" class="perm" value="'+esc(p.key)+'" '+((u.permissoesEfetivas||[]).includes(p.key)?'checked':'')+'>'+esc(p.label)+'</label>').join('');
    const profiles=data.perfis.map(p=>'<option '+(p===u.perfil?'selected':'')+'>'+esc(p)+'</option>').join('');
    return '<div class="person-card admin-user" data-id="'+esc(u.id)+'"><div class="panel-head"><div><h4>'+esc(u.nome||u.email)+'</h4><p>'+esc(u.email)+'</p></div><span class="badge '+(u.ativo?'ok':'danger')+'">'+(u.ativo?'Ativo':'Inativo')+'</span></div>'+
      '<div class="form-grid"><div class="field"><label>Perfil<select class="profile">'+profiles+'</select></label></div><div class="field"><label>Função<input class="role" value="'+esc(u.funcao||'')+'"></label></div>'+
      '<div class="field"><label>Status<select class="active"><option value="true" '+(u.ativo?'selected':'')+'>Ativo</option><option value="false" '+(!u.ativo?'selected':'')+'>Inativo</option></select></label></div>'+
      '<div class="span4" style="display:flex;flex-wrap:wrap;gap:8px">'+checks+'</div></div><div class="actions"><button class="secondary save-user">Salvar acessos</button></div></div>';
  }).join('');
  q('#content').innerHTML=
    '<div class="panel"><div class="panel-head"><div><h3>Usuários e permissões</h3><p class="muted">Alterações de acesso revogam as sessões anteriores do usuário.</p></div><span class="badge">'+data.usuarios.length+'</span></div><div class="list">'+cards+'</div></div>';
  qa('.save-user').forEach(b=>b.onclick=async()=>{
    const card=b.closest('.admin-user');
    const body={
      perfil:card.querySelector('.profile').value,
      funcao:card.querySelector('.role').value,
      ativo:card.querySelector('.active').value==='true',
      permissoes:Array.from(card.querySelectorAll('.perm:checked')).map(x=>x.value)
    };
    try{await api('/api/v1/admin/usuarios/'+encodeURIComponent(card.dataset.id),{method:'PUT',body:JSON.stringify(body)});notify('Acessos atualizados.');await renderAdmin();}
    catch(e){notify(e.message,true);}
  });
}

function renderMigration(title,text){
  q('#content').innerHTML='<div class="panel migration"><div class="eyebrow">MIGRAÇÃO EM ANDAMENTO</div><h3>'+esc(title)+'</h3><p>'+esc(text)+'</p><p>O módulo continua disponível no Apps Script atual enquanto esta parte é portada para o Google Cloud.</p></div>';
}

async function bootstrap(){
  boot=await api('/api/v1/bootstrap');
  current=boot.home||'PAINEL';
  showApp();
  await go(current);
}

qa('.auth-tab').forEach(tab=>tab.onclick=()=>{
  qa('.auth-tab').forEach(x=>x.classList.toggle('active',x===tab));
  q('#loginForm').classList.toggle('hidden',tab.dataset.authTab!=='login');
  q('#registerForm').classList.toggle('hidden',tab.dataset.authTab!=='register');
  q('#authMessage').textContent='';
});

q('#loginForm').onsubmit=async e=>{
  e.preventDefault();
  q('#authMessage').textContent='Entrando…';
  try{
    const r=await api('/api/v1/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});
    sessionStorage.setItem(TOKEN_KEY,r.sessionToken);
    await bootstrap();
  }catch(err){q('#authMessage').textContent=err.message;}
};

q('#registerForm').onsubmit=async e=>{
  e.preventDefault();
  q('#authMessage').textContent='Criando acesso…';
  try{
    const r=await api('/api/v1/auth/register',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});
    sessionStorage.setItem(TOKEN_KEY,r.sessionToken);
    await bootstrap();
  }catch(err){q('#authMessage').textContent=err.message;}
};

q('#logout').onclick=async()=>{
  try{await api('/api/v1/auth/logout',{method:'POST'});}catch{}
  sessionStorage.removeItem(TOKEN_KEY);
  boot=null;
  showAuth();
};

if(token())bootstrap().catch(()=>showAuth());
else showAuth();
