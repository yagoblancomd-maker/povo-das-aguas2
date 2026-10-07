const DEEPSEEK_API_KEY_PROPERTY='DEEPSEEK_API_KEY';
const DEEPSEEK_API_URL='https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL='deepseek-flash';
const DEEPSEEK_IMPORT_MAX_BYTES=5*1024*1024;
const DEEPSEEK_IMPORT_MAX_ID_FILES=2;

function deepseekStatus_(){
  return {
    configurada:!!String(
      props_().getProperty(DEEPSEEK_API_KEY_PROPERTY)||''
    ).trim(),
    modelo:DEEPSEEK_MODEL,
    visao:true,
    formatos:['PDF','JPEG','PNG']
  };
}

function deepseekApiKeySave_(ctx,q){
  const key=String(q.chave||'').trim();

  if(key.length<16){
    fail_('Informe uma chave válida da API DeepSeek.');
  }

  props_().setProperty(
    DEEPSEEK_API_KEY_PROPERTY,
    key
  );

  ctx.effects.push(
    'Chave da API DeepSeek atualizada nas propriedades do script.'
  );

  return {
    configurada:true,
    modelo:DEEPSEEK_MODEL,
    mensagem:'Chave da API DeepSeek salva com segurança.'
  };
}

function deepseekApiKey_(){
  const key=String(
    props_().getProperty(DEEPSEEK_API_KEY_PROPERTY)||''
  ).trim();

  if(!key){
    fail_(
      'A chave da API DeepSeek não está configurada. '+
      'Informe DEEPSEEK_API_KEY em Administração.'
    );
  }

  return key;
}

function deepseekImportMime_(file){
  const name=String(file&&file.nome||'').trim();
  let mime=String(file&&file.mime||'').trim().toLowerCase();

  if(!mime){
    if(/\.pdf$/i.test(name))mime='application/pdf';
    else if(/\.png$/i.test(name))mime='image/png';
    else if(/\.jpe?g$/i.test(name))mime='image/jpeg';
  }

  if(mime==='image/jpg')mime='image/jpeg';

  if(
    ![
      'application/pdf',
      'image/jpeg',
      'image/png'
    ].includes(mime)
  ){
    fail_(
      'Formato não permitido para importação automática: '+
      (name||mime||'arquivo')+
      '. Use PDF, JPEG ou PNG.'
    );
  }

  return mime;
}

function deepseekImportFile_(file,label){
  if(!file||typeof file!=='object'){
    fail_('Envie '+label+'.');
  }

  const base64=String(file.base64||'').trim();

  if(!base64){
    fail_('Não foi possível ler '+label+'.');
  }

  const mime=deepseekImportMime_(file);
  let bytes;

  try{
    bytes=Utilities.base64Decode(base64);
  }catch(e){
    fail_('Arquivo inválido em '+label+'.');
  }

  if(!bytes.length){
    fail_('Arquivo vazio em '+label+'.');
  }

  if(bytes.length>DEEPSEEK_IMPORT_MAX_BYTES){
    fail_(
      label+
      ' excede o limite de 5 MB para importação automática.'
    );
  }

  return {
    nome:String(file.nome||label).slice(0,180),
    mime,
    base64,
    bytes
  };
}

function deepseekPdfOcrText_(file,label){
  let tempId='';

  try{
    const blob=Utilities.newBlob(
      file.bytes,
      file.mime,
      file.nome||label+'.pdf'
    );

    const created=Drive.Files.create(
      {
        name:'PDA OCR TEMP '+Utilities.getUuid(),
        mimeType:'application/vnd.google-apps.document'
      },
      blob,
      {
        ocrLanguage:'pt',
        fields:'id'
      }
    );

    tempId=String(created.id||'');

    if(!tempId){
      fail_('Não foi possível iniciar o OCR do PDF.');
    }

    let text='';

    for(let attempt=1;attempt<=5;attempt++){
      Utilities.sleep(
        attempt===1
          ?300
          :500
      );

      try{
        text=DocumentApp
          .openById(tempId)
          .getBody()
          .getText()
          .trim();
      }catch(e){
        text='';
      }

      if(text){
        break;
      }
    }

    if(!text){
      fail_(
        'O PDF não produziu texto legível no OCR. '+
        'Use uma foto ou imagem mais nítida do documento.'
      );
    }

    return text.slice(0,24000);

  }catch(e){
    fail_(
      'Não foi possível ler o PDF de '+
      label+
      ': '+
      (e.message||String(e))
    );

  }finally{
    if(tempId){
      try{
        DriveApp
          .getFileById(tempId)
          .setTrashed(true);
      }catch(e){}
    }
  }
}

