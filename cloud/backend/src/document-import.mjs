import crypto from 'node:crypto';
import {Storage} from '@google-cloud/storage';
import vision from '@google-cloud/vision';
import {
  STORAGE_BUCKET,MAX_FILE_BYTES,JURISDICOES,httpError,validateCpf,validateDateBR
} from './core.mjs';
import {getSecret,SECRET_IDS} from './secrets.mjs';

const storage=new Storage();
const bucket=storage.bucket(STORAGE_BUCKET);
const visionClient=new vision.ImageAnnotatorClient();
const DEEPSEEK_URL='https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL='deepseek-flash';

function cleanString(v,max=300){
  return String(v??'')
    .replace(/[\u0000-\u001f\u007f]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,max);
}

function normalize(v){
  return cleanString(v,300)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toUpperCase();
}

function validateInput(file,label){
  if(!file||typeof file!=='object')throw httpError(400,'Envie '+label+'.');
  const rawMime=String(file.mime||'').toLowerCase();
  const mime=rawMime==='image/jpg'?'image/jpeg':rawMime;
  if(!['application/pdf','image/jpeg','image/png'].includes(mime)){
    throw httpError(400,'Use PDF, JPEG ou PNG em '+label+'.');
  }
  const base64=String(file.base64||'');
  if(!base64)throw httpError(400,'Arquivo vazio em '+label+'.');
  const bytes=Buffer.from(base64,'base64');
  if(!bytes.length||bytes.length>MAX_FILE_BYTES){
    throw httpError(400,label+' excede 5 MB ou está vazio.');
  }
  return {nome:cleanString(file.nome||label,180),mime,bytes};
}

async function ocrImage(file){
  const [result]=await visionClient.documentTextDetection({image:{content:file.bytes}});
  return cleanString(
    result.fullTextAnnotation?.text||
    result.textAnnotations?.[0]?.description||
    '',
    24000
  );
}

async function ocrPdf(file){
  const id=crypto.randomUUID();
  const inputName='tmp/ocr/'+id+'.pdf';
  const outputPrefix='tmp/ocr-output/'+id+'/';
  await bucket.file(inputName).save(file.bytes,{contentType:'application/pdf',resumable:false});

  try{
    const [op]=await visionClient.asyncBatchAnnotateFiles({
      requests:[{
        inputConfig:{
          gcsSource:{uri:'gs://'+STORAGE_BUCKET+'/'+inputName},
          mimeType:'application/pdf'
        },
        features:[{type:'DOCUMENT_TEXT_DETECTION'}],
        outputConfig:{
          gcsDestination:{uri:'gs://'+STORAGE_BUCKET+'/'+outputPrefix},
          batchSize:5
        }
      }]
    });

    await op.promise();
    const [files]=await bucket.getFiles({prefix:outputPrefix});
    const chunks=[];

    for(const f of files){
      const [buf]=await f.download();
      const parsed=JSON.parse(buf.toString('utf8'));
      for(const response of parsed.responses||[]){
        const text=
          response.fullTextAnnotation?.text||
          response.textAnnotations?.[0]?.description||
          '';
        if(text)chunks.push(text);
      }
    }

    return cleanString(chunks.join('\n'),24000);
  }finally{
    await bucket.file(inputName).delete({ignoreNotFound:true}).catch(()=>{});
    const [files]=await bucket.getFiles({prefix:outputPrefix}).catch(()=>[[]]);
    await Promise.all(files.map(f=>f.delete({ignoreNotFound:true}).catch(()=>{})));
  }
}

async function ocr(file){
  return file.mime==='application/pdf'?ocrPdf(file):ocrImage(file);
}

