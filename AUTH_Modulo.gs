let PDA_AUTH_CONTEXT_EMAIL_='';

const PDA_AUTH_SESSION_HOURS=12;
const PDA_AUTH_STATE_MINUTES=10;
const PDA_AUTH_REGISTRATION_MINUTES=20;

function authSecret_(){
  const properties=props_();
  let secret=String(
    properties.getProperty('APP_AUTH_SECRET')||''
  );

  if(!secret){
    secret=[
      Utilities.getUuid(),
      Utilities.getUuid(),
      Utilities.getUuid(),
      Utilities.getUuid()
    ].join(':');

    properties.setProperty(
      'APP_AUTH_SECRET',
      secret
    );
  }

  return secret;
}

function authBase64UrlEncode_(text){
  return Utilities
    .base64EncodeWebSafe(
      String(text),
      Utilities.Charset.UTF_8
    )
    .replace(/=+$/g,'');
}

function authBase64UrlDecode_(text){
  const value=String(text||'');
  const padded=
    value+
    '='.repeat(
      (4-value.length%4)%4
    );

  return Utilities.newBlob(
    Utilities.base64DecodeWebSafe(
      padded
    )
  ).getDataAsString('UTF-8');
}

function authSign_(payload){
  return Utilities
    .base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(
        String(payload),
        authSecret_(),
        Utilities.Charset.UTF_8
      )
    )
    .replace(/=+$/g,'');
}

function authSignedToken_(data){
  const payload=
    authBase64UrlEncode_(
      JSON.stringify(data)
    );

  return payload+'.'+authSign_(payload);
}

function authReadSignedToken_(token,label){
  const parts=String(token||'').split('.');

  if(parts.length!==2){
    fail_('AUTH: '+label+' inválido.');
  }

  const payload=parts[0];
  const signature=parts[1];
  const expected=authSign_(payload);

  if(signature!==expected){
    fail_('AUTH: assinatura inválida.');
  }

  let data;

  try{
    data=JSON.parse(
      authBase64UrlDecode_(payload)
    );
  }catch(e){
    fail_('AUTH: não foi possível validar '+label+'.');
  }

  return data;
}

function googleOAuthConfig_(){
  const properties=props_();

  const clientId=String(
    properties.getProperty(
      'GOOGLE_OAUTH_CLIENT_ID'
    )||''
  ).trim();

  const clientSecret=String(
    properties.getProperty(
      'GOOGLE_OAUTH_CLIENT_SECRET'
    )||''
  ).trim();

  const redirectUri=String(
    ScriptApp.getService().getUrl()||
    ''
  ).trim();

  return {
    configurada:
      /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(
        clientId
      )&&
      !!clientSecret&&
      /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(
        redirectUri
      ),
    clientId,
    clientSecret,
    redirectUri
  };
}

function googleOAuthStatus_(){
  const config=googleOAuthConfig_();

  return {
    configurada:config.configurada,
    clientId:
      config.clientId
        ?config.clientId
        :'',
    clientSecretConfigurado:
      !!config.clientSecret,
    redirectUri:config.redirectUri,
    mensagem:
      config.configurada
        ?'Login Google configurado para uma única implantação.'
        :'Configure GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET.'
  };
}

function googleOAuthConfigSave_(ctx,q){
  const clientId=String(
    q.clientId||
    ''
  ).trim();

  const secret=String(
    q.clientSecret||
    ''
  ).trim();

  if(
    !/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(
      clientId
    )
  ){
    fail_(
      'Informe um Client ID OAuth 2.0 do tipo Aplicativo da Web.'
    );
  }

  props_().setProperty(
    'GOOGLE_OAUTH_CLIENT_ID',
    clientId
  );

  if(secret){
    props_().setProperty(
      'GOOGLE_OAUTH_CLIENT_SECRET',
      secret
    );
  }

  if(
    !String(
      props_().getProperty(
        'GOOGLE_OAUTH_CLIENT_SECRET'
      )||
      ''
    ).trim()
  ){
    fail_(
      'Informe também o Client Secret OAuth 2.0.'
    );
  }

  ctx.effects.push(
    'Configuração do login Google atualizada.'
  );

  return {
    configurada:true,
    clientId,
    redirectUri:
      ScriptApp.getService().getUrl(),
    mensagem:
      'Login Google atualizado.'
  };
}

