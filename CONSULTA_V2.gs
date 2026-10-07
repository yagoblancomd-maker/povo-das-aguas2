/**
 * POVO DAS ÁGUAS — CONSULTAS LEVES V2
 * Etapa 1/4: lista paginada, resumo rápido e dados lazy da ficha.
 */

function personCpfDisplay_(value){
  const digits=String(value||'').replace(/\D/g,'');
  return digits.length===11
    ?digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4')
    :String(value||'');
}

function personListIndexes_(){
  const people=all_('Pessoas');
  const users=all_('Usuarios');
  const processes=all_('Processos');
  const tasks=all_('Tarefas');

  const usersByEmail=new Map(
    users.map(user=>[
      String(user.email||'').toLowerCase(),
      user
    ])
  );

  const processesByPerson=new Map();
  processes.forEach(row=>{
    if(!row.pessoaId)return;
    processesByPerson.set(
      row.pessoaId,
      (processesByPerson.get(row.pessoaId)||0)+1
    );
  });

  const openTasksByPerson=new Map();
  tasks.forEach(task=>{
    if(!task.pessoaId)return;
    const done=
      task.situacao===GENERAL_TASK_DONE||
      task.situacao===DISTRIBUTION_TASK_DONE;
    if(done)return;
    openTasksByPerson.set(
      task.pessoaId,
      (openTasksByPerson.get(task.pessoaId)||0)+1
    );
  });

  return {
    people,
    usersByEmail,
    docsByPerson:new Map(),
    processesByPerson,
    openTasksByPerson,
    doneTasksByPerson:new Map()
  };
}

function personQueryIndexes_(){
  const people=all_('Pessoas');
  const users=all_('Usuarios');
  const attendances=all_('Atendimentos');
  const documents=all_('Documentos');
  const processes=all_('Processos');
  const tasks=all_('Tarefas');

  const usersByEmail=new Map(
    users.map(user=>[
      String(user.email||'').toLowerCase(),
      user
    ])
  );

  const attendancePerson=new Map(
    attendances.map(row=>[
      row.id,
      row.pessoaId
    ])
  );

  const docsByPerson=new Map();
  documents.forEach(doc=>{
    let personId=personIdFromOwner_(doc.atendimentoId);
    if(!personId)personId=attendancePerson.get(doc.atendimentoId)||'';
    if(!personId||!bool_(doc.vigente))return;
    docsByPerson.set(personId,(docsByPerson.get(personId)||0)+1);
  });

  const processesByPerson=new Map();
  processes.forEach(row=>{
    if(!row.pessoaId)return;
    processesByPerson.set(
      row.pessoaId,
      (processesByPerson.get(row.pessoaId)||0)+1
    );
  });

  const openTasksByPerson=new Map();
  const doneTasksByPerson=new Map();
  tasks.forEach(task=>{
    if(!task.pessoaId)return;
    const done=
      task.situacao===GENERAL_TASK_DONE||
      task.situacao===DISTRIBUTION_TASK_DONE;
    const map=done?doneTasksByPerson:openTasksByPerson;
    map.set(task.pessoaId,(map.get(task.pessoaId)||0)+1);
  });

  return {
    people,
    usersByEmail,
    attendances,
    documents,
    processes,
    tasks,
    attendancePerson,
    docsByPerson,
    processesByPerson,
    openTasksByPerson,
    doneTasksByPerson
  };
}

function personLiteRow_(person,indexes){
  const creatorEmail=String(
    person.criadoPor||
    person.usuario||
    ''
  ).toLowerCase();
  const creator=indexes.usersByEmail.get(creatorEmail);

  return {
    id:person.id,
    versao:person.versao,
    nome:person.nome||'',
    cpf:person.cpf||'',
    cpfFormatado:personCpfDisplay_(person.cpf),
    cidade:person.cidade||'',
    uf:person.uf||'',
    jurisdicao:person.jurisdicao||jurisdicaoPessoa_(person)||'',
    entidade:person.entidade||'',
    outraEntidade:person.outraEntidade||'',
    parcelasNaoRecebidas:person.parcelasNaoRecebidas||'',
    criadoPor:creatorEmail,
    criadoPorNome:creator?creator.nome||creator.email:creatorEmail,
    criadoEm:person.criadoEm||'',
    documentos:Number(indexes.docsByPerson.get(person.id)||0),
    processos:Number(indexes.processesByPerson.get(person.id)||0),
    tarefasAbertas:Number(indexes.openTasksByPerson.get(person.id)||0),
    tarefasConcluidas:Number(indexes.doneTasksByPerson.get(person.id)||0)
  };
}

function personListLite_(q){
  q=q||{};
  /*
   * A lista não lê Documentos nem Atendimentos. Esses dados pesados só são
   * consultados quando o usuário abre o drawer de uma pessoa.
   */
  const indexes=personListIndexes_();
  const term=String(q.busca||'').trim().toLowerCase();
  const typedCpf=term.replace(/\D/g,'');
  const cidade=String(q.cidade||'').trim().toLowerCase();
  const jurisdicao=String(q.jurisdicao||'').trim().toLowerCase();
  const entidade=String(q.entidade||'').trim().toLowerCase();

  let rows=indexes.people.filter(person=>{
    const cpf=String(person.cpf||'').replace(/\D/g,'');
    const searchable=[
      person.nome,
      person.cidade,
      person.jurisdicao,
      person.entidade,
      person.criadoPor
    ].join(' ').toLowerCase();

    if(
      term&&
      !searchable.includes(term)&&
      !(typedCpf&&cpf.includes(typedCpf))
    )return false;

    if(cidade&&String(person.cidade||'').toLowerCase()!==cidade)return false;
    if(jurisdicao&&String(person.jurisdicao||'').toLowerCase()!==jurisdicao)return false;
    if(entidade&&String(person.entidade||'').toLowerCase()!==entidade)return false;
    return true;
  });

  rows.sort((a,b)=>
    String(a.nome||'').localeCompare(
      String(b.nome||''),
      'pt-BR',
      {sensitivity:'base'}
    )
  );

  const total=rows.length;
  const limit=Math.min(100,Math.max(10,Number(q.limit)||30));
  const offset=Math.max(0,Number(q.offset)||0);
  const page=rows
    .slice(offset,offset+limit)
    .map(person=>personLiteRow_(person,indexes));

  return {
    pessoas:page,
    total,
    offset,
    limit,
    hasMore:offset+limit<total
  };
}