function mainPrompt(identityTexts,residenceText){
  return [
    'Analise o texto OCR dos documentos brasileiros fornecidos.',
    'Extraia apenas informações efetivamente presentes. Não invente nem estime.',
    'No documento de identidade, procure nome completo, CPF e data de nascimento.',
    'No comprovante de residência, procure titular, CEP, logradouro, número, complemento, bairro, município, UF, data do documento e vencimento.',
    'Para analfabeto, use SIM somente se houver indicação explícita; use NAO somente se houver evidência explícita; caso contrário deixe vazio.',
    'Datas devem ser DD/MM/AAAA quando legíveis.',
    'Retorne exclusivamente JSON válido com o formato:',
    JSON.stringify({
      identidade:{
        nome:'',cpf:'',nascimento:'',tipoDocumento:'',numeroDocumento:'',
        orgaoExpedidor:'',ufDocumento:'',analfabeto:''
      },
      residencia:{
        titular:'',cep:'',logradouroCompleto:'',tipoVia:'',via:'',numero:'',
        complemento:'',bairro:'',cidade:'',uf:'',dataDocumento:'',vencimento:''
      },
      alertas:[]
    }),
    ...identityTexts.map((t,i)=>'IDENTIDADE '+(i+1)+':\n'+t),
    residenceText?'COMPROVANTE DE RESIDÊNCIA:\n'+residenceText:''
  ].filter(Boolean).join('\n\n');
}

async function askDeepSeek(text,maxTokens=1600,{retry=true}={}){
  const key=await getSecret(SECRET_IDS.deepseek,{required:true,label:'API DeepSeek'});
  const attempts=retry?2:1;
  let last='';

  for(let attempt=1;attempt<=attempts;attempt++){
    let response;
    try{
      response=await fetch(DEEPSEEK_URL,{
        method:'POST',
        headers:{
          Authorization:'Bearer '+key,
          'Content-Type':'application/json',
          Accept:'application/json'
        },
        body:JSON.stringify({
          model:DEEPSEEK_MODEL,
          messages:[{role:'user',content:text}],
          response_format:{type:'json_object'},
          thinking:{type:'disabled'},
          temperature:0,
          max_tokens:maxTokens,
          stream:false
        })
      });
    }catch(e){
      last=e.message||String(e);
      if(attempt<attempts)continue;
      throw httpError(502,'Falha de comunicação com a API DeepSeek: '+last);
    }

    const body=await response.text();

    if(response.status===401||response.status===403){
      throw httpError(502,'A API DeepSeek recusou a autenticação. Confira a chave em Administração.');
    }
    if(response.status===402){
      throw httpError(402,'A conta DeepSeek está sem saldo suficiente.');
    }
    if((response.status===429||response.status>=500)&&attempt<attempts)continue;
    if(!response.ok){
      let msg='';
      try{msg=JSON.parse(body)?.error?.message||'';}catch{}
      throw httpError(
        502,
        'A API DeepSeek não pôde processar os documentos. HTTP '+
        response.status+
        (msg?': '+msg:'')+
        '.'
      );
    }

    let data;
    try{data=JSON.parse(body);}
    catch{throw httpError(502,'A API DeepSeek retornou resposta inválida.');}

    const answer=String(data?.choices?.[0]?.message?.content||'').trim();
    if(!answer){
      if(attempt<attempts)continue;
      throw httpError(502,'A API DeepSeek não retornou dados.');
    }

    try{
      return {raw:JSON.parse(answer),usage:data.usage||{}};
    }catch{
      throw httpError(502,'A API DeepSeek retornou JSON inválido.');
    }
  }

  throw httpError(502,'Não foi possível concluir a leitura automática.');
}

function cpfFromText(text){
  const source=String(text||'').replace(/\u00a0/g,' ');
  const matches=[
    ...(source.match(/(?:\d[\s.\-]*){11}/g)||[]),
    ...(source.match(/\b\d{11}\b/g)||[])
  ];

  for(const match of [...new Set(matches)]){
    const candidate=String(match).replace(/\D/g,'');
    if(candidate.length!==11)continue;
    try{return validateCpf(candidate);}
    catch{}
  }
  return '';
}

function cpfFromTexts(texts){
  for(const text of texts||[]){
    const found=cpfFromText(text);
    if(found)return found;
  }
  return '';
}