function deepseekNormalizeText_(value){
  return String(value||'')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ')
    .toUpperCase();
}

function deepseekSafeString_(value,max){
  return String(value||'')
    .replace(/[\u0000-\u001f\u007f]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,max||300);
}

function deepseekValidDateOrBlank_(value,label,alerts){
  const s=deepseekSafeString_(value,20);

  if(!s)return '';

  try{
    const d=date_(s);

    if(label==='nascimento'){
      const min=date_('01/01/1910');
      const max=today_();

      if(d<min||d>max){
        throw new Error('fora do intervalo permitido');
      }
    }

    return s;
  }catch(e){
    alerts.push(
      'A data extraída para '+
      label+
      ' não pôde ser validada e não foi preenchida.'
    );
    return '';
  }
}

function deepseekMunicipio_(value,alerts){
  const original=deepseekSafeString_(value,120);

  if(!original)return '';

  const target=deepseekNormalizeText_(original);

  const match=cfg_().municipios.find(
    item=>
      deepseekNormalizeText_(item)===target
  );

  if(match)return match;

  alerts.push(
    'O município extraído ('+
    original+
    ') não consta na lista do sistema e deverá ser conferido manualmente.'
  );

  return '';
}

function deepseekSplitLogradouro_(logradouro,tipoVia,via){
  const tipos=[
    'Loteamento',
    'Servidão',
    'Travessa',
    'Avenida',
    'Estrada',
    'Rodovia',
    'Alameda',
    'Praça',
    'Beco',
    'Vila',
    'Linha',
    'Acesso',
    'Rua'
  ];

  let tipo=deepseekSafeString_(tipoVia,40);
  let nome=deepseekSafeString_(via,180);
  const completo=deepseekSafeString_(logradouro,220);

  const matchedTipo=tipos.find(
    item=>
      deepseekNormalizeText_(item)===
      deepseekNormalizeText_(tipo)
  );

  tipo=matchedTipo||'';

  if(!nome&&completo){
    const normalized=
      deepseekNormalizeText_(completo);

    const found=tipos.find(item=>
      normalized===deepseekNormalizeText_(item)||
      normalized.startsWith(
        deepseekNormalizeText_(item)+' '
      )
    );

    if(found){
      tipo=tipo||found;
      nome=completo
        .slice(found.length)
        .trim();
    }else{
      nome=completo;
    }
  }

  return {
    tipoVia:tipo,
    via:nome
  };
}

