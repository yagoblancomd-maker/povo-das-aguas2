function setConfigValue_(ctx,chave,valor){
  const old=all_('Configuracoes').find(r=>r.chave===chave);

  return change_(
    ctx,
    'Configuracoes',
    old?old.id:id_('CFG',chave),
    {chave,valor:JSON.stringify(valor)},
    old?old.versao:undefined
  );
}

function adminSave_(ctx,q){
  const allowed=[
    'rascunhos','vencimentoFuturo','anexoOrientacao','templateId','templateAprovado',
    'entidades','municipios','demandas','categorias','situacoes'
  ];

  if(!allowed.includes(q.chave))fail_('Configuração não editável.');

  if(q.chave==='rascunhos'&&!['PENDENTE','PERMITIR','PROIBIR'].includes(q.valor)){
    fail_('Política inválida.');
  }

  if(q.chave==='vencimentoFuturo'&&!['PENDENTE','ACEITAR','RECUSAR'].includes(q.valor)){
    fail_('Política inválida.');
  }

  if(['entidades','municipios','demandas','categorias','situacoes'].includes(q.chave)){
    if(!Array.isArray(q.valor)||!q.valor.length||q.valor.some(v=>typeof v!=='string'||!v.trim())){
      fail_('Informe uma lista não vazia.');
    }

    if(q.chave==='situacoes'&&DEFAULTS.situacoes.some(x=>!q.valor.includes(x))){
      fail_('Situações do fluxo inicial não podem ser removidas.');
    }

    if(q.chave==='categorias'&&DEFAULTS.categorias.some(x=>!q.valor.includes(x))){
      fail_('Categorias iniciais obrigatórias não podem ser removidas.');
    }
  }

  if(q.chave==='templateId'&&q.valor){
    const f=DriveApp.getFileById(q.valor);
    if(f.getMimeType()!==MimeType.GOOGLE_DOCS)fail_('Modelo deve ser Google Docs.');
    validatePersonTemplate_(q.valor);
  }

  if(q.chave==='templateAprovado'){
    q.valor=bool_(q.valor);
    if(q.valor)validatePersonTemplate_(cfg_().templateId);
  }

  const old=all_('Configuracoes').find(r=>r.chave===q.chave);
  const result=change_(
    ctx,
    'Configuracoes',
    old.id,
    {chave:q.chave,valor:JSON.stringify(q.valor)},
    q.versao
  );

  if(q.chave==='templateId'){
    const approval=all_('Configuracoes').find(r=>r.chave==='templateAprovado');
    change_(
      ctx,
      'Configuracoes',
      approval.id,
      {chave:'templateAprovado',valor:'false'},
      approval.versao
    );
  }

  return result;
}

function findConvertedModelByOperation_(folder,op){
  const marker='PDA_MODEL_OP:'+op;
  const iterator=folder.getFiles();

  while(iterator.hasNext()){
    const file=iterator.next();
    if(
      !file.isTrashed()&&
      file.getMimeType()===MimeType.GOOGLE_DOCS&&
      String(file.getDescription()||'')===marker
    ){
      return file;
    }
  }

  return null;
}

/**
 * Recebe DOCX pela tela de Administração, converte para Google Docs,
 * normaliza os placeholders conhecidos e ativa o modelo sem exigir IDs manuais.
 */