function personQuickSummary_(q){
  const person=get_('Pessoas',required_(q.id,'pessoa'));
  const indexes=personQueryIndexes_();
  const user=activeUser_();

  return Object.assign(
    {},
    personLiteRow_(person,indexes),
    {
      telefone:person.telefone||'',
      email:person.email||'',
      nascimento:person.nascimento||'',
      cep:person.cep||'',
      tipoVia:person.tipoVia||'',
      endereco:person.endereco||person.logradouro||'',
      numero:person.numero||'',
      complemento:person.complemento||'',
      bairro:person.bairro||'',
      podeRetificar:canRetifyPerson_(user,person),
      podeGerenciarConteudo:canWritePersonContent_(user,person),
      podeCriarTarefa:hasPermission_(user,'gestao_distribuicao'),
      podeExcluir:hasPermission_(user,'administracao')
    }
  );
}

function personFichaMeta_(q){
  return personQuickSummary_(q);
}

function personDocumentsPage_(q){
  const person=get_('Pessoas',required_(q.pessoaId,'pessoa'));
  const owner=personOwnerKey_(person.id);
  const attendanceIds=new Set(
    all_('Atendimentos')
      .filter(row=>row.pessoaId===person.id)
      .map(row=>row.id)
  );

  let rows=all_('Documentos')
    .filter(row=>
      row.atendimentoId===owner||
      attendanceIds.has(row.atendimentoId)
    )
    .sort((a,b)=>
      String(b.criadoEm||b.alteradoEm||'')
        .localeCompare(String(a.criadoEm||a.alteradoEm||''))
    );

  if(q.apenasVigentes!==false){
    rows=rows.filter(row=>bool_(row.vigente));
  }

  const total=rows.length;
  const offset=Math.max(0,Number(q.offset)||0);
  const limit=Math.min(100,Math.max(10,Number(q.limit)||20));

  return {
    documentos:rows.slice(offset,offset+limit),
    total,
    offset,
    limit,
    hasMore:offset+limit<total
  };
}

function personProcessesPage_(q){
  const person=get_('Pessoas',required_(q.pessoaId,'pessoa'));
  const rows=all_('Processos')
    .filter(row=>row.pessoaId===person.id)
    .sort((a,b)=>
      String(b.distribuidoEm||b.criadoEm||'')
        .localeCompare(String(a.distribuidoEm||a.criadoEm||''))
    );

  const total=rows.length;
  const offset=Math.max(0,Number(q.offset)||0);
  const limit=Math.min(100,Math.max(10,Number(q.limit)||20));

  return {
    processos:rows.slice(offset,offset+limit),
    total,
    offset,
    limit,
    hasMore:offset+limit<total
  };
}

function personAttendancesPage_(q){
  const person=get_('Pessoas',required_(q.pessoaId,'pessoa'));
  const rows=all_('Atendimentos')
    .filter(row=>row.pessoaId===person.id)
    .sort((a,b)=>
      String(b.criadoEm||b.alteradoEm||'')
        .localeCompare(String(a.criadoEm||a.alteradoEm||''))
    );

  const total=rows.length;
  const offset=Math.max(0,Number(q.offset)||0);
  const limit=Math.min(100,Math.max(10,Number(q.limit)||20));

  return {
    atendimentos:rows.slice(offset,offset+limit),
    total,
    offset,
    limit,
    hasMore:offset+limit<total
  };
}

function personHistoryPage_(q){
  const person=get_('Pessoas',required_(q.pessoaId,'pessoa'));
  const owner=personOwnerKey_(person.id);
  const attendanceIds=new Set(
    all_('Atendimentos')
      .filter(row=>row.pessoaId===person.id)
      .map(row=>row.id)
  );
  const documentIds=new Set(
    all_('Documentos')
      .filter(row=>
        row.atendimentoId===owner||
        attendanceIds.has(row.atendimentoId)
      )
      .map(row=>row.id)
  );
  const processIds=new Set(
    all_('Processos')
      .filter(row=>row.pessoaId===person.id)
      .map(row=>row.id)
  );
  const taskIds=new Set(
    all_('Tarefas')
      .filter(row=>row.pessoaId===person.id)
      .map(row=>row.id)
  );

  const related=new Set([
    person.id,
    ...attendanceIds,
    ...documentIds,
    ...processIds,
    ...taskIds
  ]);

  let rows=all_('Historico')
    .filter(row=>related.has(row.registroId))
    .sort((a,b)=>
      String(b.alteradoEm||'').localeCompare(String(a.alteradoEm||''))
    );

  const total=rows.length;
  const offset=Math.max(0,Number(q.offset)||0);
  const limit=Math.min(100,Math.max(10,Number(q.limit)||30));

  return {
    historico:rows.slice(offset,offset+limit),
    total,
    offset,
    limit,
    hasMore:offset+limit<total
  };
}

function taskCreateOptions_(){
  return {
    usuarios:generalTaskAssignableUsers_(),
    tags:taskTagCatalog_()
  };
}