function focusedPrompt(identityTexts){
  return [
    'Faça uma segunda leitura rápida e estritamente focada na identidade brasileira.',
    'Extraia SOMENTE nome completo, CPF e data de nascimento.',
    'Não extraia RG, número do documento, órgão expedidor, endereço ou qualquer outro campo.',
    'Procure CPF mesmo quando os 11 dígitos estiverem separados por espaços, pontos ou traços.',
    'Não invente nem complete caracteres ilegíveis.',
    'A data deve ser DD/MM/AAAA quando legível.',
    'Retorne exclusivamente JSON válido neste formato:',
    JSON.stringify({nome:'',cpf:'',nascimento:''}),
    ...identityTexts.map((text,i)=>'IDENTIDADE '+(i+1)+':\n'+String(text).slice(0,12000))
  ].join('\n\n');
}

function splitStreet(full,type,via){
  const types=[
    'Loteamento','Servidão','Travessa','Avenida','Estrada','Rodovia',
    'Alameda','Praça','Beco','Vila','Linha','Acesso','Rua'
  ];

  let t=cleanString(type,40);
  let v=cleanString(via,180);
  const f=cleanString(full,220);
  const exact=types.find(x=>normalize(x)===normalize(t));
  t=exact||'';

  if(!v&&f){
    const found=types.find(x=>
      normalize(f)===normalize(x)||
      normalize(f).startsWith(normalize(x)+' ')
    );

    if(found){
      t=t||found;
      v=f.slice(found.length).trim();
    }else{
      v=f;
    }
  }

  return {tipoVia:t,via:v};
}

function knownCity(value,alerts){
  const original=cleanString(value,120);
  if(!original)return '';
  const cities=Object.values(JURISDICOES).flat();
  const found=cities.find(x=>normalize(x)===normalize(original));
  if(found)return found;

  alerts.push(
    'O município extraído ('+original+
    ') não consta na lista do sistema e deverá ser conferido manualmente.'
  );
  return '';
}

async function normalizeResult(raw){
  const alerts=Array.isArray(raw?.alertas)
    ?raw.alertas.map(x=>cleanString(x,260)).filter(Boolean)
    :[];

  const identity=raw?.identidade||{};
  const res=raw?.residencia||{};

  let cpf='';
  if(identity.cpf){
    try{cpf=validateCpf(identity.cpf);}
    catch{alerts.push('O CPF identificado não passou na validação matemática.');}
  }

  let nascimento=cleanString(identity.nascimento,20);
  if(nascimento){
    try{validateDateBR(nascimento);}
    catch{
      alerts.push('A data de nascimento extraída é inválida.');
      nascimento='';
    }
  }

  let cep=String(res.cep||'').replace(/\D/g,'');
  if(cep&&!/^\d{8}$/.test(cep)){
    alerts.push('O CEP identificado é inválido.');
    cep='';
  }

  let api=null;
  if(cep){
    try{
      const response=await fetch('https://viacep.com.br/ws/'+cep+'/json/');
      const body=await response.json();
      if(!body.erro)api=body;
    }catch{}
  }

  const ai=splitStreet(res.logradouroCompleto,res.tipoVia,res.via);
  const apiStreet=api?splitStreet(api.logradouro,'',''):{tipoVia:'',via:''};
  const city=knownCity(api?.localidade||res.cidade,alerts);

  let analfabeto=normalize(identity.analfabeto);
  analfabeto=analfabeto==='SIM'?'SIM':analfabeto==='NAO'?'NAO':'';

  return {
    identidade:{
      nome:cleanString(identity.nome,200),
      cpf,
      nascimento,
      analfabeto,
      tipoDocumento:cleanString(identity.tipoDocumento,80),
      numeroDocumento:cleanString(identity.numeroDocumento,80),
      orgaoExpedidor:cleanString(identity.orgaoExpedidor,80),
      ufDocumento:cleanString(identity.ufDocumento,2)
    },
    residencia:{
      titular:cleanString(res.titular,200),
      cep,
      tipoVia:apiStreet.tipoVia||ai.tipoVia,
      via:apiStreet.via||ai.via,
      numero:cleanString(res.numero,30),
      complemento:cleanString(res.complemento,100),
      bairro:cleanString(api?.bairro||res.bairro,120),
      cidade:city,
      uf:cleanString(api?.uf||res.uf,2).toUpperCase(),
      dataDocumento:cleanString(res.dataDocumento,20),
      vencimento:cleanString(res.vencimento,20),
      fonteCep:api?'ViaCEP':''
    },
    alertas:[...new Set(alerts)]
  };
}

