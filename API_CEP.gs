const CEP_API_URL='https://viacep.com.br/ws';

function cepConsultaViaCep_(q){
  const cep=cep_(q&&q.cep);
  const url=
    CEP_API_URL+
    '/'+
    encodeURIComponent(cep)+
    '/json/';

  const response=UrlFetchApp.fetch(
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

  const code=response.getResponseCode();

  if(code<200||code>=300){
    fail_(
      'Falha ao consultar o CEP. HTTP '+
      code+
      '.'
    );
  }

  let data;

  try{
    data=JSON.parse(
      response.getContentText()||
      '{}'
    );
  }catch(e){
    fail_(
      'O serviço de CEP retornou uma resposta inválida.'
    );
  }

  if(
    !data||
    data.erro===true||
    data.erro==='true'
  ){
    fail_(
      'CEP não encontrado.'
    );
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
