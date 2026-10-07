const DISTRIBUTION_TASK_TYPE='DISTRIBUICAO_PROCESSO';
const DISTRIBUTION_TASK_PENDING='PENDENTE_ATRIBUICAO';
const DISTRIBUTION_TASK_ASSIGNED='ATRIBUIDA';
const DISTRIBUTION_TASK_DONE='CONCLUIDA';

function distributionTaskId_(pessoaId){
  return id_(
    'TAR',
    'DISTRIBUICAO:'+pessoaId
  );
}

function distributionLawyers_(){
  return Array.from(
    cfg_().advogadosDistribuicao||
    []
  );
}

function distributionTaskForPerson_(pessoaId){
  return all_('Tarefas')
    .find(t=>
      t.tipo===DISTRIBUTION_TASK_TYPE&&
      t.pessoaId===pessoaId
    )||
    null;
}

function ensureDistributionTask_(ctx,p){
  const existing=
    distributionTaskForPerson_(
      p.id
    );

  if(existing){
    return existing;
  }

  const process=
    all_('Processos')
      .find(x=>
        x.pessoaId===p.id&&
        String(x.numero||'').trim()
      );

  if(process){
    return null;
  }

  const autoUser=
    distributionAutoEnabled_()
      ?distributionAutoAssignee_()
      :null;

  return change_(
    ctx,
    'Tarefas',
    distributionTaskId_(
      p.id
    ),
    {
      tipo:DISTRIBUTION_TASK_TYPE,
      pessoaId:p.id,
      responsavel:autoUser?String(autoUser.email||'').toLowerCase():'',
      situacao:autoUser?DISTRIBUTION_TASK_ASSIGNED:DISTRIBUTION_TASK_PENDING,
      jurisdicao:
        p.jurisdicao||
        jurisdicaoPessoa_(p)||
        '',
      valorCausa:
        String(
          valorCausaDefeso_(
            p.parcelasNaoRecebidas
          )
        ),
      atribuidaEm:autoUser?now_():'',
      concluidaEm:'',
      processoId:'',
      observacoes:
        autoUser
          ?'Tarefa criada e distribuída automaticamente após a conclusão do cadastro.'
          :'Tarefa criada automaticamente após a conclusão do cadastro.',
      titulo:'Distribuir processo',
      descricao:'Distribuição processual decorrente da conclusão do cadastro.',
      criadoPor:String(ctx.email||'').toLowerCase(),
      prazo:taskDatePlusDays_(now_(),4),
      prioridade:'ALTA',
      tags:JSON.stringify(['PROCESSO']),
      modoDistribuicao:autoUser?'AUTOMATICA':'MANUAL'
    }
  );
}

function distributionTaskPersonData_(p){
  return {
    id:p.id,
    nome:p.nome,
    cpf:p.cpf,
    nascimento:p.nascimento,
    telefone:p.telefone,
    email:p.email||'',
    endereco:address_(p),
    cidade:p.cidade,
    uf:p.uf,
    entidade:
      p.entidade==='Outro'&&
      p.outraEntidade
        ?p.outraEntidade
        :p.entidade,
    parcelasNaoRecebidas:
      p.parcelasNaoRecebidas,
    jurisdicao:
      p.jurisdicao||
      jurisdicaoPessoa_(p)||
      '',
    valorCausa:
      valorCausaDefeso_(
        p.parcelasNaoRecebidas
      )
  };
}

function distributionTaskSummary_(task,peopleById,usersByEmail){
  const p=
    peopleById.get(
      task.pessoaId
    );

  const responsible=
    usersByEmail.get(
      String(
        task.responsavel||
        ''
      ).toLowerCase()
    );

  return {
    id:task.id,
    versao:task.versao,
    pessoaId:task.pessoaId,
    pessoa:p
      ?p.nome
      :'Pessoa não localizada',
    cpf:p
      ?p.cpf
      :'',
    cidade:p
      ?p.cidade
      :'',
    jurisdicao:
      task.jurisdicao||
      (
        p
          ?p.jurisdicao
          :''
      ),
    valorCausa:Number(
      task.valorCausa||
      (
        p
          ?valorCausaDefeso_(
            p.parcelasNaoRecebidas
          )
          :0
      )
    ),
    responsavel:
      task.responsavel||
      '',
    responsavelNome:
      responsible
        ?(
          responsible.nome||
          responsible.email
        )
        :'',
    situacao:task.situacao,
    criadoEm:task.criadoEm,
    atribuidaEm:task.atribuidaEm,
    concluidaEm:task.concluidaEm,
    processoId:task.processoId||''
  };
}