function authStateCreate_(){
  return authSignedToken_({
    type:'oauth-state',
    issuedAt:Date.now(),
    nonce:Utilities.getUuid()
  });
}

function authStateRead_(state){
  const data=
    authReadSignedToken_(
      state,
      'estado OAuth'
    );

  if(data.type!=='oauth-state'){
    fail_('AUTH: estado OAuth incompatível.');
  }

  const age=
    Date.now()-
    Number(data.issuedAt||0);

  if(
    age<0||
    age>
      PDA_AUTH_STATE_MINUTES*
      60*
      1000
  ){
    fail_(
      'AUTH: a tentativa de login expirou. Inicie o login novamente.'
    );
  }

  return data;
}

function googleOAuthLoginUrl_(){
  const config=googleOAuthConfig_();

  if(!config.configurada){
    return '';
  }

  const params={
    client_id:config.clientId,
    redirect_uri:config.redirectUri,
    response_type:'code',
    scope:'openid email profile',
    state:authStateCreate_(),
    prompt:'select_account',
    access_type:'online',
    include_granted_scopes:'true'
  };

  return (
    'https://accounts.google.com/o/oauth2/v2/auth?'+
    Object.keys(params)
      .map(key=>
        encodeURIComponent(key)+
        '='+
        encodeURIComponent(params[key])
      )
      .join('&')
  );
}

function googleOAuthTokenExchange_(code){
  const config=googleOAuthConfig_();

  if(!config.configurada){
    fail_(
      'AUTH: o Login Google ainda não foi configurado.'
    );
  }

  const response=
    UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/token',
      {
        method:'post',
        payload:{
          code:String(code||''),
          client_id:config.clientId,
          client_secret:config.clientSecret,
          redirect_uri:config.redirectUri,
          grant_type:'authorization_code'
        },
        muteHttpExceptions:true
      }
    );

  const text=
    response.getContentText()||
    '{}';

  let data={};

  try{
    data=JSON.parse(text);
  }catch(e){}

  if(
    response.getResponseCode()!==200||
    !data.id_token
  ){
    fail_(
      'AUTH: o Google não concluiu a autenticação. '+
      String(
        data.error_description||
        data.error||
        'Tente entrar novamente.'
      )
    );
  }

  return data;
}

function googleIdTokenPayload_(idToken){
  const parts=String(idToken||'').split('.');

  if(parts.length!==3){
    fail_('AUTH: ID Token Google inválido.');
  }

  try{
    return JSON.parse(
      authBase64UrlDecode_(
        parts[1]
      )
    );
  }catch(e){
    fail_(
      'AUTH: não foi possível ler a identidade Google.'
    );
  }
}

function googleIdentityVerify_(idToken){
  const config=googleOAuthConfig_();

  const response=
    UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token='+
      encodeURIComponent(
        String(idToken||'')
      ),
      {
        method:'get',
        muteHttpExceptions:true
      }
    );

  let verified={};

  try{
    verified=JSON.parse(
      response.getContentText()||
      '{}'
    );
  }catch(e){}

  if(response.getResponseCode()!==200){
    fail_(
      'AUTH: não foi possível validar a identidade Google.'
    );
  }

  if(verified.aud!==config.clientId){
    fail_(
      'AUTH: o token Google foi emitido para outro aplicativo.'
    );
  }

  if(
    ![
      'accounts.google.com',
      'https://accounts.google.com'
    ].includes(
      String(verified.iss||'')
    )
  ){
    fail_(
      'AUTH: emissor Google inválido.'
    );
  }

  if(
    Number(verified.exp||0)*
    1000<=Date.now()
  ){
    fail_(
      'AUTH: a autenticação Google expirou.'
    );
  }

  if(
    ![
      true,
      'true',
      '1'
    ].includes(
      verified.email_verified
    )
  ){
    fail_(
      'AUTH: o e-mail Google não foi verificado.'
    );
  }

  const email=String(
    verified.email||
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
      'AUTH: e-mail Google inválido.'
    );
  }

  const payload=
    googleIdTokenPayload_(
      idToken
    );

  return {
    email,
    sub:String(
      verified.sub||
      payload.sub||
      ''
    ),
    nome:String(
      payload.name||
      ''
    ).trim(),
    picture:String(
      payload.picture||
      ''
    ).trim()
  };
}