function deepseekImportNormalize_(raw){
  const alerts=Array.isArray(raw&&raw.alertas)
    ?raw.alertas.map(v=>deepseekSafeString_(v,260)).filter(Boolean)
    :[];

  const id=raw&&raw.identidade||{};
  const res=raw&&raw.residencia||{};

  let cpf='';

  if(id.cpf){
    try{
      cpf=cpf_(id.cpf);
    }catch(e){
      alerts.push(
        'O CPF identificado no documento não passou pela validação matemática e não foi preenchido.'
      );
    }
  }

  const nascimento=
    deepseekValidDateOrBlank_(
      id.nascimento,
      'nascimento',
      alerts
    );

  let cep='';

  if(res.cep){
    try{
      cep=cep_(res.cep);
    }catch(e){
      alerts.push(
        'O CEP identificado no comprovante não é válido e não foi preenchido.'
      );
    }
  }

  let enderecoApi=null;

  if(cep){
    try{
      enderecoApi=
        cepConsultaViaCep_({
          cep
        });
    }catch(e){
      alerts.push(
        'O CEP foi lido, mas a consulta de endereço não pôde ser concluída automaticamente.'
      );
    }
  }

  const aiStreet=
    deepseekSplitLogradouro_(
      res.logradouroCompleto,
      res.tipoVia,
      res.via
    );

  const apiStreet=
    enderecoApi
      ?deepseekSplitLogradouro_(
        enderecoApi.logradouro,
        '',
        ''
      )
      :{
        tipoVia:'',
        via:''
      };

  const cidade=
    deepseekMunicipio_(
      enderecoApi&&enderecoApi.cidade
        ?enderecoApi.cidade
        :res.cidade,
      alerts
    );

  const uf=
    deepseekSafeString_(
      enderecoApi&&enderecoApi.uf
        ?enderecoApi.uf
        :res.uf,
      2
    ).toUpperCase();

  const nome=
    deepseekSafeString_(
      id.nome,
      200
    );

  const titular=
    deepseekSafeString_(
      res.titular,
      200
    );

  const terceiroSugerido=
    !!(
      nome&&
      titular&&
      deepseekNormalizeText_(nome)!==
      deepseekNormalizeText_(titular)
    );

  if(terceiroSugerido){
    alerts.push(
      'O titular do comprovante de residência parece ser diferente da pessoa identificada. Confira a regra de comprovante em nome de terceiro.'
    );
  }

  let analfabeto='';

  const explicit=
    deepseekSafeString_(
      id.analfabeto,
      10
    ).toUpperCase();

  if(explicit==='SIM'||explicit==='NAO'){
    analfabeto=explicit;
  }

  return {
    identidade:{
      nome,
      cpf,
      nascimento,
      tipoDocumento:deepseekSafeString_(id.tipoDocumento,60),
      numeroDocumento:deepseekSafeString_(id.numeroDocumento,80),
      orgaoExpedidor:deepseekSafeString_(id.orgaoExpedidor,80),
      ufDocumento:deepseekSafeString_(id.ufDocumento,2).toUpperCase(),
      analfabeto
    },
    residencia:{
      titular,
      cep,
      tipoVia:
        apiStreet.tipoVia||
        aiStreet.tipoVia,
      via:
        apiStreet.via||
        aiStreet.via,
      numero:deepseekSafeString_(res.numero,30),
      complemento:deepseekSafeString_(res.complemento,120),
      bairro:
        deepseekSafeString_(
          enderecoApi&&enderecoApi.bairro
            ?enderecoApi.bairro
            :res.bairro,
          150
        ),
      cidade,
      uf,
      dataDocumento:
        deepseekValidDateOrBlank_(
          res.dataDocumento,
          'data do comprovante',
          alerts
        ),
      vencimento:
        deepseekValidDateOrBlank_(
          res.vencimento,
          'vencimento do comprovante',
          alerts
        ),
      terceiroSugerido,
      fonteCep:
        enderecoApi
          ?enderecoApi.fonte
          :''
    },
    alertas:[...new Set(alerts)]
  };
}

function deepseekPrompt_(){
  return [
    'Analise os documentos brasileiros fornecidos e extraia apenas informações que estejam efetivamente visíveis.',
    'Não invente, não complete por conhecimento externo e não estime dados ausentes.',
    'Se um campo não estiver legível ou não existir, devolva string vazia.',
    'No documento de identidade, procure nome completo, CPF e data de nascimento.',
    'No comprovante de residência, procure titular, CEP, logradouro, número, complemento, bairro, município, UF, data do documento e vencimento.',
    'Para analfabeto, use SIM somente se houver indicação explícita de não alfabetizado/analfabeto; use NAO somente se houver evidência explícita; caso contrário use string vazia.',
    'Datas devem ser DD/MM/AAAA quando legíveis.',
    'Retorne exclusivamente JSON válido no seguinte formato:',
    JSON.stringify({
      identidade:{
        nome:'',
        cpf:'',
        nascimento:'',
        tipoDocumento:'',
        numeroDocumento:'',
        orgaoExpedidor:'',
        ufDocumento:'',
        analfabeto:''
      },
      residencia:{
        titular:'',
        cep:'',
        logradouroCompleto:'',
        tipoVia:'',
        via:'',
        numero:'',
        complemento:'',
        bairro:'',
        cidade:'',
        uf:'',
        dataDocumento:'',
        vencimento:''
      },
      alertas:[]
    })
  ].join('\n');
}

