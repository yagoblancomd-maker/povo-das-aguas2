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
    docsByPerson:null,
    processesByPerson,
    openTasksByPerson,
    doneTasksByPerson:null
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
    documentos:indexes.docsByPerson
      ?Number(indexes.docsByPerson.get(person.id)||0)
      :null,
    processos:Number(indexes.processesByPerson.get(person.id)||0),
    tarefasAbertas:Number(indexes.openTasksByPerson.get(person.id)||0),
    tarefasConcluidas:indexes.doneTasksByPerson
      ?Number(indexes.doneTasksByPerson.get(person.id)||0)
      :null
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
  const person=
    get_(
      'Pessoas',
      required_(
        q.id,
        'pessoa'
      )
    );

  const creatorEmail=
    String(
      person.criadoPor||
      person.usuario||
      ''
    ).toLowerCase();

  const creator=
    all_('Usuarios')
      .find(user=>
        String(
          user.email||
          ''
        ).toLowerCase()===
        creatorEmail
      );

  const attendances=
    where_(
      'Atendimentos',
      'pessoaId',
      person.id
    );

  const owner=
    personOwnerKey_(
      person.id
    );

  const attendanceIds=
    attendances.map(row=>row.id);

  const documents=[
    ...where_(
      'Documentos',
      'atendimentoId',
      owner
    )
  ];

  attendanceIds.forEach(attendanceId=>{
    documents.push(
      ...where_(
        'Documentos',
        'atendimentoId',
        attendanceId
      )
    );
  });

  const tasks=
    where_(
      'Tarefas',
      'pessoaId',
      person.id
    );

  const processes=
    where_(
      'Processos',
      'pessoaId',
      person.id
    );

  const openTasks=
    tasks.filter(task=>
      task.situacao!==GENERAL_TASK_DONE&&
      task.situacao!==DISTRIBUTION_TASK_DONE
    );

  const doneTasks=
    tasks.filter(task=>
      task.situacao===GENERAL_TASK_DONE||
      task.situacao===DISTRIBUTION_TASK_DONE
    );

  const user=activeUser_();

  return {
    id:person.id,
    versao:person.versao,
    nome:person.nome||'',
    cpf:person.cpf||'',
    cpfFormatado:
      personCpfDisplay_(
        person.cpf
      ),
    cidade:person.cidade||'',
    uf:person.uf||'',
    jurisdicao:
      person.jurisdicao||
      jurisdicaoPessoa_(person)||
      '',
    entidade:person.entidade||'',
    outraEntidade:
      person.outraEntidade||
      '',
    parcelasNaoRecebidas:
      person.parcelasNaoRecebidas||
      '',
    criadoPor:creatorEmail,
    criadoPorNome:
      creator
        ?creator.nome||creator.email
        :creatorEmail,
    criadoEm:person.criadoEm||'',
    telefone:person.telefone||'',
    email:person.email||'',
    nascimento:person.nascimento||'',
    cep:person.cep||'',
    tipoVia:person.tipoVia||'',
    endereco:
      person.endereco||
      person.logradouro||
      '',
    numero:person.numero||'',
    complemento:
      person.complemento||
      '',
    bairro:person.bairro||'',
    documentos:
      documents.filter(row=>
        bool_(row.vigente)
      ).length,
    processos:processes.length,
    tarefasAbertas:
      openTasks.length,
    tarefasConcluidas:
      doneTasks.length,
    podeRetificar:
      canRetifyPerson_(
        user,
        person
      ),
    podeGerenciarConteudo:
      canWritePersonContent_(
        user,
        person
      ),
    podeCriarTarefa:
      hasPermission_(
        user,
        'gestao_distribuicao'
      ),
    podeExcluir:
      hasPermission_(
        user,
        'administracao'
      )
  };
}

function personFichaMeta_(q){
  return personQuickSummary_(q);
}

function personDocumentPublic_(row){
  return {
    id:row.id,
    versao:row.versao,
    categoria:row.categoria||'',
    nome:row.nome||'',
    mime:row.mime||'',
    vigente:row.vigente,
    conferido:row.conferido,
    vencimento:row.vencimento||'',
    observacoes:row.observacoes||'',
    criadoEm:row.criadoEm||'',
    alteradoEm:row.alteradoEm||''
  };
}

