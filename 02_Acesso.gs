function identity_(){
  const email=String(
    PDA_AUTH_CONTEXT_EMAIL_||
    ''
  )
    .trim()
    .toLowerCase();

  if(!email){
    fail_(
      'AUTH: sessão autenticada necessária. Entre novamente com seu e-mail e senha.'
    );
  }

  return email;
}

function activeUser_(){
  const email=identity_();
  const revision=
    props_().getProperty(
      'PDA_DATA_REVISION'
    )||
    '0';

  const cacheKey=
    'PDA_ACTIVE_USER_'+
    hash_({
      email,
      revision
    }).slice(0,42);

  if(
    typeof CacheService!=='undefined'
  ){
    try{
      const cached=
        CacheService
          .getScriptCache()
          .get(cacheKey);

      if(cached){
        const user=
          JSON.parse(cached);

        if(
          user&&
          bool_(user.ativo)
        ){
          return user;
        }
      }
    }catch(e){}
  }

  const user=all_('Usuarios')
    .find(r=>
      String(r.email||'').toLowerCase()===email&&
      bool_(r.ativo)
    );

  if(!user){
    fail_(
      'Seu usuário não está autorizado ou está com o acesso desativado.'
    );
  }

  if(
    typeof CacheService!=='undefined'
  ){
    try{
      CacheService
        .getScriptCache()
        .put(
          cacheKey,
          JSON.stringify(user),
          120
        );
    }catch(e){}
  }

  return user;
}

function rolePermissions_(perfil){
  return Array.from(
    ROLES[perfil]||[]
  );
}

function parseUserPermissions_(user){
  const raw=String(
    user&&user.permissoes||''
  ).trim();

  if(!raw){
    return rolePermissions_(
      user&&user.perfil
    );
  }

  try{
    const parsed=JSON.parse(raw);

    if(!Array.isArray(parsed)){
      return rolePermissions_(
        user&&user.perfil
      );
    }

    const cleaned=
      parsed
        .map(v=>String(v||'').trim())
        .filter(v=>
          Object.prototype.hasOwnProperty.call(
            PERMISSIONS,
            v
          )
        );

    /*
     * Migração das permissões introduzidas com o fluxo de distribuição.
     * Usuários gravados antes da versão 2 recebem, uma única vez logicamente,
     * as novas permissões padrão do seu perfil. Depois que forem salvos pela
     * Administração, permissoesVersao=2 faz prevalecer exatamente as caixas
     * marcadas pelo administrador.
     */
    if(
      Number(
        user&&user.permissoesVersao||
        0
      )<2
    ){
      rolePermissions_(
        user&&user.perfil
      ).forEach(permission=>{
        if(!cleaned.includes(permission)){
          cleaned.push(permission);
        }
      });
    }

    return [
      ...new Set(
        cleaned
      )
    ];

  }catch(e){
    return rolePermissions_(
      user&&user.perfil
    );
  }
}

function effectivePermissions_(user){
  const permissions=
    parseUserPermissions_(user);

  /*
   * Consulta é a permissão estrutural mínima para um usuário ativo.
   */
  if(!permissions.includes('consulta')){
    permissions.unshift('consulta');
  }

  return permissions;
}

function hasPermission_(user,permission){
  return effectivePermissions_(user)
    .includes(permission);
}

function authorize_(permission){
  const user=activeUser_();

  if(
    !hasPermission_(
      user,
      permission
    )
  ){
    fail_(
      'Acesso não autorizado para '+
      permission+
      '.'
    );
  }

  return user.email;
}

function normalizeEntityScope_(value){
  return String(value||'')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase();
}

function isColonyUser_(user){
  return String(
    user&&user.perfil||
    ''
  ).toUpperCase()==='COLONIA_PESCADOR';
}

function colonyUserEntity_(user){
  return String(
    user&&user.entidade||
    ''
  ).trim();
}

function personInUserScope_(user,person){
  if(!isColonyUser_(user)){
    return true;
  }

  const entity=
    colonyUserEntity_(
      user
    );

  if(!entity){
    return false;
  }

  return (
    normalizeEntityScope_(
      person&&person.entidade
    )===
    normalizeEntityScope_(
      entity
    )
  );
}

