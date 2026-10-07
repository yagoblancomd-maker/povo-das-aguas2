/**
 * POVO DAS ÁGUAS — HISTÓRICO GERAL
 * Etapa 3/4: consulta sob demanda para a subguia Consultas > Histórico.
 */

function historyInRange_(value,from,to){
  const day=String(value||'').slice(0,10);
  if(!day)return !from&&!to;
  if(from&&day<from)return false;
  if(to&&day>to)return false;
  return true;
}

function globalHistory_(q){
  q=q||{};
  const type=String(q.tipo||'cadastros').toLowerCase();
  const from=String(q.de||'');
  const to=String(q.ate||'');
  const userFilter=String(q.usuario||'').trim().toLowerCase();
  const personFilter=String(q.pessoa||'').trim().toLowerCase();
  const search=String(q.busca||'').trim().toLowerCase();
  const offset=Math.max(0,Number(q.offset)||0);
  const limit=Math.min(100,Math.max(10,Number(q.limit)||50));

  const dependencies=
    type==='cadastros'
      ?['Pessoas']
      :type==='documentos'
        ?['Pessoas','Atendimentos','Documentos']
        :type==='processos'
          ?['Pessoas','Processos']
          :[
              'Pessoas',
              'Atendimentos',
              'Documentos',
              'Processos',
              'Tarefas',
              'Historico'
            ];

  batchAll_(dependencies);

  const people=all_('Pessoas');

  const hasFilters=
    !!(
      from||
      to||
      userFilter||
      personFilter||
      search
    );

  /*
   * A tela inicial do Histórico abre em "Cadastros". Quando não há
   * filtros, não é necessário transformar todos os cadastros em objetos
   * de histórico para depois descartar quase todos pela paginação.
   * Ordena-se a coleção bruta e somente a página visível é materializada.
   */
  if(
    type==='cadastros'&&
    !hasFilters
  ){
    const ordered=
      people
        .slice()
        .sort((a,b)=>
          String(
            b.criadoEm||
            b.alteradoEm||
            ''
          ).localeCompare(
            String(
              a.criadoEm||
              a.alteradoEm||
              ''
            )
          )
        );

    const total=ordered.length;

    return {
      tipo:type,
      itens:
        ordered
          .slice(
            offset,
            offset+limit
          )
          .map(person=>({
            id:person.id,
            tipo:'Cadastro',
            data:
              person.criadoEm||
              person.alteradoEm||
              '',
            usuario:
              person.criadoPor||
              person.usuario||
              '',
            pessoaId:person.id,
            pessoa:person.nome||'',
            cpf:person.cpf||'',
            detalhe:[
              person.cidade,
              person.jurisdicao,
              person.entidade
            ]
              .filter(Boolean)
              .join(' · ')
          })),
      total,
      offset,
      limit,
      hasMore:
        offset+limit<
        total
    };
  }

  const documents=
    dependencies.includes('Documentos')
      ?all_('Documentos')
      :[];
  const processes=
    dependencies.includes('Processos')
      ?all_('Processos')
      :[];
  const tasks=
    dependencies.includes('Tarefas')
      ?all_('Tarefas')
      :[];
  const peopleById=new Map(people.map(person=>[person.id,person]));
  const documentsById=new Map(documents.map(row=>[row.id,row]));
  const processesById=new Map(processes.map(row=>[row.id,row]));
  const tasksById=new Map(tasks.map(row=>[row.id,row]));
  const attendancePerson=
    dependencies.includes('Atendimentos')
      ?new Map(
          all_('Atendimentos').map(row=>[row.id,row.pessoaId])
        )
      :new Map();

  const personFromDocument_=doc=>{
    const direct=personIdFromOwner_(doc.atendimentoId);
    return direct||attendancePerson.get(doc.atendimentoId)||'';
  };

  let rows=[];

  if(type==='cadastros'){
    rows=people.map(person=>({
      id:person.id,
      tipo:'Cadastro',
      data:person.criadoEm||person.alteradoEm||'',
      usuario:person.criadoPor||person.usuario||'',
      pessoaId:person.id,
      pessoa:person.nome||'',
      cpf:person.cpf||'',
      detalhe:[
        person.cidade,
        person.jurisdicao,
        person.entidade
      ].filter(Boolean).join(' · ')
    }));
  }else if(type==='documentos'){
    rows=documents.map(doc=>{
      const personId=personFromDocument_(doc);
      const person=peopleById.get(personId);
      return {
        id:doc.id,
        tipo:'Documento',
        data:doc.criadoEm||doc.alteradoEm||'',
        usuario:doc.usuario||doc.criadoPor||'',
        pessoaId,
        pessoa:person?person.nome:'',
        cpf:person?person.cpf:'',
        detalhe:[
          doc.categoria,
          doc.nome,
          bool_(doc.vigente)?'vigente':'versão anterior'
        ].filter(Boolean).join(' · ')
      };
    });
  }else if(type==='processos'){
    rows=processes.map(proc=>{
      const person=peopleById.get(proc.pessoaId);
      return {
        id:proc.id,
        tipo:'Processo',
        data:proc.distribuidoEm||proc.criadoEm||proc.alteradoEm||'',
        usuario:proc.responsavel||proc.usuario||'',
        pessoaId:proc.pessoaId||'',
        pessoa:person?person.nome:'',
        cpf:person?person.cpf:'',
        detalhe:[
          proc.numero,
          proc.juizo||proc.jurisdicao
        ].filter(Boolean).join(' · ')
      };
    });
  }else{
    rows=(DATA_CACHE.Historico||all_('Historico')).map(item=>{
      let personId='';
      const direct=peopleById.get(item.registroId);
      if(direct){
        personId=direct.id;
      }else{
        const document=documentsById.get(item.registroId);
        if(document)personId=personFromDocument_(document);
        if(!personId){
          const process=processesById.get(item.registroId);
          if(process)personId=process.pessoaId||'';
        }
        if(!personId){
          const task=tasksById.get(item.registroId);
          if(task)personId=task.pessoaId||'';
        }
      }
      const person=peopleById.get(personId);
      return {
        id:item.id,
        tipo:item.entidade||'Atividade',
        data:item.alteradoEm||item.criadoEm||'',
        usuario:item.usuario||'',
        pessoaId,
        pessoa:person?person.nome:'',
        cpf:person?person.cpf:'',
        detalhe:'Registro '+String(item.registroId||'')
      };
    });
  }

  rows=rows.filter(row=>{
    if(!historyInRange_(row.data,from,to))return false;
    if(userFilter&&!String(row.usuario||'').toLowerCase().includes(userFilter))return false;
    if(personFilter){
      const personText=[
        row.pessoa,
        row.cpf
      ].join(' ').toLowerCase();
      if(!personText.includes(personFilter))return false;
    }
    if(search){
      const haystack=[
        row.tipo,row.usuario,row.pessoa,row.cpf,row.detalhe
      ].join(' ').toLowerCase();
      if(!haystack.includes(search))return false;
    }
    return true;
  });

  rows.sort((a,b)=>String(b.data||'').localeCompare(String(a.data||'')));

  const total=rows.length;
  return {
    tipo:type,
    itens:rows.slice(offset,offset+limit),
    total,
    offset,
    limit,
    hasMore:offset+limit<total
  };
}
