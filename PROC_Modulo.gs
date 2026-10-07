function processList_(){
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

  return all_('Processos')
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
    });
}