function authorizePersonScope_(person){
  const user=
    activeUser_();

  if(
    !personInUserScope_(
      user,
      person
    )
  ){
    fail_(
      'Este cadastro não pertence à entidade vinculada ao seu usuário.'
    );
  }

  return user;
}

function getScopedPerson_(id){
  const person=
    get_(
      'Pessoas',
      id
    );

  authorizePersonScope_(
    person
  );

  return person;
}

function filterPeopleByUserScope_(rows,user){
  const current=
    user||
    activeUser_();

  return (
    Array.isArray(rows)
      ?rows
      :[]
  )
    .filter(person=>
      personInUserScope_(
        current,
        person
      )
    );
}

function processInUserScope_(user,process){
  if(!isColonyUser_(user)){
    return true;
  }

  if(!process||!process.pessoaId){
    return false;
  }

  const person=
    findById_(
      'Pessoas',
      process.pessoaId
    );

  return !!person&&
    personInUserScope_(
      user,
      person
    );
}

function authorizeProcessScope_(process){
  const user=
    activeUser_();

  if(
    !processInUserScope_(
      user,
      process
    )
  ){
    fail_(
      'Este processo não pertence à entidade vinculada ao seu usuário.'
    );
  }

  return user;
}

function taskAssigneeCanAccessPerson_(user,personId){
  if(
    !isColonyUser_(
      user
    )||
    !personId
  ){
    return true;
  }

  const person=
    findById_(
      'Pessoas',
      personId
    );

  return !!person&&
    personInUserScope_(
      user,
      person
    );
}

function requireTaskAssigneePersonScope_(user,personId){
  if(
    !taskAssigneeCanAccessPerson_(
      user,
      personId
    )
  ){
    fail_(
      'O responsável da Colônia não pode receber tarefa vinculada a membro de outra entidade.'
    );
  }

  return true;
}

function enforcePersonEntityPayload_(user,payload){
  const data=
    Object.assign(
      {},
      payload||
      {}
    );

  if(
    !isColonyUser_(
      user
    )
  ){
    return data;
  }

  const entity=
    colonyUserEntity_(
      user
    );

  if(!entity){
    fail_(
      'Seu perfil de Colônia não possui entidade vinculada. Solicite ajuste à Administração.'
    );
  }

  data.entidade=entity;
  data.outraEntidade='';

  return data;
}

function personCreatorEmail_(p){
  const explicit=String(p&&p.criadoPor||'').trim().toLowerCase();
  if(explicit)return explicit;

  if(Number(p&&p.versao||0)===1&&p&&p.usuario){
    return String(p.usuario).trim().toLowerCase();
  }

  const history=all_('Historico')
    .filter(h=>h.entidade==='Pessoas'&&h.registroId===p.id)
    .sort((a,b)=>String(a.criadoEm||'').localeCompare(String(b.criadoEm||'')));

  for(const item of history){
    try{
      const before=JSON.parse(item.antes||'null');
      const after=JSON.parse(item.depois||'null');

      if(!before&&after){
        const creator=String(after.criadoPor||after.usuario||'').trim().toLowerCase();
        if(creator)return creator;
      }
    }catch(e){}
  }

  return '';
}

function canRetifyPerson_(user,p){
  if(
    !personInUserScope_(
      user,
      p
    )
  ){
    return false;
  }

  if(hasPermission_(user,'retificacao')){
    return true;
  }

  if(!hasPermission_(user,'retificacao_propria')){
    return false;
  }

  const creator=personCreatorEmail_(p);

  return !!creator&&authUserEmailMatches_(user,creator);
}

function authorizePersonRetification_(p){
  const user=activeUser_();

  if(!canRetifyPerson_(user,p)){
    fail_('Você somente pode retificar cadastros que tenha autorização para editar.');
  }

  return user.email;
}

