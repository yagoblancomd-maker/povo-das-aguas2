function personSave_(ctx,q){
  const before=q.id?get_('Pessoas',q.id):null;

  if(before){
    authorizePersonRetification_(before);
  }

  const c=cfg_();
  const p=validatePerson_(q,c,c.rascunhos!=='PERMITIR');

  p.criadoPor=
    before
      ?(
        before.criadoPor||
        personCreatorEmail_(before)||
        before.usuario||
        ''
      )
      :ctx.email;

  const other=all_('Pessoas').find(r=>r.cpf===p.cpf&&r.id!==q.id);
  if(other)fail_('CPF já cadastrado. Abra a pessoa existente: '+other.id);

  const saved=change_(ctx,'Pessoas',q.id||id_('PES',ctx.op),p,q.versao);
  const folder=personFolder_(saved);

  ctx.effects.push('Pasta da pessoa preservada no Drive: '+folder.getUrl());

  const distributionTask=
    distributionTaskForPerson_(
      saved.id
    );

  if(
    distributionTask&&
    distributionTask.situacao!==
      DISTRIBUTION_TASK_DONE
  ){
    change_(
      ctx,
      'Tarefas',
      distributionTask.id,
      {
        tipo:distributionTask.tipo,
        pessoaId:saved.id,
        responsavel:
          distributionTask.responsavel||
          '',
        situacao:distributionTask.situacao,
        jurisdicao:
          saved.jurisdicao||
          jurisdicaoPessoa_(saved)||
          '',
        valorCausa:String(
          valorCausaDefeso_(
            saved.parcelasNaoRecebidas
          )
        ),
        atribuidaEm:
          distributionTask.atribuidaEm||
          '',
        concluidaEm:'',
        processoId:'',
        observacoes:
          distributionTask.observacoes||
          ''
      },
      distributionTask.versao
    );
  }

  if(before){
    all_('Atendimentos')
      .filter(a=>a.pessoaId===before.id)
      .forEach(a=>touch_(ctx,a));
  }

  return Object.assign({},saved,{
    folderId:folder.getId(),
    folderUrl:folder.getUrl()
  });
}


function personRequiredDocumentErrors_(p){
  const owner=personOwnerKey_(p.id);
  const docs=all_('Documentos').filter(
    d=>d.atendimentoId===owner&&bool_(d.vigente)
  );
  const errors=[];

  cfg_().categorias.forEach(categoria=>{
    const categoryDocs=docs.filter(d=>d.categoria===categoria);
    const validFiles=categoryDocs.filter(d=>{
      try{
        const file=DriveApp.getFileById(d.fileId);
        return !file.isTrashed();
      }catch(e){
        return false;
      }
    });

    if(!validFiles.length){
      errors.push('Anexe '+documentLabel_(categoria)+'.');
      return;
    }

    if(categoria==='RESIDENCIA'){
      const residenceWithDate=validFiles.some(d=>{
        try{
          date_(d.vencimento);
          return true;
        }catch(e){
          return false;
        }
      });

      if(!residenceWithDate){
        errors.push('Informe uma data válida para o vencimento do comprovante de residência.');
      }

      const thirdPartyDocs=
        validFiles.filter(d=>
          bool_(d.terceiro)
        );

      if(thirdPartyDocs.length){
        const hasDeclaration=
          thirdPartyDocs.some(d=>
            bool_(d.declaracaoTerceiro)
          );

        if(!hasDeclaration){
          errors.push(
            'Confirme que há declaração de residência no comprovante em nome de terceiro.'
          );
        }

        const holderIdentityDocs=
          docs.filter(d=>
            d.categoria==='IDENTIDADE_TITULAR_RESIDENCIA'&&
            bool_(d.vigente)
          );

        const hasHolderIdentity=
          holderIdentityDocs.some(d=>{
            try{
              const file=DriveApp.getFileById(d.fileId);
              return !file.isTrashed();
            }catch(e){
              return false;
            }
          });

        if(!hasHolderIdentity){
          errors.push(
            'Anexe a carteira de identidade do titular da residência.'
          );
        }
      }
    }
  });

  return [...new Set(errors)];
}

/**
 * Chamado pelo formulário de Pessoas somente depois que o cadastro e todos os
 * uploads selecionados já foram confirmados em operações anteriores.
 */
function personFinalize_(ctx,q){
  required_(q.pessoaId,'pessoa');

  const p=get_('Pessoas',q.pessoaId);
  parcelasDefeso_(p.parcelasNaoRecebidas);

  const documentErrors=personRequiredDocumentErrors_(p);

  if(documentErrors.length){
    fail_(
      'O cadastro não pode ser finalizado sem todos os documentos obrigatórios:\n'+
      documentErrors.join('\n')
    );
  }

  const folder=personFolder_(p);
  const minuta=generatePersonDraft_(ctx,p);
  const tarefaDistribuicao=
    ensureDistributionTask_(
      ctx,
      p
    );

  return {
    pessoaId:p.id,
    folderId:folder.getId(),
    folderUrl:folder.getUrl(),
    minutaBase:minuta,
    tarefaDistribuicao:
      tarefaDistribuicao
        ?tarefaDistribuicao.id
        :'',
    mensagem:
      'Cadastro, documentos e minuta concluídos. Tarefa de distribuição criada automaticamente.'
  };
}

/**
 * Gera ou atualiza a petição inicial diretamente a partir da Ficha e conferência.
 * Mantém as mesmas exigências documentais usadas na finalização do cadastro.
 */
function personInitialGenerate_(ctx,q){
  required_(q.pessoaId,'pessoa');

  const p=get_('Pessoas',q.pessoaId);
  parcelasDefeso_(p.parcelasNaoRecebidas);

  const documentErrors=
    personRequiredDocumentErrors_(p);

  if(documentErrors.length){
    fail_(
      'A petição inicial não pode ser gerada enquanto houver documentos obrigatórios pendentes:\n'+
      documentErrors.join('\n')
    );
  }

  const folder=personFolder_(p);
  const minuta=generatePersonDraft_(ctx,p);
  const tarefaDistribuicao=
    ensureDistributionTask_(
      ctx,
      p
    );

  return {
    pessoaId:p.id,
    folderId:folder.getId(),
    folderUrl:folder.getUrl(),
    minutaBase:minuta,
    tarefaDistribuicao:
      tarefaDistribuicao
        ?tarefaDistribuicao.id
        :'',
    mensagem:
      'Petição inicial gerada e adicionada aos documentos da pessoa. A tarefa de distribuição foi garantida.'
  };
}


function personSearch_(q){
  const term=String(q.busca||'').trim().toLowerCase();

  return all_('Pessoas')
    .filter(p=>
      !term||
      p.nome.toLowerCase().includes(term)||
      p.cpf.includes(term.replace(/[.\- ]/g,''))||
      String(p.cidade||'').toLowerCase().includes(term)
    )
    .sort((a,b)=>
      String(a.nome||'').localeCompare(
        String(b.nome||''),
        'pt-BR',
        {sensitivity:'base'}
      )
    );
}
