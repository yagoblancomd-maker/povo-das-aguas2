function processList_(q){
  q=q||{};

  const search=
    String(q.busca||'')
      .trim()
      .toLowerCase();

  const offset=
    Math.max(
      0,
      Number(q.offset)||0
    );

  const limit=
    Math.min(
      100,
      Math.max(
        20,
        Number(q.limit)||50
      )
    );

  if(!search){
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

  const people=
    new Map(
      all_('Pessoas').map(p=>[
        p.id,
        p
      ])
    );

  let rows=
    all_('Processos')
      .slice()
      .sort((a,b)=>
        String(
          b.distribuidoEm||
          b.criadoEm||
          ''
        ).localeCompare(
          String(
            a.distribuidoEm||
            a.criadoEm||
            ''
          )
        )
      );

  if(search){
    rows=
      rows.filter(process=>{
        const p=
          people.get(
            process.pessoaId
          );

        return [
          process.numero,
          process.juizo,
          process.jurisdicao,
          process.responsavel,
          p&&p.nome,
          p&&p.cpf,
          p&&p.jurisdicao
        ]
          .some(value=>
            String(value||'')
              .toLowerCase()
              .includes(search)
          );
      });
  }

  const total=rows.length;

  return {
    processos:
      rows
        .slice(
          offset,
          offset+limit
        )
        .map(process=>{
          const p=
            people.get(
              process.pessoaId
            );

          return {
            id:process.id,
            numero:process.numero,
            pessoaId:process.pessoaId,
            pessoa:
              p
                ?p.nome
                :'Pessoa não localizada',
            cpf:
              p
                ?p.cpf
                :'',
            jurisdicao:
              process.juizo||
              (
                p
                  ?p.jurisdicao
                  :''
              ),
            distribuidoEm:process.distribuidoEm,
            responsavel:process.responsavel
          };
        }),
    total,
    offset,
    limit,
    hasMore:
      offset+limit<
      total
  };
}
