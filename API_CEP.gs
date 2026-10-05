const CEP_BRASIL_API_URL='https://brasilapi.com.br/api/cep/v1';
const CEP_VIACEP_URL='https://viacep.com.br/ws';

function cepFetchJson_(url){
  let response;

  try{
    response=UrlFetchApp.fetch(
      url,
      {
        method:'get',
        headers:{
          accept:'application/json'
        },
        muteHttpExceptions:true,
        followRedirects:true
      }
    );
  }catch(e){
    return {
      ok:false,
      code:0,
      error:e.message||String(e),
      data:null
    };
  }

  const code=response.getResponseCode();
  const text=response.getContentText();

  let data=null;

  try{
    data=JSON.parse(text||'{}');
  }catch(e){
    return {
      ok:false,
      code,
      error:'Resposta inválida do serviço de CEP.',
      data:null
    };
  }

  return {
    ok:code>=200&&code<300,
    code,
    error:'',
    data
  };
}

function cepFromBrasilApi_(cep){
  const result=cepFetchJson_(
    CEP_BRASIL_API_URL+
    '/'+
    encodeURIComponent(cep)
  );

  if(!result.ok){
    return null;
  }

  const data=result.data||{};

  if(!data.cep){
    return null;
  }

  return {
    fonte:
      data.service
        ?'BrasilAPI ('+String(data.service)+')'
        :'BrasilAPI',
    cep:cepDisplay_(data.cep||cep),
    logradouro:String(data.street||'').trim(),
    complemento:'',
    bairro:String(data.neighborhood||'').trim(),
    cidade:String(data.city||'').trim(),
    uf:String(data.state||'').trim(),
    estado:'',
    regiao:'',
    ibge:
      data.ibge&&data.ibge.city
        ?String(data.ibge.city)
        :'',
    ddd:'',
    siafi:''
  };
}

function cepFromViaCep_(cep){
  const result=cepFetchJson_(
    CEP_VIACEP_URL+
    '/'+
    encodeURIComponent(cep)+
    '/json/'
  );

  if(!result.ok){
    return null;
  }

  const data=result.data||{};

  if(
    data.erro===true||
    data.erro==='true'
  ){
    return null;
  }

  return {
    fonte:'ViaCEP',
    cep:cepDisplay_(data.cep||cep),
    logradouro:String(data.logradouro||'').trim(),
    complemento:String(data.complemento||'').trim(),
    bairro:String(data.bairro||'').trim(),
    cidade:String(data.localidade||'').trim(),
    uf:String(data.uf||'').trim(),
    estado:String(data.estado||'').trim(),
    regiao:String(data.regiao||'').trim(),
    ibge:String(data.ibge||'').trim(),
    ddd:String(data.ddd||'').trim(),
    siafi:String(data.siafi||'').trim()
  };
}

function cepConsultaViaCep_(q){
  const cep=cep_(q&&q.cep);

  /*
   * BrasilAPI é a fonte principal porque já possui múltiplos provedores
   * de fallback. ViaCEP permanece como segunda tentativa.
   */
  const brasilApi=
    cepFromBrasilApi_(
      cep
    );

  if(brasilApi){
    return brasilApi;
  }

  const viaCep=
    cepFromViaCep_(
      cep
    );

  if(viaCep){
    return viaCep;
  }

  fail_(
    'CEP não encontrado ou temporariamente indisponível nos serviços de consulta.'
  );
}