function canWritePersonContent_(user,p){
  if(
    !personInUserScope_(
      user,
      p
    )
  ){
    return false;
  }

  if(
    hasPermission_(
      user,
      'retificacao'
    )
  ){
    return true;
  }

  const creator=
    personCreatorEmail_(
      p
    );

  const own=
    !!creator&&
    authUserEmailMatches_(user,creator);

  if(!own){
    return false;
  }

  return (
    hasPermission_(
      user,
      'cadastro'
    )||
    hasPermission_(
      user,
      'retificacao_propria'
    )
  );
}

function authorizePersonContentWrite_(p){
  const user=
    activeUser_();

  if(
    !canWritePersonContent_(
      user,
      p
    )
  ){
    fail_(
      'Você não pode alterar documentos ou gerar peças para um cadastro criado por outro usuário.'
    );
  }

  return user.email;
}

function googleResourceAccessLevel_(user){
  if(
    !user||
    !bool_(
      user.ativo
    )
  ){
    return 'NONE';
  }

  /*
   * Na arquitetura de implantação única, toda gravação é executada pelo
   * proprietário do Web App e passa pelas permissões do sistema. Usuários
   * ativos recebem somente leitura direta no Drive para abrir/baixar os
   * documentos; nunca edição direta da pasta raiz ou do banco.
   */
  return 'VIEWER';
}

function removeGoogleAccess_(resource,email){
  try{
    resource.removeEditor(email);
  }catch(e){}

  try{
    resource.removeViewer(email);
  }catch(e){}
}

function setGoogleAccess_(resource,email,level){
  if(level==='EDITOR'){
    try{
      resource.addEditor(email);
      return;
    }catch(e){
      fail_(
        'Não foi possível conceder acesso de edição no Google Drive para '+
        email+
        ': '+
        (e.message||String(e))
      );
    }
  }

  if(level==='VIEWER'){
    try{
      try{
        resource.removeEditor(email);
      }catch(e){}

      resource.addViewer(email);
      return;
    }catch(e){
      fail_(
        'Não foi possível conceder acesso de consulta no Google Drive para '+
        email+
        ': '+
        (e.message||String(e))
      );
    }
  }

  removeGoogleAccess_(
    resource,
    email
  );
}

/**
 * O Web App executa como o proprietário e a identidade do usuário é validada
 * pela sessão do aplicativo. Esta sincronização permanece apenas para permitir
 * a abertura direta de arquivos do Google Drive pela interface:
 *
 * - usuário ativo -> leitor dos arquivos diretos;
 * - qualquer gravação -> executada pelo servidor como proprietário;
 * - usuário inativo -> acesso direto removido.
 */