function modelUpload_(ctx,q){
  const expectedMime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const mime=String(q.mime||'').trim();
  const originalName=String(q.nome||'').trim();

  if(mime!==expectedMime&&!/\.docx$/i.test(originalName)){
    fail_('Envie um arquivo DOCX.');
  }

  if(typeof q.base64!=='string'||q.base64.length>14*1024*1024){
    fail_('O modelo DOCX deve ter no máximo 10 MB.');
  }

  const bytes=Utilities.base64Decode(q.base64);
  if(!bytes.length||bytes.length>10*1024*1024){
    fail_('O modelo DOCX está vazio ou excede 10 MB.');
  }

  const sig=bytes.slice(0,4).map(x=>(x+256)%256);
  if(sig.join(',')!=='80,75,3,4')fail_('O arquivo não corresponde a um DOCX válido.');

  const folder=templatesFolder_();
  let converted=findConvertedModelByOperation_(folder,ctx.op);

  if(!converted){
    const blob=Utilities.newBlob(bytes,expectedMime,originalName||'modelo.docx');

    const created=Drive.Files.create(
      {
        name:SEGURO_DEFESO_2025.modeloNome+' - EM PROCESSAMENTO',
        mimeType:'application/vnd.google-apps.document',
        parents:[folder.getId()]
      },
      blob,
      {fields:'id,name,mimeType,webViewLink'}
    );

    converted=DriveApp.getFileById(created.id);
    converted.setDescription('PDA_MODEL_OP:'+ctx.op);
    ctx.effects.push('Modelo convertido para Google Docs: '+converted.getUrl());
  }

  validatePersonTemplate_(converted.getId());

  const sameName=folder.getFilesByName(SEGURO_DEFESO_2025.modeloNome);
  const old=[];

  while(sameName.hasNext()){
    const file=sameName.next();
    if(file.getId()!==converted.getId())old.push(file);
  }

  old.forEach(file=>file.setTrashed(true));
  converted.setName(SEGURO_DEFESO_2025.modeloNome);

  setConfigValue_(ctx,'templateId',converted.getId());
  setConfigValue_(ctx,'templateAprovado',true);

  return {
    id:converted.getId(),
    nome:converted.getName(),
    url:converted.getUrl(),
    mensagem:'Modelo convertido, validado e ativado.'
  };
}

function userDelete_(ctx,q){
  required_(
    q.id,
    'usuário'
  );

  const user=
    get_(
      'Usuarios',
      q.id
    );

  const email=String(
    user.email||
    ''
  )
    .trim()
    .toLowerCase();

  if(
    email===
    String(
      ctx.email||
      ''
    )
      .trim()
      .toLowerCase()
  ){
    fail_(
      'Você não pode excluir o próprio usuário enquanto estiver conectado.'
    );
  }

  const owner=String(
    props_().getProperty(
      'OWNER_EMAIL'
    )||
    ''
  )
    .trim()
    .toLowerCase();

  if(
    owner&&
    (email===owner||user.id===id_('USR',owner))
  ){
    fail_(
      'O usuário proprietário do sistema não pode ser excluído.'
    );
  }

  const pendingTasks=
    all_('Tarefas')
      .filter(task=>
        task.tipo===
          DISTRIBUTION_TASK_TYPE&&
        String(
          task.responsavel||
          ''
        )
          .trim()
          .toLowerCase()===
          email&&
        task.situacao!==
          DISTRIBUTION_TASK_DONE
      );

  /*
   * Tarefas ainda não concluídas voltam automaticamente para a fila sem
   * responsável. Assim a exclusão do usuário não interrompe o fluxo de
   * distribuição e outro responsável poderá recebê-las depois.
   */
  pendingTasks.forEach(task=>{
    change_(
      ctx,
      'Tarefas',
      task.id,
      Object.assign({},task,{
        responsavel:'',
        situacao:DISTRIBUTION_TASK_PENDING,
        atribuidaEm:'',
        concluidaEm:'',
        processoId:'',
        observacoes:
          'Tarefa devolvida à fila porque o usuário responsável foi excluído.',
        prazo:task.prazo||taskDatePlusDays_(task.criadoEm||now_(),4),
        prioridade:task.prioridade||'ALTA',
        tags:task.tags||JSON.stringify(['PROCESSO']),
        modoDistribuicao:'MANUAL'
      }),
      task.versao
    );
  });

  /*
   * Remove primeiro as permissões materiais do Google. Caso o commit da
   * planilha falhe, a repetição da mesma operação é segura e refaz a remoção.
   */
  syncGoogleResourcesForUser_(
    Object.assign(
      {},
      user,
      {
        ativo:false
      }
    ),
    ctx
  );

  remove_(
    ctx,
    'Usuarios',
    user.id,
    q.versao
  );

  return {
    id:user.id,
    email,
    nome:user.nome||email,
    tarefasLiberadas:pendingTasks.length,
    mensagem:
      'Usuário excluído definitivamente do sistema. '+
      (
        pendingTasks.length
          ?pendingTasks.length+
            (
              pendingTasks.length===1
                ?' tarefa pendente voltou para a fila de distribuição. '
                :' tarefas pendentes voltaram para a fila de distribuição. '
            )
          :''
      )+
      'O histórico de operações já realizadas foi preservado.'
  };
}

