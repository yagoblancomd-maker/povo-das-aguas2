function currentGoogleEmail_(){
  let email='';

  try{
    email=String(
      Session
        .getActiveUser()
        .getEmail()||
      ''
    )
      .trim()
      .toLowerCase();
  }catch(e){}

  if(email){
    return email;
  }

  /*
   * Contas Gmail pessoais e usuários externos podem não ser expostos por
   * Session.getActiveUser().getEmail() mesmo quando o Web App exige login.
   * Como o manifesto já possui userinfo.email, consultamos o endpoint oficial
   * do Google com o token OAuth da própria execução.
   *
   * IMPORTANTE: o fallback só é aceito quando a execução não está ocorrendo
   * como o proprietário. Isso impede que uma implantação "Executar como eu"
   * identifique todo visitante como o dono do sistema.
   */
  try{
    const effective=String(
      Session
        .getEffectiveUser()
        .getEmail()||
      ''
    )
      .trim()
      .toLowerCase();

    const owner=String(
      props_().getProperty(
        'OWNER_EMAIL'
      )||
      ''
    )
      .trim()
      .toLowerCase();

    if(
      effective&&
      owner&&
      effective===owner
    ){
      return '';
    }

    const token=
      ScriptApp.getOAuthToken();

    if(!token){
      return '';
    }

    const response=
      UrlFetchApp.fetch(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        {
          method:'get',
          headers:{
            Authorization:
              'Bearer '+
              token
          },
          muteHttpExceptions:true
        }
      );

    if(
      response.getResponseCode()!==
      200
    ){
      return '';
    }

    const data=
      JSON.parse(
        response.getContentText()||
        '{}'
      );

    email=String(
      data.email||
      ''
    )
      .trim()
      .toLowerCase();

    if(
      data.email_verified===false
    ){
      return '';
    }

    return email;

  }catch(e){
    return '';
  }
}

