import {getPool,tx} from './db.mjs';
import {
  all,get,requirePermission,authorizePersonScope,personInUserScope,
  randomId,httpError,now,bool
} from './core.mjs';
import {has,isColonyUser} from './access.mjs';

const email_=user=>String(user?.email||'').trim().toLowerCase();
const text_=value=>String(value??'').trim();
const toIso_=value=>{
  if(!value)return '';
  const d=value instanceof Date?value:new Date(value);
  return Number.isNaN(d.getTime())?String(value):d.toISOString();
};
const row_=row=>{
  const out={};
  for(const [k,v] of Object.entries(row||{})){
    const key=k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
    out[key]=v instanceof Date?v.toISOString():v;
  }
  return out;
};
const rows_=rows=>rows.map(row_);

function sanitizeRichHtml(value){
  let html=String(value||'').slice(0,30000);
  const placeholders=[];
  html=html.replace(/<<([A-Z0-9_]+)>>/gi,m=>{
    const token='__PDA_PLACEHOLDER_'+placeholders.length+'__';
    placeholders.push(m);
    return token;
  });
  html=html.replace(/<\s*(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,'');
  html=html.replace(/\son\w+\s*=\s*(['"]).*?\1/gi,'');
  html=html.replace(/\son\w+\s*=\s*[^\s>]+/gi,'');
  html=html.replace(/javascript\s*:/gi,'');
  const allowed=new Set(['B','STRONG','I','EM','U','BR','P','DIV','UL','OL','LI','BLOCKQUOTE','H1','H2','H3','H4','A','SPAN']);
  html=html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi,(m,tag,attrs)=>{
    const upper=tag.toUpperCase();
    if(!allowed.has(upper))return '';
    if(m.startsWith('</'))return '</'+tag+'>';
    if(upper==='A'){
      const href=(attrs.match(/href\s*=\s*(['"])(.*?)\1/i)||[])[2]||'';
      const safe=/^(https?:|mailto:|tel:)/i.test(href)?href:'';
      return safe?'<a href="'+safe.replace(/"/g,'&quot;')+'" target="_blank" rel="noopener noreferrer">':'<a>';
    }
    return '<'+tag+'>';
  });
  html=html.trim();
  placeholders.forEach((placeholder,index)=>{
    html=html.replaceAll('__PDA_PLACEHOLDER_'+index+'__',placeholder);
  });
  return html;
}
function plain_(html){
  return String(html||'')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/p>/gi,'\n')
    .replace(/<[^>]+>/g,'')
    .replace(/&nbsp;/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .trim();
}
function isoDate_(value){
  const s=String(value||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';
}
function addDays_(date,days){
  const [y,m,d]=date.split('-').map(Number);
  const x=new Date(Date.UTC(y,m-1,d));
  x.setUTCDate(x.getUTCDate()+Number(days||0));
  return x.toISOString().slice(0,10);
}
function easterDate_(year){
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4;
  const l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31);
  const day=((h+l-7*m+114)%31)+1;
  return new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10);
}

export function institutionalHolidays(year){
  year=Number(year)||new Date().getFullYear();
  const easter=easterDate_(year);
  const fixed=[
    ['01-01','Confraternização Universal','FERIADO'],
    ['04-21','Tiradentes','FERIADO'],
    ['05-01','Dia do Trabalho','FERIADO'],
    ['09-07','Independência do Brasil','FERIADO'],
    ['09-20','Revolução Farroupilha','FERIADO_RS'],
    ['10-12','Nossa Senhora Aparecida','FERIADO'],
    ['11-02','Finados','FERIADO'],
    ['11-15','Proclamação da República','FERIADO'],
    ['11-20','Dia Nacional de Zumbi e da Consciência Negra','FERIADO'],
    ['12-25','Natal','FERIADO']
  ].map(([md,titulo,tipo])=>({data:year+'-'+md,titulo,tipo}));
  return [
    ...fixed,
    {data:addDays_(easter,-48),titulo:'Carnaval — segunda-feira',tipo:'PONTO_FACULTATIVO'},
    {data:addDays_(easter,-47),titulo:'Carnaval — terça-feira',tipo:'PONTO_FACULTATIVO'},
    {data:addDays_(easter,-2),titulo:'Paixão de Cristo',tipo:'FERIADO'},
    {data:addDays_(easter,60),titulo:'Corpus Christi',tipo:'PONTO_FACULTATIVO'}
  ].sort((a,b)=>a.data.localeCompare(b.data));
}

/*
 * Calendário Universitário FURG 2026/2027.
 * Fonte institucional: Resolução COEPEA/FURG nº 309/2025.
 * Mantemos aqui apenas marcos operacionais/acadêmicos e suspensões que
 * precisam aparecer na agenda da equipe. Eventos locais do projeto, como
 * saídas de campo, continuam sendo cadastrados pela própria equipe.
 */
export function furgAcademicCalendar(year){
  year=Number(year);

  if(year===2026){
    return [
      {data:'2026-02-02',titulo:'Nossa Senhora dos Navegantes — feriado municipal FURG',tipo:'FERIADO_FURG',local:'Rio Grande / São Lourenço do Sul / Santa Vitória do Palmar'},
      {data:'2026-02-16',titulo:'Carnaval — ponto facultativo FURG',tipo:'PONTO_FACULTATIVO_FURG'},
      {data:'2026-02-17',titulo:'Carnaval — ponto facultativo FURG',tipo:'PONTO_FACULTATIVO_FURG'},
      {data:'2026-02-18',titulo:'Quarta-feira de Cinzas — ponto facultativo até 14h',tipo:'PONTO_FACULTATIVO_FURG'},
      {data:'2026-03-02',titulo:'FURG — início do 1º semestre letivo',tipo:'FURG'},
      {data:'2026-04-20',titulo:'FURG — ponto facultativo',tipo:'PONTO_FACULTATIVO_FURG'},
      {data:'2026-06-05',titulo:'FURG — ponto facultativo',tipo:'PONTO_FACULTATIVO_FURG'},
      {data:'2026-06-13',titulo:'Santo Antônio — feriado municipal do Campus SAP',tipo:'FERIADO_FURG',local:'Santo Antônio da Patrulha'},
      {data:'2026-06-29',titulo:'São Pedro — feriado municipal em Rio Grande',tipo:'FERIADO_FURG',local:'Rio Grande'},
      {data:'2026-07-03',titulo:'FURG — término do 1º semestre letivo presencial',tipo:'FURG'},
      {inicio:'2026-07-06',fim:'2026-07-17',titulo:'FURG — período de exames do 1º semestre',tipo:'FURG'},
      {data:'2026-07-17',titulo:'FURG — término do 1º semestre letivo EaD',tipo:'FURG'},
      {data:'2026-08-03',titulo:'FURG — início do 2º semestre letivo',tipo:'FURG'},
      {data:'2026-08-10',titulo:'São Lourenço — feriado municipal do Campus SLS',tipo:'FERIADO_FURG',local:'São Lourenço do Sul'},
      {data:'2026-08-20',titulo:'Aniversário da FURG',tipo:'FURG'},
      {data:'2026-10-28',titulo:'Dia do Servidor Público — ponto facultativo FURG',tipo:'PONTO_FACULTATIVO_FURG'},
      {inicio:'2026-11-11',fim:'2026-11-13',titulo:'XXV Mostra da Produção Universitária — suspensão das aulas',tipo:'FURG'},
      {data:'2026-12-05',titulo:'FURG — término do 2º semestre letivo presencial',tipo:'FURG'},
      {inicio:'2026-12-07',fim:'2026-12-18',titulo:'FURG — período de exames do 2º semestre',tipo:'FURG'},
      {data:'2026-12-18',titulo:'FURG — término do 2º semestre letivo EaD',tipo:'FURG'},
      {inicio:'2026-12-23',fim:'2027-01-02',titulo:'FURG — suspensão das atividades acadêmicas',tipo:'RECESSO_FURG'}
    ];
  }

  if(year===2027){
    return [
      {data:'2027-01-02',titulo:'FURG — fim da suspensão das atividades acadêmicas',tipo:'RECESSO_FURG'},
      {data:'2027-01-04',titulo:'FURG — início do período letivo especial',tipo:'FURG'},
      {data:'2027-02-02',titulo:'Nossa Senhora dos Navegantes — feriado municipal FURG',tipo:'FERIADO_FURG',local:'Rio Grande / São Lourenço do Sul / Santa Vitória do Palmar'},
      {data:'2027-02-08',titulo:'Carnaval — ponto facultativo FURG',tipo:'PONTO_FACULTATIVO_FURG'},
      {data:'2027-02-09',titulo:'Carnaval — ponto facultativo FURG',tipo:'PONTO_FACULTATIVO_FURG'},
      {data:'2027-02-10',titulo:'Quarta-feira de Cinzas — ponto facultativo até 14h',tipo:'PONTO_FACULTATIVO_FURG'},
      {data:'2027-02-12',titulo:'FURG — término do período letivo especial',tipo:'FURG'},
      {data:'2027-03-01',titulo:'FURG — início do ano letivo de 2027',tipo:'FURG'}
    ];
  }

  return [];
}

async function storedClosedDates_(years){
  const pool=await getPool();
  const min=Math.min(...years),max=Math.max(...years);
  const q=await pool.query(
    "select inicio,tipo from agenda_eventos where ativo=true and tipo in ('FERIADO','FERIADO_FURG','RECESSO_FURG') and extract(year from inicio)::int between $1 and $2",
    [min,max]
  );
  return new Set(q.rows.map(r=>String(r.inicio).slice(0,10)));
}

export async function deadlineCalculate(q,user){
  requirePermission(user,'consulta');
  const start=isoDate_(q.inicio)||new Date().toISOString().slice(0,10);
  const qty=Math.max(1,Math.min(365,Number(q.quantidade||q.dias||1)));
  const mode=String(q.modo||q.contagem||'CORRIDOS').toUpperCase()==='UTEIS'?'UTEIS':'CORRIDOS';
  if(mode==='CORRIDOS')return {inicio:start,quantidade:qty,modo:mode,vencimento:addDays_(start,qty)};
  const years=[Number(start.slice(0,4)),Number(start.slice(0,4))+1,Number(start.slice(0,4))+2];
  const closed=await storedClosedDates_(years);
  for(const y of years)for(const h of institutionalHolidays(y))if(h.tipo!=='PONTO_FACULTATIVO')closed.add(h.data);
  let date=start,count=0;
  while(count<qty){
    date=addDays_(date,1);
    const d=new Date(date+'T12:00:00Z').getUTCDay();
    if(d===0||d===6||closed.has(date))continue;
    count++;
  }
  return {inicio:start,quantidade:qty,modo:mode,vencimento:date};
}

function visibleAgenda_(event,user){
  const me=email_(user);
  if(String(event.responsavel||'').toLowerCase()===me)return true;
  const participants=Array.isArray(event.participantes)?event.participantes:[];
  if(participants.map(v=>String(v).toLowerCase()).includes(me))return true;
  const vis=String(event.visibilidade||'EQUIPE').toUpperCase();
  if(vis==='PESSOAL')return false;
  if(isColonyUser(user)){
    return vis==='INSTITUCIONAL'||(text_(event.entidade)&&text_(event.entidade)===text_(user.entidade));
  }
  return true;
}

export async function agendaList(q,user){
  requirePermission(user,'consulta');
  const today=new Date().toISOString().slice(0,10);
  const de=isoDate_(q.de)||today.slice(0,8)+'01';
  const ate=isoDate_(q.ate)||addDays_(de,62);
  const pool=await getPool();
  const db=await pool.query(
    "select * from agenda_eventos where ativo=true and inicio::date <= $2::date and coalesce(fim,inicio)::date >= $1::date order by inicio,id",
    [de,ate]
  );
  const events=rows_(db.rows).filter(e=>visibleAgenda_(e,user));

  const [people,tasks]=await Promise.all([all('Pessoas'),all('Tarefas')]);
  const visiblePeople=people.filter(p=>personInUserScope(user,p));
  const ids=new Set(visiblePeople.map(p=>p.id));
  const peopleById=new Map(visiblePeople.map(p=>[p.id,p]));
  for(const t of tasks){
    const date=isoDate_(t.prazo);
    if(!date||date<de||date>ate)continue;
    if(t.pessoaId&&!ids.has(t.pessoaId))continue;
    const owner=String(t.responsavel||'').toLowerCase();
    if(owner&&owner!==email_(user)&&!has(user,'gestao_distribuicao'))continue;
    const p=peopleById.get(t.pessoaId);
    events.push({
      id:'TASK_'+t.id,titulo:t.titulo||'Prazo de tarefa',descricao:t.descricao||'',
      inicio:date+'T12:00:00.000Z',fim:date+'T12:00:00.000Z',diaInteiro:true,
      tipo:'PRAZO_TAREFA',fonte:'TAREFAS',pessoaId:t.pessoaId||'',tarefaId:t.id,
      pessoa:p?.nome||'',responsavel:t.responsavel||'',visibilidade:'PESSOAL',sintetico:true
    });
  }

  const years=[];
  for(let y=Number(de.slice(0,4));y<=Number(ate.slice(0,4));y++)years.push(y);
  for(const y of years){
    for(const h of institutionalHolidays(y)){
      if(h.data<de||h.data>ate)continue;
      events.push({
        id:'HOLIDAY_'+h.data+'_'+h.tipo,titulo:h.titulo,inicio:h.data+'T12:00:00.000Z',
        fim:h.data+'T12:00:00.000Z',diaInteiro:true,tipo:h.tipo,fonte:'CALENDARIO_BRASIL',
        visibilidade:'INSTITUCIONAL',sintetico:true
      });
    }

    for(const furg of furgAcademicCalendar(y)){
      const start=furg.inicio||furg.data||'';
      const end=furg.fim||furg.data||start;
      if(!start||end<de||start>ate)continue;
      events.push({
        id:'FURG_'+start+'_'+String(furg.tipo||'FURG')+'_'+String(furg.titulo||'').slice(0,24),
        titulo:furg.titulo,
        descricao:'Calendário Universitário FURG 2026/2027 — Resolução COEPEA/FURG nº 309/2025.',
        inicio:start+'T12:00:00.000Z',
        fim:end+'T12:00:00.000Z',
        diaInteiro:true,
        tipo:furg.tipo||'FURG',
        fonte:'FURG_COEPEA_309_2025',
        local:furg.local||'FURG',
        visibilidade:'INSTITUCIONAL',
        sintetico:true
      });
    }
  }
  return {de,ate,eventos:events.sort((a,b)=>String(a.inicio).localeCompare(String(b.inicio))||String(a.titulo).localeCompare(String(b.titulo),'pt-BR'))};
}

export async function agendaSave(q,user){
  requirePermission(user,'consulta');
  const title=text_(q.titulo);
  if(!title)throw httpError(400,'Informe o título do evento.');
  const start=toIso_(q.inicio);
  if(!start)throw httpError(400,'Informe a data inicial.');
  const type=String(q.tipo||'COMPROMISSO').toUpperCase();
  if(['FERIADO','FURG','FERIADO_FURG','RECESSO_FURG'].includes(type)&&!has(user,'administracao')){
    throw httpError(403,'Somente a Administração pode alterar feriados e calendário FURG.');
  }
  const visibility=String(q.visibilidade||'EQUIPE').toUpperCase();
  if(visibility==='INSTITUCIONAL'&&!has(user,'administracao')&&!has(user,'gestao_distribuicao')){
    throw httpError(403,'Somente a coordenação pode criar eventos institucionais.');
  }
  if(q.pessoaId){
    const person=await get('Pessoas',q.pessoaId);
    authorizePersonScope(user,person);
  }
  return tx(async client=>{
    const id=text_(q.id)||randomId('AGE');
    const existing=text_(q.id)?(await client.query('select * from agenda_eventos where id=$1',[id])).rows[0]:null;
    const version=existing?Number(existing.versao||0)+1:1;
    const participants=Array.isArray(q.participantes)?q.participantes.map(v=>text_(v).toLowerCase()).filter(Boolean):[];
    const sql=
      "insert into agenda_eventos("+
      "id,versao,criado_em,alterado_em,usuario_email,titulo,descricao,inicio,fim,dia_inteiro,tipo,fonte,local,"+
      "pessoa_id,processo_id,tarefa_id,visibilidade,responsavel,participantes,cor,recorrencia,entidade,ativo"+
      ") values($1,$2,coalesce($3::timestamptz,now()),now(),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21,true) "+
      "on conflict(id) do update set versao=excluded.versao,alterado_em=now(),usuario_email=excluded.usuario_email,"+
      "titulo=excluded.titulo,descricao=excluded.descricao,inicio=excluded.inicio,fim=excluded.fim,dia_inteiro=excluded.dia_inteiro,"+
      "tipo=excluded.tipo,fonte=excluded.fonte,local=excluded.local,pessoa_id=excluded.pessoa_id,processo_id=excluded.processo_id,"+
      "tarefa_id=excluded.tarefa_id,visibilidade=excluded.visibilidade,responsavel=excluded.responsavel,participantes=excluded.participantes,"+
      "cor=excluded.cor,recorrencia=excluded.recorrencia,entidade=excluded.entidade,ativo=true";
    await client.query(sql,[
      id,version,existing?.criado_em||null,email_(user),title,sanitizeRichHtml(q.descricao||''),start,
      q.fim?toIso_(q.fim):start,bool(q.diaInteiro),type,text_(q.fonte)||'MANUAL',text_(q.local),
      text_(q.pessoaId)||null,text_(q.processoId)||null,text_(q.tarefaId)||null,visibility,
      text_(q.responsavel)||email_(user),JSON.stringify(participants),text_(q.cor)||'#0f7a84',
      text_(q.recorrencia),text_(q.entidade)||text_(user.entidade)
    ]);
    return {
      evento:row_((await client.query('select * from agenda_eventos where id=$1',[id])).rows[0]),
      mensagem:'Evento salvo na agenda.'
    };
  });
}

export async function agendaDelete(q,user){
  requirePermission(user,'consulta');
  const pool=await getPool();
  const row=(await pool.query('select * from agenda_eventos where id=$1',[text_(q.id)])).rows[0];
  if(!row)throw httpError(404,'Evento não localizado.');
  const owner=String(row.responsavel||row.usuario_email||'').toLowerCase()===email_(user);
  if(!owner&&!has(user,'administracao')&&!has(user,'gestao_distribuicao')){
    throw httpError(403,'Você não pode excluir este evento.');
  }
  await pool.query('update agenda_eventos set ativo=false,alterado_em=now(),usuario_email=$2 where id=$1',[row.id,email_(user)]);
  return {ok:true,mensagem:'Evento removido da agenda.'};
}

export async function personNotes(q,user){
  requirePermission(user,'consulta');
  const person=await get('Pessoas',q.pessoaId);
  authorizePersonScope(user,person);
  const pool=await getPool();
  const data=rows_((await pool.query(
    'select * from pessoa_observacoes where pessoa_id=$1 and ativo=true order by fixada desc,criado_em desc,id',
    [person.id]
  )).rows);
  const me=email_(user);
  return {
    pessoa:{id:person.id,nome:person.nome},
    observacoes:data.filter(n=>String(n.visibilidade||'INTERNA')!=='RESTRITA'||String(n.autor||'').toLowerCase()===me||has(user,'administracao'))
  };
}

export async function personNoteSave(q,user){
  requirePermission(user,'consulta');
  const person=await get('Pessoas',q.pessoaId);
  authorizePersonScope(user,person);
  const content=sanitizeRichHtml(q.conteudo||'');
  if(!plain_(content))throw httpError(400,'Escreva a observação.');
  const pool=await getPool();
  const id=randomId('OBS');
  await pool.query(
    "insert into pessoa_observacoes(id,usuario_email,pessoa_id,autor,conteudo,tipo,fixada,visibilidade,ativo) values($1,$2,$3,$4,$5,$6,$7,$8,true)",
    [id,email_(user),person.id,email_(user),content,String(q.tipo||'ATENDIMENTO').toUpperCase(),bool(q.fixada),String(q.visibilidade||'INTERNA').toUpperCase()]
  );
  return {
    observacao:row_((await pool.query('select * from pessoa_observacoes where id=$1',[id])).rows[0]),
    mensagem:'Observação registrada.'
  };
}

export async function personNotePin(q,user){
  requirePermission(user,'consulta');
  const pool=await getPool();
  const note=(await pool.query('select * from pessoa_observacoes where id=$1',[text_(q.id)])).rows[0];
  if(!note)throw httpError(404,'Observação não localizada.');
  const person=await get('Pessoas',note.pessoa_id);
  authorizePersonScope(user,person);
  const owner=String(note.autor||'').toLowerCase()===email_(user);
  if(!owner&&!has(user,'administracao')&&!has(user,'gestao_distribuicao')){
    throw httpError(403,'Você não pode alterar esta observação.');
  }
  await pool.query(
    'update pessoa_observacoes set fixada=$2,alterado_em=now(),usuario_email=$3 where id=$1',
    [note.id,bool(q.fixada),email_(user)]
  );
  return {ok:true,mensagem:bool(q.fixada)?'Observação fixada.':'Observação desafixada.'};
}

async function ensureGeneralChannel_(client){
  await client.query(
    "insert into chat_canais(id,nome,tipo,criado_por,visibilidade,ativo) values('CHAT_GERAL_CIDIJUS','Geral CIDIJUS','SISTEMA','sistema','EQUIPE',true) on conflict(id) do nothing"
  );
}

async function channelAccess_(channelId,user,client){
  await ensureGeneralChannel_(client);
  const channel=(await client.query('select * from chat_canais where id=$1 and ativo=true',[channelId])).rows[0];
  if(!channel)throw httpError(404,'Canal não localizado.');
  if(channel.id==='CHAT_GERAL_CIDIJUS'&&!isColonyUser(user))return channel;
  const member=(await client.query(
    'select * from chat_membros where canal_id=$1 and lower(usuario)=$2 and ativo=true',
    [channel.id,email_(user)]
  )).rows[0];
  if(!member)throw httpError(403,'Você não participa deste canal.');
  return channel;
}

export async function chatBootstrap(user){
  requirePermission(user,'consulta');
  const pool=await getPool();
  await ensureGeneralChannel_(pool);
  const me=email_(user);
  const sql=
    "select c.*,"+
    "(select count(*)::int from chat_mensagens m where m.canal_id=c.id and m.excluida=false) as total_mensagens,"+
    "(select max(m.criado_em) from chat_mensagens m where m.canal_id=c.id and m.excluida=false) as ultima_mensagem_em,"+
    "(select max(mm.ultimo_visto_em) from chat_membros mm where mm.canal_id=c.id and lower(mm.usuario)=$1 and mm.ativo=true) as ultimo_visto_em,"+
    "(select count(*)::int from chat_mensagens mu where mu.canal_id=c.id and mu.excluida=false and lower(mu.autor)<>$1 and mu.criado_em>coalesce((select max(mm2.ultimo_visto_em) from chat_membros mm2 where mm2.canal_id=c.id and lower(mm2.usuario)=$1 and mm2.ativo=true),to_timestamp(0))) as nao_lidas "+
    "from chat_canais c where c.ativo=true and ("+
    "(c.id='CHAT_GERAL_CIDIJUS' and $2=false) or exists(select 1 from chat_membros cm where cm.canal_id=c.id and lower(cm.usuario)=$1 and cm.ativo=true)"+
    ") order by coalesce((select max(m2.criado_em) from chat_mensagens m2 where m2.canal_id=c.id),c.criado_em) desc";
  const channels=rows_((await pool.query(sql,[me,isColonyUser(user)])).rows);
  const users=rows_((await pool.query(
    "select id,email,nome,nome_usuario,funcao,perfil,entidade from usuarios where ativo=true order by lower(coalesce(nome,nome_usuario,email))"
  )).rows).filter(u=>!isColonyUser(user)||text_(u.entidade)===text_(user.entidade));
  return {canais:channels,usuarios:users};
}

export async function chatMessages(q,user){
  requirePermission(user,'consulta');
  const pool=await getPool();
  await channelAccess_(text_(q.canalId),user,pool);
  const limit=Math.max(1,Math.min(200,Number(q.limit||100)));
  const sql=
    "select m.*,coalesce(u.nome,u.nome_usuario,m.autor) autor_nome "+
    "from chat_mensagens m left join usuarios u on lower(u.email)=lower(m.autor) "+
    "where m.canal_id=$1 and m.excluida=false order by m.criado_em desc limit $2";
  const data=rows_((await pool.query(sql,[text_(q.canalId),limit])).rows).reverse();
  return {canalId:text_(q.canalId),mensagens:data};
}

export async function chatCreate(q,user){
  requirePermission(user,'consulta');
  const name=text_(q.nome);
  if(!name)throw httpError(400,'Informe o nome da conversa.');
  const members=[email_(user),...(Array.isArray(q.membros)?q.membros:[])]
    .map(v=>String(v).toLowerCase()).filter(Boolean);
  return tx(async client=>{
    const id=randomId('CHT');
    await client.query(
      "insert into chat_canais(id,usuario_email,nome,tipo,criado_por,pessoa_id,processo_id,tarefa_id,visibilidade,entidade,ativo) "+
      "values($1,$2,$3,$4,$2,$5,$6,$7,$8,$9,true)",
      [id,email_(user),name,String(q.tipo||'GRUPO').toUpperCase(),text_(q.pessoaId)||null,text_(q.processoId)||null,text_(q.tarefaId)||null,String(q.visibilidade||'MEMBROS').toUpperCase(),text_(user.entidade)]
    );
    for(const member of [...new Set(members)]){
      await client.query(
        "insert into chat_membros(id,usuario_email,canal_id,usuario,papel,ultimo_visto_em,silenciado,ativo) values($1,$2,$3,$4,$5,now(),false,true)",
        [randomId('CHM'),email_(user),id,member,member===email_(user)?'ADMIN':'MEMBRO']
      );
    }
    return {
      canal:row_((await client.query('select * from chat_canais where id=$1',[id])).rows[0]),
      mensagem:'Conversa criada.'
    };
  });
}

export async function chatSend(q,user){
  requirePermission(user,'consulta');
  const pool=await getPool();
  const channel=await channelAccess_(text_(q.canalId),user,pool);
  const content=sanitizeRichHtml(q.conteudo||'');
  if(!plain_(content))throw httpError(400,'Escreva uma mensagem.');
  const id=randomId('MSG');
  await pool.query(
    "insert into chat_mensagens(id,usuario_email,canal_id,autor,conteudo,formato,resposta_id,excluida) values($1,$2,$3,$2,$4,'HTML',$5,false)",
    [id,email_(user),channel.id,content,text_(q.respostaId)||null]
  );
  const member=(await pool.query(
    'select id from chat_membros where canal_id=$1 and lower(usuario)=$2 and ativo=true',
    [channel.id,email_(user)]
  )).rows[0];
  if(member){
    await pool.query('update chat_membros set ultimo_visto_em=now(),alterado_em=now() where id=$1',[member.id]);
  }else{
    await pool.query(
      "insert into chat_membros(id,usuario_email,canal_id,usuario,papel,ultimo_visto_em,silenciado,ativo) values($1,$2,$3,$2,'MEMBRO',now(),false,true)",
      [randomId('CHM'),email_(user),channel.id]
    );
  }
  return {mensagem:row_((await pool.query('select * from chat_mensagens where id=$1',[id])).rows[0])};
}

export async function chatMarkRead(q,user){
  requirePermission(user,'consulta');
  const pool=await getPool();
  const channel=await channelAccess_(text_(q.canalId),user,pool);
  const member=(await pool.query(
    'select id from chat_membros where canal_id=$1 and lower(usuario)=$2 and ativo=true',
    [channel.id,email_(user)]
  )).rows[0];
  if(member){
    await pool.query('update chat_membros set ultimo_visto_em=now(),alterado_em=now() where id=$1',[member.id]);
  }else{
    await pool.query(
      "insert into chat_membros(id,usuario_email,canal_id,usuario,papel,ultimo_visto_em,silenciado,ativo) values($1,$2,$3,$2,'MEMBRO',now(),false,true)",
      [randomId('CHM'),email_(user),channel.id]
    );
  }
  return {ok:true};
}

export async function messageTemplates(q,user){
  requirePermission(user,'consulta');
  const pool=await getPool();
  const showInactive=bool(q.inativos)&&has(user,'administracao');
  const data=rows_((await pool.query(
    'select * from mensagens_modelos '+(showInactive?'':'where ativo=true')+' order by categoria,titulo,id'
  )).rows);
  return {modelos:data,podeEditar:has(user,'administracao')||has(user,'gestao_distribuicao')};
}

export async function messageTemplateSave(q,user){
  requirePermission(user,'consulta');
  if(!has(user,'administracao')&&!has(user,'gestao_distribuicao')){
    throw httpError(403,'Somente a coordenação pode editar mensagens padrão.');
  }
  const title=text_(q.titulo);
  if(!title)throw httpError(400,'Informe o título.');
  const content=sanitizeRichHtml(q.conteudo||'');
  if(!plain_(content))throw httpError(400,'Informe o conteúdo.');
  const pool=await getPool();
  const id=text_(q.id)||randomId('MDG');
  const existing=text_(q.id)?(await pool.query('select * from mensagens_modelos where id=$1',[id])).rows[0]:null;
  const sql=
    "insert into mensagens_modelos(id,versao,criado_em,alterado_em,usuario_email,titulo,categoria,conteudo,ativo,canal,criado_por,escopo,placeholders) "+
    "values($1,$2,coalesce($3::timestamptz,now()),now(),$4,$5,$6,$7,$8,$9,$4,$10,$11::jsonb) "+
    "on conflict(id) do update set versao=excluded.versao,alterado_em=now(),usuario_email=excluded.usuario_email,"+
    "titulo=excluded.titulo,categoria=excluded.categoria,conteudo=excluded.conteudo,ativo=excluded.ativo,"+
    "canal=excluded.canal,escopo=excluded.escopo,placeholders=excluded.placeholders";
  await pool.query(sql,[
    id,existing?Number(existing.versao||0)+1:1,existing?.criado_em||null,email_(user),title,
    text_(q.categoria)||'GERAL',content,q.ativo!==false,text_(q.canal)||'WHATSAPP',
    text_(q.escopo)||'EQUIPE',JSON.stringify(Array.isArray(q.placeholders)?q.placeholders:[])
  ]);
  return {
    modelo:row_((await pool.query('select * from mensagens_modelos where id=$1',[id])).rows[0]),
    mensagem:'Mensagem padrão salva.'
  };
}

export async function messageTemplateDelete(q,user){
  if(!has(user,'administracao')&&!has(user,'gestao_distribuicao')){
    throw httpError(403,'Somente a coordenação pode inativar mensagens padrão.');
  }
  const pool=await getPool();
  await pool.query(
    'update mensagens_modelos set ativo=false,alterado_em=now(),usuario_email=$2 where id=$1',
    [text_(q.id),email_(user)]
  );
  return {ok:true,mensagem:'Mensagem padrão inativada.'};
}

export async function messageTemplateRender(q,user){
  requirePermission(user,'consulta');
  const pool=await getPool();
  const model=(await pool.query(
    'select * from mensagens_modelos where id=$1 and ativo=true',
    [text_(q.id)]
  )).rows[0];
  if(!model)throw httpError(404,'Mensagem padrão não localizada.');
  let person=null,process=null;
  if(q.pessoaId){
    person=await get('Pessoas',q.pessoaId);
    authorizePersonScope(user,person);
  }
  if(q.processoId){
    const processes=await all('Processos');
    process=processes.find(p=>p.id===q.processoId)||null;
  }
  const vars={
    NOME:person?.nome||'',CPF:person?.cpf||'',TELEFONE:person?.telefone||'',EMAIL:person?.email||'',
    MUNICIPIO:person?.cidade||'',JURISDICAO:person?.jurisdicao||'',ENTIDADE:person?.entidade||'',
    PROCESSO:process?.numero||'',RESPONSAVEL:user.nome||user.nomeUsuario||user.email||''
  };
  let html=String(model.conteudo||'');
  for(const [k,v] of Object.entries(vars)){
    html=html.replace(new RegExp('<<'+k+'>>','g'),String(v||''));
  }
  return {
    id:model.id,titulo:model.titulo,html,texto:plain_(html),
    telefone:person?.telefone||'',variaveis:vars
  };
}

export const PREFERENCE_DEFAULTS=Object.freeze({
  fonte:'PADRAO',
  tamanho:'NORMAL',
  tema:'CLARO',
  densidade:'CONFORTAVEL',
  corDestaque:'MAR',
  movimentoReduzido:false
});

export async function userPreferences(user){
  requirePermission(user,'consulta');
  const pool=await getPool();
  const data=(await pool.query(
    'select * from usuario_preferencias where lower(usuario)=$1 limit 1',
    [email_(user)]
  )).rows[0];
  return {...PREFERENCE_DEFAULTS,...(data?row_(data):{})};
}

export async function saveUserPreferences(q,user){
  requirePermission(user,'consulta');
  const clean={
    fonte:['PADRAO','LEGIVEL','SERIF'].includes(String(q.fonte||'').toUpperCase())?String(q.fonte).toUpperCase():'PADRAO',
    tamanho:['PEQUENO','NORMAL','GRANDE','MUITO_GRANDE'].includes(String(q.tamanho||'').toUpperCase())?String(q.tamanho).toUpperCase():'NORMAL',
    tema:['CLARO','ESCURO','AUTO'].includes(String(q.tema||'').toUpperCase())?String(q.tema).toUpperCase():'CLARO',
    densidade:['COMPACTA','CONFORTAVEL'].includes(String(q.densidade||'').toUpperCase())?String(q.densidade).toUpperCase():'CONFORTAVEL',
    corDestaque:['MAR','AZUL','VERDE','CORAL','GRAFITE'].includes(String(q.corDestaque||'').toUpperCase())?String(q.corDestaque).toUpperCase():'MAR',
    movimentoReduzido:bool(q.movimentoReduzido)
  };
  const pool=await getPool();
  const me=email_(user);
  const sql=
    "insert into usuario_preferencias(id,usuario_email,usuario,fonte,tamanho,tema,densidade,cor_destaque,movimento_reduzido) "+
    "values($1,$2,$2,$3,$4,$5,$6,$7,$8) "+
    "on conflict(lower(usuario)) do update set alterado_em=now(),usuario_email=excluded.usuario_email,"+
    "fonte=excluded.fonte,tamanho=excluded.tamanho,tema=excluded.tema,densidade=excluded.densidade,"+
    "cor_destaque=excluded.cor_destaque,movimento_reduzido=excluded.movimento_reduzido";
  await pool.query(sql,[
    'PREF_'+me,me,clean.fonte,clean.tamanho,clean.tema,
    clean.densidade,clean.corDestaque,clean.movimentoReduzido
  ]);
  return {preferencias:{...clean,usuario:me},mensagem:'Preferências salvas.'};
}
