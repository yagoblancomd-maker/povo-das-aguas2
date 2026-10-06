function identity_(){
  const email=String(
    PDA_AUTH_CONTEXT_EMAIL_||
    ''
  )
    .trim()
    .toLowerCase();

  if(!email){
    fail_(
      'AUTH: sessão autenticada necessária. Entre novamente com o Google.'
    );
  }

  return email;
}

function activeUser_(){
  const email=identity_();

  const user=all_('Usuarios')
    .find(r=>
      String(r.email||'').toLowerCase()===email&&
      bool_(r.ativo)
    );

  if(!user){
    fail_(
      'Seu usuário Google não está autorizado ou está com o acesso desativado.'
    );
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
  if(hasPermission_(user,'retificacao')){
    return true;
  }

  if(!hasPermission_(user,'retificacao_propria')){
    return false;
  }

  const creator=personCreatorEmail_(p);

  return !!creator&&creator===String(user.email||'').trim().toLowerCase();
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
    creator===
      String(
        user.email||
        ''
      )
        .trim()
        .toLowerCase();

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
    user&&user.email||''
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
    )||''
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

  const resources=[];

  try{
    resources.push({
      nome:'pasta principal do Povo das Águas',
      item:DriveApp.getFolderById(
        PDA.parent
      )
    });
  }catch(e){
    fail_(
      'Não foi possível localizar a pasta principal do Povo das Águas para sincronizar o acesso Google.'
    );
  }

  const sid=String(
    props_().getProperty(
      'SPREADSHEET_ID'
    )||''
  ).trim();

  if(!sid){
    fail_(
      'SPREADSHEET_ID não está configurado.'
    );
  }

  try{
    resources.push({
      nome:'banco de dados do Povo das Águas',
      item:DriveApp.getFileById(
        sid
      )
    });
  }catch(e){
    fail_(
      'Não foi possível localizar a planilha do Povo das Águas para sincronizar o acesso Google.'
    );
  }

  resources.forEach(resource=>{
    setGoogleAccess_(
      resource.item,
      email,
      level
    );

    if(
      ctx&&
      Array.isArray(ctx.effects)
    ){
      ctx.effects.push(
        (
          level==='NONE'
            ?'Acesso Google removido'
            :'Acesso Google '+level+' concedido'
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
    nivel:level
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
  'Aluno'
]);

function selfRegistrationAccess_(funcao){
  const clean=String(funcao||'').trim();

  if(clean==='Professor'||clean==='Residente'){
    return {
      perfil:'PROFESSOR_RESIDENTE',
      permissoes:['consulta','cadastro'],
      aprovacaoPendente:true,
      resumo:'Consulta e Cadastro inicialmente. As demais permissões operacionais de Professor/Residente dependem de aprovação do Administrador.'
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

  fail_('Função de autocadastro inválida.');
}

function lock_(fn){
  const lock=LockService.getScriptLock();

  if(!lock.tryLock(30000)){
    fail_(
      'Sistema ocupado. Tente novamente com a mesma operação.'
    );
  }

  try{
    return fn();
  }finally{
    lock.releaseLock();
  }
}
