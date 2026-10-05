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
