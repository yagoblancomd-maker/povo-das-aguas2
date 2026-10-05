function causeValueFromPerson_(p){
  const parcelas=
    Number(
      p&&p.parcelasNaoRecebidas||
      0
    );

  if(
    !Number.isFinite(parcelas)||
    parcelas<1
  ){
    return 0;
  }

  return (
    parcelas*
    SEGURO_DEFESO_2025.salarioMinimo
  );
}

function dashboardActivityLabel_(h,peopleById,docsById){
  const entity=String(
    h.entidade||''
  );

  if(entity==='Pessoas'){
    const p=
      peopleById.get(
        h.registroId
      );

    return p
      ?'Cadastro atualizado · '+p.nome
      :'Cadastro de pessoa atualizado';
  }

  if(entity==='Documentos'){
    const d=
      docsById.get(
        h.registroId
      );

    if(d){
      const pessoaId=
        personIdFromOwner_(
          d.atendimentoId
        );

      const p=
        peopleById.get(
          pessoaId
        );

      return (
        'Documento atualizado · '+
        documentLabel_(
          d.categoria
        )+
        (
          p
            ?' · '+p.nome
            :''
        )
      );
    }

    return 'Documento atualizado';
  }

  if(entity==='Processos'){
    return 'Processo judicial atualizado';
  }

  if(entity==='Usuarios'){
    return 'Usuário e permissões atualizados';
  }

  if(entity==='Configuracoes'){
    return 'Configuração do sistema atualizada';
  }

  return (
    entity
      ?entity+' atualizado'
      :'Registro atualizado'
  );
}

function dashboard_(){
  const pessoas=
    all_('Pessoas');

  const documentos=
    all_('Documentos')
      .filter(d=>
        bool_(d.vigente)&&
        !!personIdFromOwner_(
          d.atendimentoId
        )
      );

  const processos=
    all_('Processos');

  const historico=
    all_('Historico');

  const peopleById=
    new Map(
      pessoas.map(p=>[
        p.id,
        p
      ])
    );

  const docsById=
    new Map(
      documentos.map(d=>[
        d.id,
        d
      ])
    );

  const iniciais=
    documentos.filter(d=>
      d.categoria===
      'INICIAL_SEGURO_DEFESO_2025'
    );

  const relatorios=
    documentos.filter(d=>
      d.categoria===
      'RELATORIO_SEGURO_DEFESO_2025'
    );

  const aConferir=
    documentos.filter(d=>
      !bool_(
        d.conferido
      )
    );

  const valorCausas=
    pessoas.reduce(
      (total,p)=>
        total+
        causeValueFromPerson_(p),
      0
    );

  const valorCausasTramitacao=
    processos.reduce(
      (total,processo)=>{
        const p=
          peopleById.get(
            processo.pessoaId
          );

        return (
          total+
          causeValueFromPerson_(p)
        );
      },
      0
    );

  const currentEmail=
    String(
      identity_()||
      ''
    ).toLowerCase();

  const minhasTarefas=
    all_('Tarefas')
      .filter(t=>
        t.tipo===
          DISTRIBUTION_TASK_TYPE&&
        t.situacao!==
          DISTRIBUTION_TASK_DONE&&
        String(
          t.responsavel||
          ''
        ).toLowerCase()===
          currentEmail
      ).length;

  const ultimosCadastros=
    pessoas
      .slice()
      .sort((a,b)=>
        String(
          b.criadoEm||''
        ).localeCompare(
          String(
            a.criadoEm||''
          )
        )
      )
      .slice(
        0,
        6
      )
      .map(p=>({
        id:p.id,
        nome:p.nome,
        cpf:p.cpf,
        cidade:p.cidade,
        jurisdicao:p.jurisdicao,
        criadoEm:p.criadoEm,
        documentos:
          documentos.filter(d=>
            d.atendimentoId===
            personOwnerKey_(p.id)
          ).length
      }));

  const atividades=
    historico
      .slice()
      .sort((a,b)=>
        String(
          b.alteradoEm||
          b.criadoEm||
          ''
        ).localeCompare(
          String(
            a.alteradoEm||
            a.criadoEm||
            ''
          )
        )
      )
      .slice(
        0,
        7
      )
      .map(h=>({
        id:h.id,
        entidade:h.entidade,
        registroId:h.registroId,
        data:
          h.alteradoEm||
          h.criadoEm||
          '',
        usuario:h.usuario||'',
        descricao:
          dashboardActivityLabel_(
            h,
            peopleById,
            docsById
          )
      }));

  const jurisdicoes=
    pessoas.reduce(
      (acc,p)=>{
        const key=
          String(
            p.jurisdicao||
            'NÃO DEFINIDA'
          );

        acc[key]=
          (acc[key]||0)+1;

        return acc;
      },
      {}
    );

  return {
    atualizadoEm:now_(),
    pessoas:pessoas.length,
    documentos:documentos.length,
    aConferir:aConferir.length,
    iniciais:iniciais.length,
    relatorios:relatorios.length,
    acoesTramitacao:processos.length,
    minhasTarefas,
    valorCausas,
    valorCausasTramitacao,
    jurisdicoes,
    ultimosCadastros,
    atividades
  };
}
