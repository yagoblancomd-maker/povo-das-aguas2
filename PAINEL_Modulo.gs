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
  const pessoas=all_('Pessoas');

  const documentos=
    all_('Documentos')
      .filter(doc=>
        bool_(doc.vigente)&&
        !!personIdFromOwner_(doc.atendimentoId)
      );

  const processos=all_('Processos');

  const iniciais=documentos.filter(doc=>
    doc.categoria==='INICIAL_SEGURO_DEFESO_2025'
  );

  const relatorios=documentos.filter(doc=>
    doc.categoria==='RELATORIO_SEGURO_DEFESO_2025'
  );

  const aConferir=documentos.filter(doc=>
    !bool_(doc.conferido)
  );

  const peopleById=new Map(
    pessoas.map(person=>[person.id,person])
  );

  const valorCausas=pessoas.reduce(
    (total,person)=>total+causeValueFromPerson_(person),
    0
  );

  const valorCausasTramitacao=processos.reduce(
    (total,process)=>{
      const person=peopleById.get(process.pessoaId);
      return total+causeValueFromPerson_(person);
    },
    0
  );

  const currentEmail=String(identity_()||'').toLowerCase();

  const minhasTarefas=all_('Tarefas')
    .filter(task=>
      task.situacao!==GENERAL_TASK_DONE&&
      task.situacao!==DISTRIBUTION_TASK_DONE&&
      String(task.responsavel||'').toLowerCase()===currentEmail
    ).length;

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
    valorCausasTramitacao
  };
}