function userApproveProfessorResident_(ctx,q){
  required_(
    q.id,
    'usuário'
  );

  const user=
    get_(
      'Usuarios',
      q.id
    );

  const funcao=String(
    user.funcao||
    ''
  )
    .trim()
    .toLowerCase();

  if(
    funcao!=='professor'&&
    funcao!=='residente'
  ){
    fail_(
      'A aprovação funcional completa está disponível somente para Professor ou Residente.'
    );
  }

  const permissions=[
    ...new Set([
      ...effectivePermissions_(
        user
      ),
      ...rolePermissions_(
        'PROFESSOR_RESIDENTE'
      )
    ])
  ];

  const userData=Object.assign({},user,{
    email:user.email,
    perfil:'PROFESSOR_RESIDENTE',
    ativo:bool_(user.ativo),
    nome:user.nome,
    funcao:user.funcao,
    permissoes:JSON.stringify(
      permissions
    ),
    permissoesVersao:2
  });

  syncGoogleResourcesForUser_(
    userData,
    ctx
  );

  return authPublicUser_(change_(ctx,'Usuarios',user.id,userData,q.versao));
}

function userSave_(ctx,q){
  const nome=String(
    q.nome||''
  ).trim();

  const funcao=String(
    q.funcao||''
  ).trim();

  const email=String(
    q.email||''
  )
    .trim()
    .toLowerCase();

  const perfil=String(
    q.perfil||''
  )
    .trim()
    .toUpperCase();

  required_(nome,'nome da pessoa');
  required_(funcao,'função da pessoa');

  if(
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||
    !ROLES[perfil]
  ){
    fail_(
      'E-mail ou perfil inválido.'
    );
  }

  let permissions=
    Array.isArray(q.permissoes)
      ?q.permissoes
      :rolePermissions_(perfil);

  permissions=[
    ...new Set(
      permissions
        .map(v=>String(v||'').trim())
        .filter(v=>
          Object.prototype.hasOwnProperty.call(
            PERMISSIONS,
            v
          )
        )
    )
  ];

  if(!permissions.includes('consulta')){
    permissions.unshift('consulta');
  }

  const old=all_('Usuarios')
    .find(u=>u.email===email);

  if(
    q.id&&
    get_('Usuarios',q.id).email!==email
  ){
    fail_(
      'O próprio usuário pode alterar seu e-mail em Meu perfil.'
    );
  }

  if(
    old&&
    old.id!==q.id
  ){
    fail_(
      'Abra o usuário existente.'
    );
  }

  if(
    old&&
    old.email===ctx.email&&
    (
      !bool_(q.ativo)||
      perfil!=='ADMIN'||
      !permissions.includes('administracao')
    )
  ){
    fail_(
      'Não remova seu próprio acesso administrativo.'
    );
  }

  const userData={
    email,
    perfil,
    ativo:bool_(q.ativo),
    nome,
    funcao,
    permissoes:JSON.stringify(
      permissions
    ),
    permissoesVersao:2
  };

  authCheckAvailableEmail_(email,old&&old.id);
  return authPublicUser_(change_(ctx,'Usuarios',old?old.id:id_('USR',email),
    Object.assign({},old||{},userData),q.versao));
}