function distributionUsers_(){
  return all_('Usuarios')
    .filter(u=>
      bool_(u.ativo)&&
      hasPermission_(
        u,
        'distribuicao'
      )
    )
    .sort((a,b)=>
      String(
        a.nome||
        a.email
      ).localeCompare(
        String(
          b.nome||
          b.email
        ),
        'pt-BR',
        {sensitivity:'base'}
      )
    )
    .map(u=>({
      id:u.id,
      nome:u.nome||u.email,
      funcao:u.funcao||'',
      email:u.email,
      perfil:u.perfil
    }));
}

function distributionQueue_(){
  const people=
    all_('Pessoas');

  const users=
    all_('Usuarios');

  const peopleById=
    new Map(
      people.map(p=>[
        p.id,
        p
      ])
    );

  const usersByEmail=
    new Map(
      users.map(u=>[
        String(
          u.email||
          ''
        ).toLowerCase(),
        u
      ])
    );

  const tasks=
    all_('Tarefas')
      .filter(t=>
        t.tipo===
        DISTRIBUTION_TASK_TYPE
      )
      .sort((a,b)=>{
        const aDone=
          a.situacao===
          DISTRIBUTION_TASK_DONE;

        const bDone=
          b.situacao===
          DISTRIBUTION_TASK_DONE;

        if(aDone!==bDone){
          return aDone
            ?1
            :-1;
        }

        return String(
          b.alteradoEm||
          b.criadoEm||
          ''
        ).localeCompare(
          String(
            a.alteradoEm||
            a.criadoEm||
            ''
          )
        );
      })
      .map(t=>
        distributionTaskSummary_(
          t,
          peopleById,
          usersByEmail
        )
      );

  const general=
    generalTaskManagementList_();

  return {
    tarefas:tasks,
    tarefasGerais:
      general.tarefas,
    usuariosTarefas:
      general.usuarios,
    usuarios:
      distributionUsers_(),
    indicadores:{
      geraisAbertas:
        general.abertas,
      geraisConcluidas:
        general.concluidas,
      semResponsavel:
        tasks.filter(t=>
          t.situacao===
          DISTRIBUTION_TASK_PENDING
        ).length,
      atribuidas:
        tasks.filter(t=>
          t.situacao===
          DISTRIBUTION_TASK_ASSIGNED
        ).length,
      concluidas:
        tasks.filter(t=>
          t.situacao===
          DISTRIBUTION_TASK_DONE
        ).length
    }
  };
}

function myDistributionTasks_(){
  const email=
    identity_();

  const people=
    all_('Pessoas');

  const users=
    all_('Usuarios');

  const peopleById=
    new Map(
      people.map(p=>[
        p.id,
        p
      ])
    );

  const usersByEmail=
    new Map(
      users.map(u=>[
        String(
          u.email||
          ''
        ).toLowerCase(),
        u
      ])
    );

  const tasks=
    all_('Tarefas')
      .filter(t=>
        t.tipo===
          DISTRIBUTION_TASK_TYPE&&
        String(
          t.responsavel||
          ''
        ).toLowerCase()===
          email
      )
      .sort((a,b)=>{
        const aDone=
          a.situacao===
          DISTRIBUTION_TASK_DONE;

        const bDone=
          b.situacao===
          DISTRIBUTION_TASK_DONE;

        if(aDone!==bDone){
          return aDone
            ?1
            :-1;
        }

        return String(
          b.alteradoEm||
          b.criadoEm||
          ''
        ).localeCompare(
          String(
            a.alteradoEm||
            a.criadoEm||
            ''
          )
        );
      })
      .map(t=>
        distributionTaskSummary_(
          t,
          peopleById,
          usersByEmail
        )
      );

  return {
    email,
    pendentes:
      tasks.filter(t=>
        t.situacao!==
        DISTRIBUTION_TASK_DONE
      ),
    concluidas:
      tasks.filter(t=>
        t.situacao===
        DISTRIBUTION_TASK_DONE
      )
  };
}