function authSessionCreate_(email){
  const now=Date.now();

  return authSignedToken_({
    type:'session',
    email:String(email||'')
      .trim()
      .toLowerCase(),
    issuedAt:now,
    expiresAt:
      now+
      PDA_AUTH_SESSION_HOURS*
      60*
      60*
      1000,
    nonce:Utilities.getUuid()
  });
}

function authSessionRead_(token){
  const data=
    authReadSignedToken_(
      token,
      'sessão'
    );

  if(data.type!=='session'){
    fail_(
      'AUTH: sessão incompatível.'
    );
  }

  if(
    Number(data.expiresAt||0)<
    Date.now()
  ){
    fail_(
      'AUTH: sua sessão expirou. Entre novamente com o Google.'
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
      'AUTH: sessão sem identidade válida.'
    );
  }

  return {
    email,
    expiresAt:Number(
      data.expiresAt
    )
  };
}

function authRegistrationProofCreate_(identity){
  const now=Date.now();

  return authSignedToken_({
    type:'registration',
    email:identity.email,
    sub:identity.sub,
    nome:identity.nome||'',
    issuedAt:now,
    expiresAt:
      now+
      PDA_AUTH_REGISTRATION_MINUTES*
      60*
      1000,
    nonce:Utilities.getUuid()
  });
}

function authRegistrationProofRead_(token){
  const data=
    authReadSignedToken_(
      token,
      'comprovante de identidade'
    );

  if(data.type!=='registration'){
    fail_(
      'AUTH: comprovante de primeiro acesso incompatível.'
    );
  }

  if(
    Number(data.expiresAt||0)<
    Date.now()
  ){
    fail_(
      'AUTH: o primeiro acesso expirou. Entre novamente com o Google.'
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
      'AUTH: identidade de primeiro acesso inválida.'
    );
  }

  return {
    email,
    sub:String(data.sub||''),
    nome:String(data.nome||'')
  };
}

function authFindUser_(email){
  return all_('Usuarios')
    .find(user=>
      String(
        user.email||
        ''
      )
        .trim()
        .toLowerCase()===
      String(email||'')
        .trim()
        .toLowerCase()
    )||
    null;
}

function authAfterGoogle_(identity){
  resetData_();

  const user=
    authFindUser_(
      identity.email
    );

  if(user){
    if(!bool_(user.ativo)){
      return {
        status:'BLOCKED',
        email:identity.email,
        nome:user.nome||identity.nome||'',
        mensagem:
          'Este usuário está desativado. Procure a Administração do Povo das Águas.'
      };
    }

    return {
      status:'AUTHENTICATED',
      email:identity.email,
      nome:user.nome||identity.nome||'',
      sessionToken:
        authSessionCreate_(
          identity.email
        )
    };
  }

  return {
    status:'REGISTER',
    email:identity.email,
    nome:identity.nome||'',
    registrationProof:
      authRegistrationProofCreate_(
        identity
      )
  };
}