function personDocumentBelongs_(document,personId){
  if(
    document.atendimentoId===
    personOwnerKey_(personId)
  ){
    return true;
  }

  return all_('Atendimentos')
    .some(row=>
      row.id===document.atendimentoId&&
      row.pessoaId===personId
    );
}

function personDocumentContent_(q){
  const personId=String(required_(q.pessoaId,'pessoa')).trim();
  get_('Pessoas',personId);

  const document=get_(
    'Documentos',
    required_(q.id,'documento')
  );

  if(
    !personDocumentBelongs_(
      document,
      personId
    )
  ){
    fail_('O documento não pertence ao cadastro informado.');
  }

  if(!bool_(document.vigente)){
    fail_('Esta versão do documento não está mais vigente.');
  }

  let file;

  try{
    file=DriveApp.getFileById(document.fileId);
  }catch(e){
    fail_('O arquivo não está disponível no repositório do sistema.');
  }

  if(file.isTrashed()){
    fail_('O arquivo não está disponível no repositório do sistema.');
  }

  const blob=file.getBlob();

  return {
    id:document.id,
    nome:document.nome||file.getName(),
    categoria:document.categoria||'',
    mime:
      document.mime||
      blob.getContentType()||
      'application/octet-stream',
    base64:Utilities.base64Encode(
      blob.getBytes()
    )
  };
}

function personDrawerInitial_(q){
  batchAll_([
    'Pessoas',
    'Usuarios',
    'Atendimentos',
    'Documentos',
    'Processos',
    'Tarefas',
    'TarefaMensagens',
    'TarefaAnexos',
    'TarefaLeituras',
    'TarefaTags',
    'Historico'
  ]);

  const pessoaId=String(
    required_(
      q.pessoaId||q.id,
      'pessoa'
    )
  ).trim();

  const pessoa=get_(
    'Pessoas',
    pessoaId
  );

  return {
    pessoa,
    resumo:personQuickSummary_({
      id:pessoaId
    }),
    documentos:personDocumentsPage_({
      pessoaId,
      limit:20,
      offset:0
    }),
    atendimentos:personAttendancesPage_({
      pessoaId,
      limit:20,
      offset:0
    }),
    processos:personProcessesPage_({
      pessoaId,
      limit:20,
      offset:0
    }),
    tarefasAbertas:personTasksV2_({
      pessoaId,
      historico:false,
      limit:100,
      offset:0
    }),
    tarefasConcluidas:personTasksV2_({
      pessoaId,
      historico:true,
      limit:100,
      offset:0
    }),
    historico:personHistoryPage_({
      pessoaId,
      limit:30,
      offset:0
    })
  };
}

function personDocumentsPage_(q){
  const person=
    get_(
      'Pessoas',
      required_(
        q.pessoaId,
        'pessoa'
      )
    );

  const owner=
    personOwnerKey_(
      person.id
    );

  const attendances=
    where_(
      'Atendimentos',
      'pessoaId',
      person.id
    );

  const rows=[
    ...where_(
      'Documentos',
      'atendimentoId',
      owner
    )
  ];

  attendances.forEach(attendance=>{
    rows.push(
      ...where_(
        'Documentos',
        'atendimentoId',
        attendance.id
      )
    );
  });

  const seen=new Set();

  let filtered=rows
    .filter(row=>{
      if(seen.has(row.id)){
        return false;
      }

      seen.add(row.id);
      return true;
    })
    .sort((a,b)=>
      String(
        b.criadoEm||
        b.alteradoEm||
        ''
      )
        .localeCompare(
          String(
            a.criadoEm||
            a.alteradoEm||
            ''
          )
        )
    );

  if(q.apenasVigentes!==false){
    filtered=
      filtered.filter(row=>
        bool_(row.vigente)
      );
  }

  const total=filtered.length;
  const offset=
    Math.max(
      0,
      Number(q.offset)||0
    );

  const limit=
    Math.min(
      100,
      Math.max(
        10,
        Number(q.limit)||20
      )
    );

  return {
    documentos:
      filtered
        .slice(
          offset,
          offset+limit
        )
        .map(
          personDocumentPublic_
        ),
    total,
    offset,
    limit,
    hasMore:
      offset+limit<
      total
  };
}