function distributionTaskDetail_(q){
  required_(
    q.id,
    'tarefa'
  );

  const task=
    get_(
      'Tarefas',
      q.id
    );

  if(
    task.tipo!==
    DISTRIBUTION_TASK_TYPE
  ){
    fail_(
      'A tarefa informada não é uma distribuição processual.'
    );
  }

  const user=
    activeUser_();

  const canManage=
    hasPermission_(
      user,
      'gestao_distribuicao'
    );

  const isOwner=
    String(
      task.responsavel||
      ''
    ).toLowerCase()===
    String(
      user.email||
      ''
    ).toLowerCase();

  if(
    !isOwner&&
    !canManage
  ){
    fail_(
      'Esta tarefa está atribuída a outro usuário.'
    );
  }

  const p=
    get_(
      'Pessoas',
      task.pessoaId
    );

  const owner=
    personOwnerKey_(
      p.id
    );

  const docs=
    all_('Documentos')
      .filter(d=>
        d.atendimentoId===owner&&
        bool_(d.vigente)
      )
      .map(d=>({
        id:d.id,
        categoria:d.categoria,
        label:
          documentLabel_(
            d.categoria
          ),
        nome:d.nome,
        mime:d.mime,
        url:d.url,
        conferido:
          bool_(
            d.conferido
          )
      }))
      .sort((a,b)=>
        String(
          a.label
        ).localeCompare(
          String(
            b.label
          ),
          'pt-BR',
          {sensitivity:'base'}
        )
      );

  const process=
    task.processoId
      ?all_('Processos')
        .find(x=>
          x.id===
          task.processoId
        )||
        null
      :null;

  return {
    tarefa:{
      id:task.id,
      versao:task.versao,
      situacao:task.situacao,
      responsavel:task.responsavel,
      jurisdicao:
        task.jurisdicao||
        p.jurisdicao||
        '',
      valorCausa:Number(
        task.valorCausa||
        valorCausaDefeso_(
          p.parcelasNaoRecebidas
        )
      ),
      criadaEm:task.criadoEm,
      atribuidaEm:task.atribuidaEm,
      concluidaEm:task.concluidaEm
    },
    pessoa:
      distributionTaskPersonData_(
        p
      ),
    documentos:docs,
    advogados:
      distributionLawyers_(),
    processo:process
  };
}

function distributionZipFileName_(index,doc,file){
  const original=
    safeName_(
      file.getName()||
      doc.nome||
      'documento'
    );

  const label=
    safeName_(
      documentLabel_(
        doc.categoria
      )
    );

  const prefix=
    String(index+1)
      .padStart(
        2,
        '0'
      );

  return safeName_(
    prefix+
    ' - '+
    label+
    ' - '+
    original
  );
}