function syncGoogleResourcesForUser_(user,ctx){
  const email=String(
    user&&user.email||
    ''
  )
    .trim()
    .toLowerCase();

  required_(
    email,
    'e-mail Google do usuário'
  );

  const owner=String(
    props_().getProperty(
      'OWNER_EMAIL'
    )||
    ''
  )
    .trim()
    .toLowerCase();

  if(email===owner){
    return {
      email,
      nivel:'PROPRIETARIO'
    };
  }

  const level=
    googleResourceAccessLevel_(
      user
    );

  const colony=
    isColonyUser_(
      user
    );

  const attendancePerson=
    new Map(
      all_('Atendimentos')
        .map(row=>[
          row.id,
          row.pessoaId
        ])
    );

  const personIdFromReference_=reference=>{
    return (
      personIdFromOwner_(
        reference
      )||
      attendancePerson.get(
        String(reference||'')
      )||
      ''
    );
  };

  const resources=
    new Map();

  const registerFile_=(fileId,personId,label)=>{
    const id=String(fileId||'').trim();

    if(!id)return;

    const person=
      personId
        ?findById_(
            'Pessoas',
            personId
          )
        :null;

    const allowed=
      !colony||
      (
        !!person&&
        personInUserScope_(
          user,
          person
        )
      );

    const current=
      resources.get(id);

    if(current){
      current.allowed=
        current.allowed||
        allowed;
      return;
    }

    resources.set(
      id,
      {
        id,
        allowed,
        nome:
          label||
          'documento '+id
      }
    );
  };

  all_('Documentos')
    .forEach(row=>{
      registerFile_(
        row.fileId,
        personIdFromReference_(
          row.atendimentoId
        ),
        row.nome||
        'documento '+row.id
      );
    });

  all_('Minutas')
    .forEach(row=>{
      const personId=
        personIdFromReference_(
          row.atendimentoId
        );

      registerFile_(
        row.fileId,
        personId,
        'minuta '+row.id
      );

      registerFile_(
        row.pdfFileId,
        personId,
        'PDF da minuta '+row.id
      );
    });

  let granted=0;
  let removed=0;
  let skipped=0;

  resources.forEach(resource=>{
    let file;

    try{
      file=
        DriveApp.getFileById(
          resource.id
        );
    }catch(e){
      skipped++;
      return;
    }

    const desiredLevel=
      resource.allowed
        ?level
        :'NONE';

    setGoogleAccess_(
      file,
      email,
      desiredLevel
    );

    if(desiredLevel==='NONE'){
      removed++;
    }else{
      granted++;
    }

    if(
      ctx&&
      Array.isArray(ctx.effects)
    ){
      ctx.effects.push(
        (
          desiredLevel==='NONE'
            ?'Acesso Google removido'
            :'Acesso Google '+desiredLevel+' concedido'
        )+
        ': '+
        resource.nome+
        ' — '+
        email
      );
    }
  });

  return {
    email,
    nivel:level,
    escopoEntidade:
      colony
        ?colonyUserEntity_(user)
        :'',
    concedidos:granted,
    removidos:removed,
    ignorados:skipped
  };
}

function syncAllGoogleResources_(ctx){
  const results=[];

  all_('Usuarios')
    .forEach(user=>{
      results.push(
        syncGoogleResourcesForUser_(
          user,
          ctx
        )
      );
    });

  return {
    quantidade:results.length,
    usuarios:results,
    mensagem:
      'Acessos Google sincronizados para '+
      results.length+
      ' usuário(s).'
  };
}

const SELF_REGISTRATION_FUNCTIONS=Object.freeze([
  'Professor',
  'Residente',
  'Colaborador',
  'Aluno',
  'Colônia de Pescador'
]);

function selfRegistrationAccess_(funcao){
  const clean=String(funcao||'').trim();

  if(clean==='Professor'||clean==='Residente'){
    return {
      perfil:'PROFESSOR_RESIDENTE',
      permissoes:rolePermissions_('PROFESSOR_RESIDENTE'),
      aprovacaoPendente:false,
      resumo:'Acesso operacional automático de Professor/Residente, sem aprovação individual.'
    };
  }

  if(clean==='Colaborador'){
    return {
      perfil:'COLABORADOR',
      permissoes:rolePermissions_('COLABORADOR'),
      aprovacaoPendente:false,
      resumo:'Consulta, Cadastro e Retificação somente dos cadastros criados pelo próprio colaborador.'
    };
  }

  if(clean==='Aluno'){
    return {
      perfil:'ALUNO',
      permissoes:rolePermissions_('ALUNO'),
      aprovacaoPendente:false,
      resumo:'Consulta e Distribuir processos, para receber e concluir tarefas atribuídas.'
    };
  }

  if(clean==='Colônia de Pescador'){
    return {
      perfil:'COLONIA_PESCADOR',
      permissoes:rolePermissions_('COLONIA_PESCADOR'),
      aprovacaoPendente:false,
      resumo:'Acesso restrito aos cadastros, processos e tarefas da entidade vinculada.'
    };
  }

  fail_('Função de autocadastro inválida.');
}

let PDA_LOCK_DEPTH_=0;
function lock_(fn){
  if(PDA_LOCK_DEPTH_>0)return fn();
  const lock=LockService.getScriptLock();

  if(!lock.tryLock(30000)){
    fail_(
      'Sistema ocupado. Tente novamente com a mesma operação.'
    );
  }

  try{
    PDA_LOCK_DEPTH_++;
    return fn();
  }finally{
    PDA_LOCK_DEPTH_--;
    lock.releaseLock();
  }
}

