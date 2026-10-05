function dashboard_(){
  const pessoas=all_('Pessoas');

  const documentos=
    all_('Documentos')
      .filter(d=>
        bool_(d.vigente)&&
        !!personIdFromOwner_(
          d.atendimentoId
        )
      );

  const iniciais=
    documentos.filter(d=>
      d.categoria==='INICIAL_SEGURO_DEFESO_2025'
    );

  const relatorios=
    documentos.filter(d=>
      d.categoria==='RELATORIO_SEGURO_DEFESO_2025'
    );

  const aConferir=
    documentos.filter(d=>
      !bool_(d.conferido)
    );

  return {
    pessoas:pessoas.length,
    documentos:documentos.length,
    aConferir:aConferir.length,
    iniciais:iniciais.length,
    relatorios:relatorios.length,
    registros:
      pessoas
        .slice()
        .sort((a,b)=>
          String(a.nome||'').localeCompare(
            String(b.nome||''),
            'pt-BR',
            {sensitivity:'base'}
          )
        )
        .map(p=>({
          id:p.id,
          nome:p.nome,
          cpf:p.cpf,
          cidade:p.cidade,
          jurisdicao:p.jurisdicao,
          documentos:
            documentos.filter(d=>
              d.atendimentoId===
              personOwnerKey_(p.id)
            ).length
        }))
  };
}