function identity_(){
  const email=
    currentGoogleEmail_();

  if(!email){
    fail_(
      'Não foi possível identificar a Conta Google desta execução. '+
      'A implantação principal deve executar como "Usuário que acessa o app" e exigir login Google.'
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

const SELF_REGISTRATION_FUNCTIONS=Object.freeze([
  'Professor',
  'Residente',
  'Colaborador',
  'Aluno'
]);

function selfRegistrationGatewayUrl_(){
  return String(
    props_().getProperty(
      'SELF_REGISTRATION_WEBAPP_URL'
    )||
    ''
  ).trim();
}

function selfRegistrationStatus_(){
  const url=
    selfRegistrationGatewayUrl_();

  return {
    configurada:
      /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(
        url
      ),
    url,
    funcoes:
      Array.from(
        SELF_REGISTRATION_FUNCTIONS
      )
  };
}

function autoCadastroGatewaySave_(ctx,q){
  const url=String(
    q.url||
    ''
  ).trim();

  if(
    !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(
      url
    )
  ){
    fail_(
      'Informe a URL /exec da implantação de autocadastro do Apps Script.'
    );
  }

  props_().setProperty(
    'SELF_REGISTRATION_WEBAPP_URL',
    url
  );

  ctx.effects.push(
    'URL do gateway de autocadastro atualizada.'
  );

  return {
    configurada:true,
    url,
    mensagem:
      'Gateway de autocadastro configurado.'
  };
}

function selfRegistrationSecret_(){
  const properties=
    props_();

  let secret=String(
    properties.getProperty(
      'SELF_REGISTRATION_SECRET'
    )||
    ''
  );

  if(!secret){
    secret=
      Utilities.getUuid()+
      ':'+
      Utilities.getUuid()+
      ':'+
      Utilities.getUuid();

    properties.setProperty(
      'SELF_REGISTRATION_SECRET',
      secret
    );
  }

  return secret;
}

function base64UrlText_(text){
  return Utilities
    .base64EncodeWebSafe(
      String(text),
      Utilities.Charset.UTF_8
    )
    .replace(
      /=+$/g,
      ''
    );
}

function hmacRegistration_(payload){
  return Utilities
    .base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(
        payload,
        selfRegistrationSecret_(),
        Utilities.Charset.UTF_8
      )
    )
    .replace(
      /=+$/g,
      ''
    );
}

function selfRegistrationToken_(email,returnUrl){
  const payload=
    base64UrlText_(
      JSON.stringify({
        email:String(email||'')
          .trim()
          .toLowerCase(),
        returnUrl:String(returnUrl||'')
          .trim(),
        issuedAt:Date.now(),
        nonce:Utilities.getUuid()
      })
    );

  return (
    payload+
    '.'+
    hmacRegistration_(
      payload
    )
  );
}

function selfRegistrationTokenRead_(token){
  const parts=String(
    token||
    ''
  ).split('.');

  if(parts.length!==2){
    fail_(
      'Convite de autocadastro inválido.'
    );
  }

  const payload=parts[0];
  const signature=parts[1];
  const expected=
    hmacRegistration_(
      payload
    );

  if(signature!==expected){
    fail_(
      'A assinatura do autocadastro é inválida.'
    );
  }

  let data;

  try{
    const paddedPayload=
      payload+
      '='.repeat(
        (
          4-
          payload.length%4
        )%4
      );

    data=JSON.parse(
      Utilities.newBlob(
        Utilities.base64DecodeWebSafe(
          paddedPayload
        )
      ).getDataAsString(
        'UTF-8'
      )
    );
  }catch(e){
    fail_(
      'Não foi possível validar os dados do autocadastro.'
    );
  }

  const email=String(
    data.email||
    ''
  )
    .trim()
    .toLowerCase();

  if(
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ){
    fail_(
      'Conta Google inválida no autocadastro.'
    );
  }

  const issuedAt=
    Number(
      data.issuedAt||
      0
    );

  if(
    !issuedAt||
    Date.now()-issuedAt>
      30*60*1000||
    issuedAt>Date.now()+60*1000
  ){
    fail_(
      'Este convite de autocadastro expirou. Volte ao Povo das Águas e inicie novamente.'
    );
  }

  const returnUrl=String(
    data.returnUrl||
    ''
  ).trim();

  if(
    returnUrl&&
    !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(
      returnUrl
    )
  ){
    fail_(
      'URL de retorno inválida.'
    );
  }

  return {
    email,
    returnUrl
  };
}

function selfRegistrationGatewayExecution_(){
  const effective=String(
    Session.getEffectiveUser().getEmail()||
    ''
  )
    .trim()
    .toLowerCase();

  const owner=String(
    props_().getProperty(
      'OWNER_EMAIL'
    )||
    ''
  )
    .trim()
    .toLowerCase();

  return (
    !!effective&&
    !!owner&&
    effective===owner
  );
}

function selfRegisterUser_(token,nome,funcao){
  if(
    !selfRegistrationGatewayExecution_()
  ){
    fail_(
      'Esta implantação não é o gateway de autocadastro. O gateway deve ser publicado para executar como o proprietário do sistema.'
    );
  }

  const signed=
    selfRegistrationTokenRead_(
      token
    );

  const cleanName=String(
    nome||
    ''
  )
    .trim()
    .replace(
      /\s+/g,
      ' '
    );

  const cleanFunction=String(
    funcao||
    ''
  ).trim();

  if(
    cleanName.length<3||
    cleanName.length>140
  ){
    fail_(
      'Informe seu nome completo.'
    );
  }

  if(
    !SELF_REGISTRATION_FUNCTIONS.includes(
      cleanFunction
    )
  ){
    fail_(
      'Selecione Professor, Residente, Colaborador ou Aluno.'
    );
  }

  return lock_(()=>{
    resetData_();

    const existing=
      all_('Usuarios')
        .find(u=>
          String(
            u.email||
            ''
          )
            .trim()
            .toLowerCase()===
          signed.email
        );

    if(existing){
      if(
        !bool_(
          existing.ativo
        )
      ){
        fail_(
          'Esta conta possui um cadastro desativado. A reativação deve ser feita pela Administração do projeto.'
        );
      }

      /*
       * Usuário já existente nunca é rebaixado pelo autocadastro.
       * Apenas repara as permissões materiais do Google Drive.
       */
      syncGoogleResourcesForUser_(
        existing,
        {
          effects:[]
        }
      );

      return {
        criado:false,
        email:signed.email,
        returnUrl:signed.returnUrl,
        nome:
          existing.nome||
          cleanName,
        perfil:existing.perfil,
        mensagem:
          'Seu acesso já estava cadastrado e foi sincronizado.'
      };
    }

    const permissions=[
      'consulta',
      'cadastro'
    ];

    const ctx={
      email:signed.email,
      op:id_(
        'OP',
        'SELF_REGISTER:'+
        signed.email+
        ':'+
        Utilities.getUuid()
      ),
      hash:hash_({
        email:signed.email,
        nome:cleanName,
        funcao:cleanFunction
      }),
      changes:[],
      effects:[]
    };

    const user=
      change_(
        ctx,
        'Usuarios',
        id_(
          'USR',
          signed.email
        ),
        {
          email:signed.email,
          perfil:'NOVO_USUARIO',
          ativo:true,
          nome:cleanName,
          funcao:cleanFunction,
          permissoes:JSON.stringify(
            permissions
          ),
          permissoesVersao:2
        }
      );

    commit_(
      ctx,
      {
        email:user.email,
        perfil:user.perfil,
        criado:true
      }
    );

    /*
     * O registro é confirmado antes do compartilhamento. Se o compartilhamento
     * falhar, uma nova tentativa de autocadastro encontra o usuário ativo e
     * apenas refaz a sincronização do acesso Google.
     */
    syncGoogleResourcesForUser_(
      user,
      {
        effects:[]
      }
    );

    return {
      criado:true,
      email:user.email,
      returnUrl:signed.returnUrl,
      nome:user.nome,
      perfil:user.perfil,
      mensagem:
        'Seu acesso ao Povo das Águas foi criado automaticamente.'
    };
  });
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