function personProcessesPage_(q){
  const person=
    get_(
      'Pessoas',
      required_(
        q.pessoaId,
        'pessoa'
      )
    );

  const rows=
    where_(
      'Processos',
      'pessoaId',
      person.id
    )
      .slice()
      .sort((a,b)=>
        String(
          b.distribuidoEm||
          b.criadoEm||
          ''
        )
          .localeCompare(
            String(
              a.distribuidoEm||
              a.criadoEm||
              ''
            )
          )
      );

  const total=rows.length;
  const offset=
    Math.max(
      0,
      Number(q.offset)||0
    );

  const limit=
    Math.min(
      100,
      Math.max(
        10,
        Number(q.limit)||20
      )
    );

  return {
    processos:
      rows.slice(
        offset,
        offset+limit
      ),
    total,
    offset,
    limit,
    hasMore:
      offset+limit<
      total
  };
}

function personAttendancesPage_(q){
  const person=
    get_(
      'Pessoas',
      required_(
        q.pessoaId,
        'pessoa'
      )
    );

  const rows=
    where_(
      'Atendimentos',
      'pessoaId',
      person.id
    )
      .slice()
      .sort((a,b)=>
        String(
          b.criadoEm||
          b.alteradoEm||
          ''
        )
          .localeCompare(
            String(
              a.criadoEm||
              a.alteradoEm||
              ''
            )
          )
      );

  const total=rows.length;
  const offset=
    Math.max(
      0,
      Number(q.offset)||0
    );

  const limit=
    Math.min(
      100,
      Math.max(
        10,
        Number(q.limit)||20
      )
    );

  return {
    atendimentos:
      rows.slice(
        offset,
        offset+limit
      ),
    total,
    offset,
    limit,
    hasMore:
      offset+limit<
      total
  };
}

function personHistoryPage_(q){
  const person=
    get_(
      'Pessoas',
      required_(
        q.pessoaId,
        'pessoa'
      )
    );

  const owner=
    personOwnerKey_(
      person.id
    );

  const attendances=
    where_(
      'Atendimentos',
      'pessoaId',
      person.id
    );

  const tasks=
    where_(
      'Tarefas',
      'pessoaId',
      person.id
    );

  const processes=
    where_(
      'Processos',
      'pessoaId',
      person.id
    );

  const documents=[
    ...where_(
      'Documentos',
      'atendimentoId',
      owner
    )
  ];

  attendances.forEach(attendance=>{
    documents.push(
      ...where_(
        'Documentos',
        'atendimentoId',
        attendance.id
      )
    );
  });

  const relatedIds=[
    person.id,
    ...attendances.map(row=>row.id),
    ...documents.map(row=>row.id),
    ...processes.map(row=>row.id),
    ...tasks.map(row=>row.id)
  ];

  const rows=[];
  const seen=new Set();

  relatedIds.forEach(registroId=>{
    where_(
      'Historico',
      'registroId',
      registroId
    )
      .forEach(row=>{
        if(seen.has(row.id)){
          return;
        }

        seen.add(row.id);
        rows.push(row);
      });
  });

  rows.sort((a,b)=>
    String(
      b.alteradoEm||
      ''
    )
      .localeCompare(
        String(
          a.alteradoEm||
          ''
        )
      )
  );

  const total=rows.length;
  const offset=
    Math.max(
      0,
      Number(q.offset)||0
    );

  const limit=
    Math.min(
      100,
      Math.max(
        10,
        Number(q.limit)||30
      )
    );

  return {
    historico:
      rows.slice(
        offset,
        offset+limit
      ),
    total,
    offset,
    limit,
    hasMore:
      offset+limit<
      total
  };
}

function taskCreateOptions_(){
  return {
    usuarios:generalTaskAssignableUsers_(),
    tags:taskTagCatalog_()
  };
}
