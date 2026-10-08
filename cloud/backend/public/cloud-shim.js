(()=>{
  'use strict';

  async function request(url,{method='GET',body,token}={}){
    const headers={};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(token)headers.Authorization='Bearer '+token;
    const response=await fetch(url,{
      method,
      headers,
      credentials:'same-origin',
      body:body===undefined?undefined:JSON.stringify(body)
    });
    const type=response.headers.get('content-type')||'';
    const payload=type.includes('application/json')
      ?await response.json().catch(()=>({}))
      :await response.text().catch(()=>'');
    if(!response.ok){
      const message=payload&&typeof payload==='object'&&payload.message
        ?payload.message
        :(typeof payload==='string'&&payload?payload:'Falha de comunicação com o servidor.');
      const error=new Error(message);
      error.status=response.status;
      error.payload=payload;
      throw error;
    }
    return payload;
  }

  async function moduleBundle(code){
    const clean=String(code||'').toUpperCase();
    if(!/^[A-Z]+$/.test(clean))throw new Error('Módulo inválido.');
    return request('/modules/'+encodeURIComponent(clean)+'.json');
  }

  async function invoke(name,args){
    switch(name){
      case 'api':{
        const [action,data,token]=args;
        return request('/api/v1/action/'+encodeURIComponent(String(action||'')),{
          method:'POST',body:data||{},token
        });
      }
      case 'carregarModulo':
        return moduleBundle(args[0]);
      case 'carregarModulos':{
        const codes=Array.isArray(args[0])?args[0]:[];
        const entries=await Promise.all(codes.map(async code=>[code,await moduleBundle(code)]));
        return Object.fromEntries(entries);
      }
      case 'authLogin':
        return request('/api/v1/auth/login',{method:'POST',body:{email:args[0],senha:args[1]}});
      case 'authRegister':
        return request('/api/v1/auth/register',{method:'POST',body:args[0]||{}});
      case 'authResume':
        return request('/api/v1/auth/session',{token:args[0]});
      case 'authLogout':
        return request('/api/v1/auth/logout',{method:'POST',token:args[0]});
      case 'authPortalPeople':
        return request('/api/v1/auth/portal-people');
      case 'authProfile':
        return request('/api/v1/auth/profile',{token:args[0]});
      case 'authUpdateProfile':
        return request('/api/v1/auth/profile',{method:'PUT',body:args[1]||{},token:args[0]});
      case 'authChangePassword':
        return request('/api/v1/auth/change-password',{
          method:'POST',
          body:{senhaAtual:args[1],novaSenha:args[2]},
          token:args[0]
        });
      case 'authRequestRecovery':
        return request('/api/v1/auth/recovery',{method:'POST',body:{email:args[0]}});
      case 'authResetPassword':
        return request('/api/v1/auth/reset',{method:'POST',body:{token:args[0],senha:args[1]}});
      default:
        throw new Error('Operação de compatibilidade não implementada: '+name);
    }
  }

  function runner(success,failure){
    return new Proxy({},{
      get(_target,prop){
        if(prop==='withSuccessHandler')return fn=>runner(fn,failure);
        if(prop==='withFailureHandler')return fn=>runner(success,fn);
        if(prop==='then')return undefined;
        return (...args)=>{
          Promise.resolve()
            .then(()=>invoke(String(prop),args))
            .then(value=>{if(typeof success==='function')success(value);})
            .catch(error=>{if(typeof failure==='function')failure(error);else setTimeout(()=>{throw error;},0);});
          return undefined;
        };
      }
    });
  }

  window.google=window.google||{};
  window.google.script=window.google.script||{};
  Object.defineProperty(window.google.script,'run',{
    configurable:true,
    get(){return runner(null,null);}
  });
})();
