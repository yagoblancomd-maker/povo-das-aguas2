function identity_(){
  const email=Session
    .getActiveUser()
    .getEmail()
    .toLowerCase()
    .trim();

  if(!email){
    fail_(
      'Identidade Google indisponível. Acesso bloqueado; revise a implantação.'
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

    return [
      ...new Set(
        parsed
          .map(v=>String(v||'').trim())
          .filter(v=>
            Object.prototype.hasOwnProperty.call(
              PERMISSIONS,
              v
            )
          )
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

function googleResourceAccessLevel_(user){
  if(!user||!bool_(user.ativo)){
    return 'NONE';
  }

  const permissions=
    effectivePermissions_(user);

  const needsWrite=
    [
      'cadastro',
      'retificacao',
      'conferencia',
      'minuta',
      'distribuicao',
      'gestao_distribuicao',
      'administracao'
    ].some(permission=>
      permissions.includes(
        permission
      )
    );

  return needsWrite
    ?'EDITOR'
    :'VIEWER';
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
 * O Web App está executando com a identidade do usuário que o acessa.
 * Portanto, cadastrar alguém na planilha "Usuarios" não concede, por si só,
 * acesso aos arquivos do Google Drive. Esta função mantém os dois níveis
 * sincronizados:
 *
 * - somente Consulta -> leitor;
 * - qualquer permissão de alteração -> editor;
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