function authRegister(registrationProof,nome,funcao){
  const identity=
    authRegistrationProofRead_(
      registrationProof
    );

  const cleanName=String(
    nome||
    identity.nome||
    ''
  )
    .trim()
    .replace(/\s+/g,' ');

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
      authFindUser_(
        identity.email
      );

    if(existing){
      if(!bool_(existing.ativo)){
        fail_(
          'Este usuário está desativado. Procure a Administração.'
        );
      }

      return {
        status:'AUTHENTICATED',
        sessionToken:
          authSessionCreate_(
            identity.email
          ),
        email:identity.email,
        nome:existing.nome||cleanName
      };
    }

    const access=
      selfRegistrationAccess_(
        cleanFunction
      );

    const permissions=
      Array.from(
        access.permissoes
      );

    const ctx={
      email:identity.email,
      op:id_(
        'OP',
        'SELF_REGISTER:'+
        identity.email+
        ':'+
        Utilities.getUuid()
      ),
      hash:hash_({
        email:identity.email,
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
          identity.email
        ),
        {
          email:identity.email,
          perfil:access.perfil,
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
        criado:true,
        permissoes:permissions
      }
    );

    /*
     * Mantém acesso de leitura aos arquivos do Drive usados pelos links
     * diretos da interface. As gravações do sistema são executadas pelo
     * proprietário da única implantação.
     */
    try{
      syncGoogleResourcesForUser_(
        Object.assign(
          {},
          user,
          {
            ativo:true
          }
        ),
        {
          effects:[]
        }
      );
    }catch(e){}

    return {
      status:'AUTHENTICATED',
      sessionToken:
        authSessionCreate_(
          identity.email
        ),
      email:user.email,
      nome:user.nome,
      perfil:user.perfil,
      permissoes,
      resumoAcesso:access.resumo
    };
  });
}

function authResume(sessionToken){
  const session=
    authSessionRead_(
      sessionToken
    );

  return lock_(()=>{
    resetData_();

    const user=
      authFindUser_(
        session.email
      );

    if(
      !user||
      !bool_(user.ativo)
    ){
      fail_(
        'AUTH: usuário inexistente ou desativado.'
      );
    }

    return {
      status:'AUTHENTICATED',
      email:user.email,
      nome:user.nome||'',
      funcao:user.funcao||'',
      perfil:user.perfil,
      expiresAt:session.expiresAt
    };
  });
}

function withAuthSession_(sessionToken,fn){
  const session=
    authSessionRead_(
      sessionToken
    );

  PDA_AUTH_CONTEXT_EMAIL_=
    session.email;

  try{
    return fn(
      session
    );
  }finally{
    PDA_AUTH_CONTEXT_EMAIL_='';
  }
}

function authPageBootstrap_(e){
  const config=
    googleOAuthStatus_();

  const out={
    configured:
      config.configurada,
    clientId:
      config.clientId,
    redirectUri:
      config.redirectUri,
    loginUrl:'',
    initialSessionToken:'',
    initialRegistrationProof:'',
    googleEmail:'',
    googleName:'',
    status:'',
    error:''
  };

  if(!config.configurada){
    out.error=
      'O Login Google ainda não foi configurado pela Administração.';
    return out;
  }

  out.loginUrl=
    googleOAuthLoginUrl_();

  const params=
    e&&e.parameter
      ?e.parameter
      :{};

  if(params.error){
    out.error=
      'O Google não concluiu o login: '+
      String(
        params.error_description||
        params.error
      );

    return out;
  }

  if(!params.code){
    return out;
  }

  try{
    authStateRead_(
      params.state
    );

    const tokens=
      googleOAuthTokenExchange_(
        params.code
      );

    const identity=
      googleIdentityVerify_(
        tokens.id_token
      );

    const result=
      authAfterGoogle_(
        identity
      );

    out.status=result.status;
    out.googleEmail=result.email||identity.email;
    out.googleName=result.nome||identity.nome||'';
    out.initialSessionToken=
      result.sessionToken||
      '';
    out.initialRegistrationProof=
      result.registrationProof||
      '';

    if(result.mensagem){
      out.error=result.mensagem;
    }

  }catch(error){
    out.error=
      error.message||
      String(error);
  }

  return out;
}