function deepseekContentParts_(identidade,residencia,context){
  context=context||{};
  context.identidadeOcr=context.identidadeOcr||[];

  const parts=[
    {
      type:'text',
      text:deepseekPrompt_()
    }
  ];

  const addFile=(file,label)=>{
    if(!file){
      return;
    }

    parts.push({
      type:'text',
      text:'DOCUMENTO: '+label+' — '+file.nome
    });

    if(file.mime==='application/pdf'){
      const ocrText=
        deepseekPdfOcrText_(
          file,
          label
        );

      if(label==='IDENTIDADE / CPF'){
        context.identidadeOcr.push(
          ocrText
        );
      }

      parts.push({
        type:'text',
        text:
          'TEXTO OCR DO PDF '+label+':\n'+
          ocrText
      });

    }else{
      parts.push({
        type:'image_url',
        image_url:{
          url:
            'data:'+
            file.mime+
            ';base64,'+
            file.base64,
          detail:'original'
        }
      });
    }
  };

  (identidade||[]).forEach(
    file=>addFile(
      file,
      'IDENTIDADE / CPF'
    )
  );

  if(residencia){
    addFile(
      residencia,
      'COMPROVANTE DE RESIDÊNCIA'
    );
  }

  return parts;
}

function deepseekCpfFromText_(text){
  const source=
    String(text||'')
      .replace(/\u00a0/g,' ');

  const candidates=[];
  const patterns=[
    /(?:\d[\s.\-]*){11}/g,
    /\b\d{11}\b/g
  ];

  patterns.forEach(pattern=>{
    const matches=
      source.match(pattern)||
      [];

    matches.forEach(match=>{
      const digits=
        String(match||'')
          .replace(/\D/g,'');

      if(digits.length===11){
        candidates.push(digits);
      }
    });
  });

  for(const candidate of [...new Set(candidates)]){
    try{
      return cpf_(candidate);
    }catch(e){}
  }

  return '';
}

function deepseekCpfFromTexts_(texts){
  for(const text of texts||[]){
    const cpf=
      deepseekCpfFromText_(
        text
      );

    if(cpf){
      return cpf;
    }
  }

  return '';
}

function deepseekFocusedIdentityParts_(identidade,context){
  const parts=[
    {
      type:'text',
      text:[
        'Faça uma segunda leitura rápida e estritamente focada no documento de identidade brasileiro.',
        'Extraia SOMENTE: nome completo, CPF e data de nascimento.',
        'Não extraia RG, número do documento, órgão expedidor, endereço ou qualquer outro campo.',
        'Procure CPF mesmo quando os 11 dígitos estiverem separados por espaços, pontos ou traços.',
        'Não invente nem complete caracteres ilegíveis.',
        'A data deve ser DD/MM/AAAA quando legível.',
        'Retorne exclusivamente JSON válido neste formato:',
        JSON.stringify({
          nome:'',
          cpf:'',
          nascimento:''
        })
      ].join('\n')
    }
  ];

  let pdfIndex=0;

  (identidade||[]).forEach(file=>{
    parts.push({
      type:'text',
      text:
        'DOCUMENTO DE IDENTIDADE — '+
        file.nome
    });

    if(file.mime==='application/pdf'){
      const text=
        context&&
        context.identidadeOcr&&
        context.identidadeOcr[pdfIndex]
          ?context.identidadeOcr[pdfIndex]
          :'';

      pdfIndex++;

      if(text){
        parts.push({
          type:'text',
          text:
            'TEXTO OCR JÁ OBTIDO:\n'+
            text.slice(0,12000)
        });
      }
    }else{
      parts.push({
        type:'image_url',
        image_url:{
          url:
            'data:'+
            file.mime+
            ';base64,'+
            file.base64,
          detail:'original'
        }
      });
    }
  });

  return parts;
}