function distributionDocumentsZip_(ctx,q){
  required_(
    q.id,
    'tarefa'
  );

  const task=
    get_(
      'Tarefas',
      q.id
    );

  if(
    task.tipo!==
    DISTRIBUTION_TASK_TYPE
  ){
    fail_(
      'A tarefa informada não é uma distribuição processual.'
    );
  }

  const user=
    activeUser_();

  const canManage=
    hasPermission_(
      user,
      'gestao_distribuicao'
    );

  const isOwner=
    String(
      task.responsavel||
      ''
    ).toLowerCase()===
    String(
      user.email||
      ''
    ).toLowerCase();

  if(
    !isOwner&&
    !canManage
  ){
    fail_(
      'Esta tarefa está atribuída a outro usuário.'
    );
  }

  const p=
    get_(
      'Pessoas',
      task.pessoaId
    );

  const owner=
    personOwnerKey_(
      p.id
    );

  const docs=
    all_('Documentos')
      .filter(d=>
        d.atendimentoId===owner&&
        bool_(d.vigente)&&
        String(
          d.fileId||
          ''
        ).trim()
      )
      .sort((a,b)=>
        String(
          documentLabel_(
            a.categoria
          )
        ).localeCompare(
          String(
            documentLabel_(
              b.categoria
            )
          ),
          'pt-BR',
          {sensitivity:'base'}
        )
      );

  if(!docs.length){
    fail_(
      'Nenhum documento vigente foi localizado para esta pessoa.'
    );
  }

  const blobs=[];
  const included=[];
  let totalBytes=0;

  docs.forEach((doc,index)=>{
    let file;

    try{
      file=
        DriveApp.getFileById(
          doc.fileId
        );

      if(file.isTrashed()){
        return;
      }

    }catch(e){
      return;
    }

    const mime=
      String(
        file.getMimeType()||
        ''
      );

    let blob;

    if(
      mime.indexOf(
        'application/vnd.google-apps.'
      )===0
    ){
      blob=
        file.getAs(
          MimeType.PDF
        );

      blob.setName(
        safeName_(
          String(index+1)
            .padStart(
              2,
              '0'
            )+
          ' - '+
          documentLabel_(
            doc.categoria
          )+
          ' - '+
          file.getName()
        )+
        '.pdf'
      );

    }else{
      blob=
        file.getBlob();

      blob.setName(
        distributionZipFileName_(
          index,
          doc,
          file
        )
      );
    }

    const size=
      blob.getBytes().length;

    totalBytes+=size;

    if(
      totalBytes>
      45*1024*1024
    ){
      fail_(
        'O conjunto de documentos ultrapassa 45 MB e não pode ser compactado em uma única operação. Reduza o tamanho dos arquivos antes de tentar novamente.'
      );
    }

    blobs.push(blob);

    included.push({
      categoria:doc.categoria,
      nome:blob.getName(),
      bytes:size
    });
  });

  if(!blobs.length){
    fail_(
      'Os documentos estão registrados no sistema, mas os arquivos correspondentes não puderam ser lidos no Google Drive.'
    );
  }

  const fingerprint=
    hash_(
      included.map(item=>[
        item.categoria,
        item.nome,
        item.bytes
      ])
    );

  const folder=
    personFolder_(p);

  const zipName=
    safeName_(
      'DOCUMENTOS.DISTRIBUICAO.'+
      p.nome
    )+
    '.zip';

  const marker=
    'PDA_TASK_DOCS_ZIP:'+
    task.id+
    ':'+
    fingerprint;

  const existing=
    folder.getFilesByName(
      zipName
    );

  while(existing.hasNext()){
    const file=
      existing.next();

    if(
      !file.isTrashed()&&
      String(
        file.getDescription()||
        ''
      )===marker
    ){
      return {
        fileId:file.getId(),
        nome:file.getName(),
        quantidade:included.length,
        downloadUrl:
          'https://drive.google.com/uc?export=download&id='+
          encodeURIComponent(
            file.getId()
          ),
        driveUrl:file.getUrl(),
        mensagem:
          included.length+
          (
            included.length===1
              ?' documento preparado para download.'
              :' documentos preparados para download.'
          )
      };
    }
  }

  const zipBlob=
    Utilities.zip(
      blobs,
      zipName
    );

  const zipFile=
    folder.createFile(
      zipBlob
    );

  zipFile.setDescription(
    marker
  );

  ctx.effects.push(
    'Pacote ZIP de documentos criado no Drive: '+
    zipFile.getUrl()
  );

  return {
    fileId:zipFile.getId(),
    nome:zipFile.getName(),
    quantidade:included.length,
    downloadUrl:
      'https://drive.google.com/uc?export=download&id='+
      encodeURIComponent(
        zipFile.getId()
      ),
    driveUrl:zipFile.getUrl(),
    mensagem:
      included.length+
      (
        included.length===1
          ?' documento preparado para download.'
          :' documentos preparados para download.'
      )
  };
}

function distributionTaskAssign_(ctx,q){
  required_(
    q.id,
    'tarefa'
  );

  required_(
    q.responsavel,
    'responsável'
  );

  const task=
    get_(
      'Tarefas',
      q.id
    );

  if(
    task.tipo!==
    DISTRIBUTION_TASK_TYPE
  ){
    fail_(
      'Tarefa de distribuição inválida.'
    );
  }

  if(
    task.situacao===
    DISTRIBUTION_TASK_DONE
  ){
    fail_(
      'Tarefa concluída não pode ser reatribuída.'
    );
  }

  const email=
    String(
      q.responsavel
    )
      .trim()
      .toLowerCase();

  const user=
    all_('Usuarios')
      .find(u=>
        String(
          u.email||
          ''
        ).toLowerCase()===
          email&&
        bool_(u.ativo)
      );

  if(!user){
    fail_(
      'Usuário responsável não localizado ou inativo.'
    );
  }

  if(
    !hasPermission_(
      user,
      'distribuicao'
    )
  ){
    fail_(
      'O usuário escolhido não possui a permissão "Distribuir processos".'
    );
  }

  return change_(
    ctx,
    'Tarefas',
    task.id,
    {
      tipo:task.tipo,
      pessoaId:task.pessoaId,
      responsavel:email,
      situacao:DISTRIBUTION_TASK_ASSIGNED,
      jurisdicao:task.jurisdicao,
      valorCausa:task.valorCausa,
      atribuidaEm:now_(),
      concluidaEm:'',
      processoId:'',
      observacoes:
        task.observacoes||
        ''
    },
    task.versao
  );
}

