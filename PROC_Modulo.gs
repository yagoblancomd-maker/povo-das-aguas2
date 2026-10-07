function processFilterText_(value){
  return String(value||'')
    .trim()
    .toLowerCase();
}

function processDateValue_(value){
  const text=String(value||'').trim();
  if(!text)return '';
  const date=new Date(text);
  return Number.isNaN(date.getTime())?'':date.toISOString();
}

function processFilterOptions_(){
  batchAll_([
    'Pessoas',
    'Processos'
  ]);

  const currentUser=activeUser_();

  const people=
    new Map(
      filterPeopleByUserScope_(
        all_('Pessoas'),
        currentUser
      ).map(person=>[
        person.id,
        person
      ])
    );

  const rows=
    all_('Processos')
      .filter(process=>
        !isColonyUser_(currentUser)||
        people.has(process.pessoaId)
      );

  const uniq=values=>
    [...new Set(
      values
        .map(value=>String(value||'').trim())
        .filter(Boolean)
    )]
      .sort((a,b)=>a.localeCompare(b,'pt-BR'));

  const tags=
    uniq(
      rows.flatMap(process=>
        datajudProcessTags_(
          process
        )
      )
    );

  return {
    tribunais:uniq(
      rows.map(process=>process.datajudTribunal)
    ),
    classes:uniq(
      rows.map(process=>process.datajudClasse)
    ),
    orgaos:uniq(
      rows.map(process=>process.datajudOrgao)
    ),
    tags,
    marcos:uniq(
      rows.map(process=>
        datajudProcessMilestone_(
          process
        )
      )
    ),
    status:[
      {value:'ATUALIZADO',label:'Atualizado'},
      {value:'FALHA',label:'Falha'},
      {value:'NAO_LOCALIZADO',label:'Não localizado'},
      {value:'NAO_SINCRONIZADO',label:'Nunca sincronizado'}
    ]
  };
}

function processList_(q){
  q=q||{};

  const search=processFilterText_(q.busca);
  const tribunal=processFilterText_(q.tribunal);
  const classe=processFilterText_(q.classe);
  const orgao=processFilterText_(q.orgao);
  const status=String(q.status||'').trim().toUpperCase();
  const tag=String(q.tag||'').trim().toUpperCase();
  const marco=String(q.marco||'').trim().toUpperCase();
  const movDe=processDateValue_(q.movDe);
  const movAte=processDateValue_(q.movAte);

  const offset=Math.max(0,Number(q.offset)||0);
  const limit=Math.min(100,Math.max(20,Number(q.limit)||50));

  const hasStructuredFilter=
    !!(
      tribunal||
      classe||
      orgao||
      status||
      tag||
      marco||
      movDe||
      movAte
    );

  if(!search&&!hasStructuredFilter){
    return {
      processos:[],
      total:0,
      offset,
      limit,
      hasMore:false,
      aguardandoFiltro:true
    };
  }

  batchAll_([
    'Pessoas',
    'Processos'
  ]);

  const currentUser=activeUser_();

  const people=
    new Map(
      filterPeopleByUserScope_(
        all_('Pessoas'),
        currentUser
      ).map(person=>[
        person.id,
        person
      ])
    );

  let rows=
    all_('Processos')
      .filter(process=>
        !isColonyUser_(currentUser)||
        people.has(process.pessoaId)
      );

  rows=rows.filter(process=>{
    const person=people.get(process.pessoaId);
    const tags=datajudProcessTags_(process);
    const currentMilestone=datajudProcessMilestone_(process);
    const lastMovement=
      process.datajudUltimaMovimentacao||
      (
        datajudExistingMovements_(process)[0]&&
        datajudExistingMovements_(process)[0].dataHora||
        ''
      );

    if(search){
      const searchable=[
        process.numero,
        process.juizo,
        process.jurisdicao,
        process.responsavel,
        process.datajudTribunal,
        process.datajudClasse,
        process.datajudOrgao,
        currentMilestone,
        tags.join(' '),
        person&&person.nome,
        person&&person.cpf,
        person&&person.jurisdicao
      ];

      if(
        !searchable.some(value=>
          processFilterText_(value)
            .includes(search)
        )
      ){
        return false;
      }
    }

    if(
      tribunal&&
      !processFilterText_(process.datajudTribunal)
        .includes(tribunal)
    ){
      return false;
    }

    if(
      classe&&
      !processFilterText_(process.datajudClasse)
        .includes(classe)
    ){
      return false;
    }

    if(
      orgao&&
      !processFilterText_(process.datajudOrgao)
        .includes(orgao)
    ){
      return false;
    }

    if(
      status&&
      String(
        process.datajudStatus||
        'NAO_SINCRONIZADO'
      ).toUpperCase()!==status
    ){
      return false;
    }

    if(
      tag&&
      !tags.some(item=>
        String(item||'').toUpperCase()===tag
      )
    ){
      return false;
    }

    if(
      marco&&
      String(currentMilestone||'').toUpperCase()!==marco
    ){
      return false;
    }

    if(
      movDe&&
      (
        !lastMovement||
        String(lastMovement)<movDe
      )
    ){
      return false;
    }

    if(
      movAte&&
      (
        !lastMovement||
        String(lastMovement)>
          movAte.replace(/T00:00:00\.000Z$/,'T23:59:59.999Z')
      )
    ){
      return false;
    }

    return true;
  });

  rows=rows
    .slice()
    .sort((a,b)=>
      String(
        b.datajudUltimaMovimentacao||
        b.distribuidoEm||
        b.criadoEm||
        ''
      ).localeCompare(
        String(
          a.datajudUltimaMovimentacao||
          a.distribuidoEm||
          a.criadoEm||
          ''
        )
      )
    );

  const total=rows.length;

  return {
    processos:
      rows
        .slice(offset,offset+limit)
        .map(process=>{
          const person=people.get(process.pessoaId);
          const tags=datajudProcessTags_(process);

          return {
            id:process.id,
            numero:process.numero,
            pessoaId:process.pessoaId,
            pessoa:person?person.nome:'Pessoa não localizada',
            cpf:person?person.cpf:'',
            jurisdicao:
              process.juizo||
              (person?person.jurisdicao:''),
            distribuidoEm:process.distribuidoEm,
            responsavel:process.responsavel,
            datajudStatus:
              process.datajudStatus||
              'NAO_SINCRONIZADO',
            datajudUltimaConsulta:
              process.datajudUltimaConsulta||
              '',
            datajudTribunal:
              process.datajudTribunal||
              '',
            datajudClasse:
              process.datajudClasse||
              '',
            datajudOrgao:
              process.datajudOrgao||
              '',
            datajudTags:tags,
            datajudMarcoAtual:
              datajudProcessMilestone_(process),
            datajudUltimaMovimentacao:
              process.datajudUltimaMovimentacao||
              (
                datajudExistingMovements_(process)[0]&&
                datajudExistingMovements_(process)[0].dataHora||
                ''
              )
          };
        }),
    total,
    offset,
    limit,
    hasMore:offset+limit<total
  };
}