function deepseekFocusedIdentityRequest_(parts){
  const key=deepseekApiKey_();

  const response=
    UrlFetchApp.fetch(
      DEEPSEEK_API_URL,
      {
        method:'post',
        contentType:'application/json',
        headers:{
          Authorization:'Bearer '+key,
          Accept:'application/json'
        },
        payload:
          JSON.stringify({
            model:DEEPSEEK_MODEL,
            messages:[
              {
                role:'user',
                content:parts
              }
            ],
            response_format:{
              type:'json_object'
            },
            thinking:{
              type:'disabled'
            },
            temperature:0,
            max_tokens:320,
            stream:false
          }),
        muteHttpExceptions:true,
        followRedirects:true
      }
    );

  const code=
    response.getResponseCode();

  if(code<200||code>=300){
    return {
      raw:{},
      usage:{},
      ok:false
    };
  }

  try{
    const data=
      JSON.parse(
        response.getContentText()||
        '{}'
      );

    const content=
      data&&
      data.choices&&
      data.choices[0]&&
      data.choices[0].message
        ?String(
            data.choices[0].message.content||
            ''
          )
        :'';

    return {
      raw:
        content
          ?JSON.parse(content)
          :{},
      usage:data.usage||{},
      ok:!!content
    };
  }catch(e){
    return {
      raw:{},
      usage:{},
      ok:false
    };
  }
}

function deepseekMergeIdentityFallback_(raw,focused,cpfDeterministic){
  const base=
    Object.assign(
      {},
      raw||{}
    );

  base.identidade=
    Object.assign(
      {},
      base.identidade||{}
    );

  const target=
    base.identidade;

  const fallback=
    focused||{};

  if(!target.nome&&fallback.nome){
    target.nome=fallback.nome;
  }

  if(!target.cpf){
    target.cpf=
      cpfDeterministic||
      fallback.cpf||
      '';
  }

  if(!target.nascimento&&fallback.nascimento){
    target.nascimento=
      fallback.nascimento;
  }

  if(
    Array.isArray(base.alertas)&&
    (
      target.nome||
      target.cpf||
      target.nascimento
    )
  ){
    base.alertas=
      base.alertas.filter(item=>
        !/documento de identidade não contém nome, cpf ou data de nascimento legíveis/i.test(
          String(item||'')
        )
      );
  }

  return base;
}

function deepseekIdentityMissing_(normalized){
  const id=
    normalized&&
    normalized.identidade||
    {};

  return (
    !id.nome||
    !id.cpf||
    !id.nascimento
  );
}

function deepseekRequest_(parts){
  const key=deepseekApiKey_();

  const payload={
    model:DEEPSEEK_MODEL,
    messages:[
      {
        role:'user',
        content:parts
      }
    ],
    response_format:{
      type:'json_object'
    },
    thinking:{
      type:'disabled'
    },
    temperature:0,
    max_tokens:1600,
    stream:false
  };

  let lastError='';

  for(let attempt=1;attempt<=2;attempt++){
    let response;

    try{
      response=UrlFetchApp.fetch(
        DEEPSEEK_API_URL,
        {
          method:'post',
          contentType:'application/json',
          headers:{
            Authorization:'Bearer '+key,
            Accept:'application/json'
          },
          payload:JSON.stringify(payload),
          muteHttpExceptions:true,
          followRedirects:true
        }
      );
    }catch(e){
      lastError=e.message||String(e);

      if(attempt<2){
        Utilities.sleep(700);
        continue;
      }

      fail_(
        'Falha de comunicação com a API DeepSeek: '+
        lastError
      );
    }

    const code=response.getResponseCode();
    const text=response.getContentText();

    if(code===401||code===403){
      fail_(
        'A API DeepSeek recusou a autenticação. Confira DEEPSEEK_API_KEY em Administração.'
      );
    }

    if(code===402){
      fail_(
        'A conta DeepSeek está sem saldo suficiente para processar os documentos.'
      );
    }

    if(
      (code===429||code>=500)&&
      attempt<2
    ){
      Utilities.sleep(900);
      continue;
    }

    if(code<200||code>=300){
      let message='';

      try{
        const error=JSON.parse(text||'{}');
        message=
          error&&error.error&&error.error.message
            ?String(error.error.message)
            :'';
      }catch(e){}

      fail_(
        'A API DeepSeek não pôde processar os documentos. HTTP '+
        code+
        (message?': '+message:'')+
        '.'
      );
    }

    let data;

    try{
      data=JSON.parse(text||'{}');
    }catch(e){
      fail_('A API DeepSeek retornou uma resposta inválida.');
    }

    const content=
      data&&
      data.choices&&
      data.choices[0]&&
      data.choices[0].message
        ?String(data.choices[0].message.content||'')
        :'';

    if(!content.trim()){
      if(attempt<2){
        Utilities.sleep(650);
        continue;
      }

      fail_('A API DeepSeek não retornou dados para os documentos.');
    }

    let result;

    try{
      result=JSON.parse(content);
    }catch(e){
      fail_('A API DeepSeek retornou JSON que não pôde ser interpretado.');
    }

    return {
      raw:result,
      usage:data.usage||{}
    };
  }

  fail_(
    'Não foi possível concluir a leitura automática dos documentos.'
  );
}