function normalizeTrf4ProcessNumber_(value){
  const digits=
    String(
      value||
      ''
    ).replace(
      /\D/g,
      ''
    );

  if(
    digits.length!==20
  ){
    fail_(
      'Informe o número completo do processo no padrão CNJ, por exemplo 5001234-56.2026.4.04.7100.'
    );
  }

  if(
    digits.slice(
      13,
      14
    )!=='4'||
    digits.slice(
      14,
      16
    )!=='04'
  ){
    fail_(
      'O número informado não corresponde ao padrão da Justiça Federal da 4ª Região (4.04).'
    );
  }

  return (
    digits.slice(0,7)+
    '-'+
    digits.slice(7,9)+
    '.'+
    digits.slice(9,13)+
    '.'+
    digits.slice(13,14)+
    '.'+
    digits.slice(14,16)+
    '.'+
    digits.slice(16,20)
  );
}

function completeDistributionTask_(ctx,q){
  required_(
    q.id,
    'tarefa'
  );

  required_(
    q.numeroProcesso,
    'número do processo'
  );

  const task=
    get_(
      'Tarefas',
      q.id
    );

  if(
    task.tipo!==
    DISTRIBUTION_TASK_TYPE
  ){
    fail_(
      'Tarefa de distribuição inválida.'
    );
  }

  if(
    task.situacao===
    DISTRIBUTION_TASK_DONE
  ){
    fail_(
      'Esta tarefa já foi concluída.'
    );
  }

  if(
    String(
      task.responsavel||
      ''
    ).toLowerCase()!==
    String(
      ctx.email||
      ''
    ).toLowerCase()
  ){
    fail_(
      'Somente o usuário responsável pela tarefa pode concluí-la.'
    );
  }

  const numero=
    normalizeTrf4ProcessNumber_(
      q.numeroProcesso
    );

  const duplicate=
    all_('Processos')
      .find(p=>
        String(
          p.numero||
          ''
        )===numero
      );

  if(duplicate){
    fail_(
      'Esse número de processo já está cadastrado no sistema.'
    );
  }

  const p=
    get_(
      'Pessoas',
      task.pessoaId
    );

  const processId=
    id_(
      'PROC',
      p.id+':'+numero
    );

  const process=
    change_(
      ctx,
      'Processos',
      processId,
      {
        pessoaId:p.id,
        atendimentoId:'',
        numero,
        juizo:
          task.jurisdicao||
          p.jurisdicao||
          jurisdicaoPessoa_(p)||
          '',
        distribuidoEm:now_(),
        responsavel:ctx.email,
        movimentacoes:JSON.stringify([])
      }
    );

  const updatedTask=
    change_(
      ctx,
      'Tarefas',
      task.id,
      {
        tipo:task.tipo,
        pessoaId:task.pessoaId,
        responsavel:task.responsavel,
        situacao:DISTRIBUTION_TASK_DONE,
        jurisdicao:
          task.jurisdicao||
          p.jurisdicao||
          '',
        valorCausa:
          task.valorCausa||
          String(
            valorCausaDefeso_(
              p.parcelasNaoRecebidas
            )
          ),
        atribuidaEm:task.atribuidaEm,
        concluidaEm:now_(),
        processoId:process.id,
        observacoes:
          'Distribuição concluída. Processo TRF4: '+
          numero
      },
      task.versao
    );

  return {
    tarefa:updatedTask,
    processo:process,
    mensagem:
      'Distribuição concluída. Processo '+
      numero+
      ' vinculado a '+
      p.nome+
      '.'
  };
}

function reconcileDistributionTasks_(ctx){
  const people=
    all_('Pessoas');

  const docs=
    all_('Documentos');

  const processes=
    all_('Processos');

  let created=0;

  people.forEach(p=>{
    const hasInitial=
      docs.some(d=>
        d.atendimentoId===
          personOwnerKey_(p.id)&&
        d.categoria===
          'INICIAL_SEGURO_DEFESO_2025'&&
        bool_(d.vigente)
      );

    const hasProcess=
      processes.some(process=>
        process.pessoaId===
          p.id&&
        String(
          process.numero||
          ''
        ).trim()
      );

    if(
      hasInitial&&
      !hasProcess&&
      !distributionTaskForPerson_(
        p.id
      )
    ){
      ensureDistributionTask_(
        ctx,
        p
      );

      created++;
    }
  });

  return {
    criadas:created,
    mensagem:
      created+
      (
        created===1
          ?' tarefa de distribuição criada.'
          :' tarefas de distribuição criadas.'
      )
  };
}
