import {getPool,closeDb} from '../src/db.mjs';
import {all} from '../src/core.mjs';
import {permissions} from '../src/access.mjs';
import {
  institutionalHolidays,furgAcademicCalendar,deadlineCalculate,
  agendaList,agendaSave,agendaDelete,
  personNotes,personNoteSave,personNotePin,
  chatBootstrap,chatCreate,chatSend,chatMessages,chatMarkRead,
  messageTemplates,messageTemplateSave,messageTemplateDelete,messageTemplateRender,
  userPreferences,saveUserPreferences
} from '../src/workspace.mjs';

const prefix='wrk'+Date.now().toString().slice(-9);
const fakeEmail=prefix+'@example.invalid';
const pool=await getPool();
const out={prefix,checks:{},details:{}};
let agendaId='',channelId='',modelId='MDG_'+prefix,noteId='',personId='';

const assert=(name,value,detail='')=>{
  out.checks[name]=!!value;
  if(!value)throw new Error('ASSERT '+name+(detail?': '+detail:''));
};

try{
  const users=await all('Usuarios');
  const admin=users.find(u=>u.ativo&&(permissions(u)||[]).includes('administracao'));
  if(!admin)throw new Error('Administrador ativo não localizado.');
  const user={...admin,email:fakeEmail,nome:'Smoke Workspace',nomeUsuario:'smoke-workspace'};
  out.details.baseAdmin=admin.email;

  const holidays=institutionalHolidays(2026);
  assert('national_holiday_calendar',holidays.some(x=>x.data==='2026-10-12'));
  const furg=furgAcademicCalendar(2026);
  assert('furg_semester_start',furg.some(x=>x.data==='2026-03-02'));
  assert('furg_recess_period',furg.some(x=>x.inicio==='2026-12-23'&&x.fim==='2027-01-02'));

  const deadline=await deadlineCalculate({inicio:'2026-10-08',quantidade:10,modo:'UTEIS'},user);
  assert('deadline_business_days',deadline.modo==='UTEIS'&&deadline.quantidade===10&&deadline.vencimento>'2026-10-08',JSON.stringify(deadline));

  const savedAgenda=await agendaSave({
    titulo:'Evento smoke '+prefix,
    descricao:'<b>Validação da agenda</b>',
    inicio:'2026-10-30T12:00:00.000Z',
    fim:'2026-10-30T13:00:00.000Z',
    tipo:'COMPROMISSO',
    visibilidade:'PESSOAL'
  },user);
  agendaId=savedAgenda.evento.id;
  const agenda=await agendaList({de:'2026-10-01',ate:'2026-10-31'},user);
  assert('agenda_manual_event',(agenda.eventos||[]).some(x=>x.id===agendaId));
  assert('agenda_national_holiday',(agenda.eventos||[]).some(x=>x.fonte==='CALENDARIO_BRASIL'&&String(x.inicio).startsWith('2026-10-12')));
  assert('agenda_furg_calendar',(agenda.eventos||[]).some(x=>x.fonte==='FURG_COEPEA_309_2025'&&String(x.inicio).startsWith('2026-10-28')));
  await agendaDelete({id:agendaId},user);

  const people=await all('Pessoas');
  const person=people.find(p=>p&&p.id);
  if(person){
    personId=person.id;
    const savedNote=await personNoteSave({
      pessoaId:personId,
      conteudo:'<b>Observação smoke '+prefix+'</b>',
      tipo:'ATENDIMENTO',
      fixada:false,
      visibilidade:'RESTRITA'
    },user);
    noteId=savedNote.observacao.id;
    const notes=await personNotes({pessoaId:personId},user);
    assert('person_note_visible',(notes.observacoes||[]).some(x=>x.id===noteId));
    await personNotePin({id:noteId,fixada:true},user);
    const pinned=await personNotes({pessoaId:personId},user);
    assert('person_note_pin',(pinned.observacoes||[]).some(x=>x.id===noteId&&x.fixada===true));
  }else{
    out.details.personNote='sem pessoa disponível; teste de observação não executado';
  }

  const boot=await chatBootstrap(user);
  assert('chat_general_channel',(boot.canais||[]).some(x=>x.id==='CHAT_GERAL_CIDIJUS'));
  const created=await chatCreate({nome:'Smoke '+prefix,membros:[],tipo:'GRUPO'},user);
  channelId=created.canal.id;
  const sent=await chatSend({canalId:channelId,conteudo:'<b>Mensagem smoke '+prefix+'</b>'},user);
  const msgs=await chatMessages({canalId:channelId,limit:20},user);
  assert('chat_send_and_read',(msgs.mensagens||[]).some(x=>x.id===sent.mensagem.id));
  const marked=await chatMarkRead({canalId:channelId},user);
  assert('chat_mark_read',marked.ok===true);

  const savedModel=await messageTemplateSave({
    id:modelId,
    titulo:'Mensagem smoke '+prefix,
    categoria:'TESTE',
    conteudo:'<p>Responsável: <<RESPONSAVEL>></p>',
    canal:'WHATSAPP',
    escopo:'EQUIPE',
    placeholders:['RESPONSAVEL'],
    ativo:true
  },user);
  assert('message_template_saved',savedModel.modelo.id===modelId);
  const templates=await messageTemplates({},user);
  assert('message_template_listed',(templates.modelos||[]).some(x=>x.id===modelId));
  const rendered=await messageTemplateRender({id:modelId},user);
  assert('message_template_rendered',String(rendered.texto||'').includes('Smoke Workspace'));
  await messageTemplateDelete({id:modelId},user);
  const templatesAfter=await messageTemplates({},user);
  assert('message_template_inactivated',!(templatesAfter.modelos||[]).some(x=>x.id===modelId));

  const savedPref=await saveUserPreferences({
    fonte:'LEGIVEL',tamanho:'GRANDE',tema:'ESCURO',
    densidade:'COMPACTA',corDestaque:'AZUL',movimentoReduzido:true
  },user);
  assert('preferences_saved',savedPref.preferencias.tema==='ESCURO'&&savedPref.preferencias.tamanho==='GRANDE');
  const pref=await userPreferences(user);
  assert('preferences_read',pref.tema==='ESCURO'&&pref.tamanho==='GRANDE'&&pref.corDestaque==='AZUL'&&pref.movimentoReduzido===true);

  out.ok=Object.values(out.checks).every(Boolean);
  out.details.checks=Object.keys(out.checks).length;
  console.log('WORKSPACE_SMOKE='+JSON.stringify(out));
}finally{
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    if(noteId)await client.query('delete from pessoa_observacoes where id=$1',[noteId]);
    if(channelId)await client.query('delete from chat_canais where id=$1',[channelId]);
    if(agendaId)await client.query('delete from agenda_eventos where id=$1',[agendaId]);
    await client.query('delete from mensagens_modelos where id=$1',[modelId]);
    await client.query('delete from usuario_preferencias where lower(usuario)=$1',[fakeEmail.toLowerCase()]);
    await client.query('COMMIT');
  }catch(e){
    try{await client.query('ROLLBACK')}catch{}
    console.error('WORKSPACE_CLEANUP_ERROR',e.message);
  }finally{
    client.release();
  }
  const left=await pool.query(
    "select (select count(*) from agenda_eventos where id=$1)::int agenda,"+
    "(select count(*) from chat_canais where id=$2)::int chat,"+
    "(select count(*) from mensagens_modelos where id=$3)::int modelo,"+
    "(select count(*) from usuario_preferencias where lower(usuario)=$4)::int preferencias",
    [agendaId||'__none__',channelId||'__none__',modelId,fakeEmail.toLowerCase()]
  );
  console.log('WORKSPACE_CLEANUP='+JSON.stringify(left.rows[0]));
  await closeDb();
}