function deepseekDocumentImport_(q){
  const identidadeInput=
    Array.isArray(q&&q.identidade)
      ?q.identidade
      :[];

  if(
    identidadeInput.length>
    DEEPSEEK_IMPORT_MAX_ID_FILES
  ){
    fail_(
      'Envie no máximo 2 arquivos do documento de identidade.'
    );
  }

  const hasIdentity=
    identidadeInput.length>0;

  const hasResidence=
    !!(
      q&&
      q.residencia&&
      q.residencia.base64
    );

  if(
    !hasIdentity&&
    !hasResidence
  ){
    fail_(
      'Envie pelo menos um documento: identidade/CPF ou comprovante de residência.'
    );
  }

  const identidade=
    hasIdentity
      ?identidadeInput.map(
          (file,index)=>
            deepseekImportFile_(
              file,
              'documento de identidade '+(index+1)
            )
        )
      :[];

  const residencia=
    hasResidence
      ?deepseekImportFile_(
          q.residencia,
          'comprovante de residência'
        )
      :null;

  const importContext={
    identidadeOcr:[]
  };

  const request=
    deepseekRequest_(
      deepseekContentParts_(
        identidade,
        residencia,
        importContext
      )
    );

  let mergedRaw=
    request.raw;

  let normalized=
    deepseekImportNormalize_(
      mergedRaw
    );

  let focusedUsage={};
  let fallbackUsed=false;
  let deterministicCpf='';

  if(
    hasIdentity&&
    deepseekIdentityMissing_(
      normalized
    )
  ){
    deterministicCpf=
      deepseekCpfFromTexts_(
        importContext.identidadeOcr
      );

    if(
      !normalized.identidade.cpf&&
      deterministicCpf
    ){
      mergedRaw=
        deepseekMergeIdentityFallback_(
          mergedRaw,
          {},
          deterministicCpf
        );

      normalized=
        deepseekImportNormalize_(
          mergedRaw
        );
    }

    if(
      deepseekIdentityMissing_(
        normalized
      )
    ){
      const focused=
        deepseekFocusedIdentityRequest_(
          deepseekFocusedIdentityParts_(
            identidade,
            importContext
          )
        );

      focusedUsage=
        focused.usage||
        {};

      if(
        focused.ok&&
        focused.raw
      ){
        mergedRaw=
          deepseekMergeIdentityFallback_(
            mergedRaw,
            focused.raw,
            deterministicCpf
          );

        normalized=
          deepseekImportNormalize_(
            mergedRaw
          );

        fallbackUsed=true;
      }
    }
  }

  return Object.assign(
    {},
    normalized,
    {
      documentosProcessados:{
        identidade:hasIdentity,
        residencia:hasResidence
      },
      modelo:DEEPSEEK_MODEL,
      leituraReforcada:fallbackUsed,
      uso:{
        inputTokens:
          Number(request.usage.prompt_tokens||0)+
          Number(focusedUsage.prompt_tokens||0),
        outputTokens:
          Number(request.usage.completion_tokens||0)+
          Number(focusedUsage.completion_tokens||0),
        totalTokens:
          Number(request.usage.total_tokens||0)+
          Number(focusedUsage.total_tokens||0)
      },
      aviso:
        fallbackUsed
          ?'Foi necessária uma segunda leitura rápida da identidade. Confira os dados antes do salvamento.'
          :'Os dados foram extraídos automaticamente e devem ser conferidos antes do salvamento.'
    }
  );
}