function missingIdentity(result){
  const id=result?.identidade||{};
  return !id.nome||!id.cpf||!id.nascimento;
}

function mergeFocused(raw,focused,deterministicCpf,normalized){
  const merged={
    ...(raw||{}),
    identidade:{...((raw||{}).identidade||{})}
  };

  const target=merged.identidade;
  const current=normalized?.identidade||{};
  const fallback=focused||{};

  if(!current.nome&&fallback.nome)target.nome=fallback.nome;
  if(!current.cpf)target.cpf=deterministicCpf||fallback.cpf||target.cpf||'';
  if(!current.nascimento&&fallback.nascimento)target.nascimento=fallback.nascimento;

  if(Array.isArray(merged.alertas)&&(target.nome||target.cpf||target.nascimento)){
    merged.alertas=merged.alertas.filter(item=>
      !/documento de identidade não contém nome, cpf ou data de nascimento legíveis/i.test(
        String(item||'')
      )
    );
  }

  return merged;
}

export async function importDocuments(q){
  const inputs=Array.isArray(q?.identidade)?q.identidade:[];
  const hasIdentity=inputs.length>0;
  const hasResidence=!!q?.residencia;

  if(!hasIdentity&&!hasResidence){
    throw httpError(
      400,
      'Selecione ao menos um documento: identidade/CPF ou comprovante de residência.'
    );
  }

  if(inputs.length>2){
    throw httpError(400,'Envie no máximo dois arquivos de identidade.');
  }

  const identity=inputs.map((file,i)=>
    validateInput(file,'documento de identidade '+(i+1))
  );

  const residence=hasResidence
    ?validateInput(q.residencia,'comprovante de residência')
    :null;

  const identityTexts=[];
  for(const file of identity){
    identityTexts.push(await ocr(file));
  }

  const residenceText=residence?await ocr(residence):'';

  const answer=await askDeepSeek(
    mainPrompt(identityTexts,residenceText),
    1600,
    {retry:true}
  );

  let raw=answer.raw;
  let result=await normalizeResult(raw);
  let deterministicCpf='';
  let focusedUsage={};
  let reinforced=false;

  if(hasIdentity&&missingIdentity(result)){
    deterministicCpf=cpfFromTexts(identityTexts);

    if(!result.identidade.cpf&&deterministicCpf){
      raw=mergeFocused(raw,{},deterministicCpf,result);
      result=await normalizeResult(raw);
    }

    if(missingIdentity(result)){
      try{
        const focused=await askDeepSeek(
          focusedPrompt(identityTexts),
          320,
          {retry:false}
        );

        focusedUsage=focused.usage||{};
        raw=mergeFocused(
          raw,
          focused.raw,
          deterministicCpf,
          result
        );
        result=await normalizeResult(raw);
        reinforced=true;
      }catch{
        // A leitura principal continua válida; fallback rápido não bloqueia o cadastro.
      }
    }
  }

  const usage={
    prompt_tokens:
      Number(answer.usage?.prompt_tokens||0)+
      Number(focusedUsage.prompt_tokens||0),
    completion_tokens:
      Number(answer.usage?.completion_tokens||0)+
      Number(focusedUsage.completion_tokens||0),
    total_tokens:
      Number(answer.usage?.total_tokens||0)+
      Number(focusedUsage.total_tokens||0)
  };

  return {
    ...result,
    documentosProcessados:{
      identidade:hasIdentity,
      residencia:hasResidence
    },
    leituraReforcada:reinforced,
    aviso:reinforced
      ?'Foi necessária uma segunda leitura rápida da identidade. Confira os dados antes do salvamento.'
      :'Os dados foram extraídos automaticamente e devem ser conferidos antes do salvamento.',
    meta:{
      modelo:DEEPSEEK_MODEL,
      uso:usage,
      ocr:'Google Cloud Vision'
    }
  };
}
