// Diagnóstico operacional: não imprime CPF, NIS, nomes nem chave da API.
// Executar em job isolado do Cloud Run, com a identidade do serviço.
import {getSecret,SECRET_IDS} from '../src/secrets.mjs';

const key=await getSecret(SECRET_IDS.portal,{required:true,label:'API Portal da Transparência'});
const base='https://api.portaldatransparencia.gov.br/api-de-dados';
const headers={accept:'application/json','chave-api-dados':key};

async function fetchMeta(endpoint,query){
  const url=new URL(base+endpoint);
  for(const [name,value] of Object.entries(query))url.searchParams.set(name,String(value));
  try{
    const response=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});
    const raw=await response.text();
    let rows;
    try{rows=JSON.parse(raw);}catch{return {status:response.status,format:'invalid-json',count:null};}
    const format=Array.isArray(rows)?'array':typeof rows;
    return {status:response.status,format,count:Array.isArray(rows)?rows.length:null,rows:Array.isArray(rows)?rows:[]};
  }catch(error){return {status:'NETWORK_ERROR',format:String(error.cause?.code||error.name),count:null,rows:[]};}
}

const results=[];
let positive=null;
for(const m of ['202501','202503','202506','202509']){
  for(const [name,id] of [['Pelotas','4314407'],['Belo Horizonte','3106200']]){
    const r=await fetchMeta('/seguro-defeso-beneficiario-por-municipio',{mesAno:m,codigoIbge:id,pagina:1});
    results.push({route:'beneficiario-por-municipio',city:name,month:m,status:r.status,format:r.format,count:r.count});
    if(!positive&&r.rows?.length){
      const row=r.rows.find(x=>{
        const p=x.pessoaSeguroDefeso||x.beneficiario||{};
        return /^\d{11}$/.test(String(p.nis||'').replace(/\D/g,''));
      });
      if(row){
        const p=row.pessoaSeguroDefeso||row.beneficiario||{};
        positive=String(p.nis).replace(/\D/g,'');
      }
    }
  }
}
if(positive){
  const test=await fetchMeta('/seguro-defeso-codigo',{codigo:positive,pagina:1});
  results.push({route:'codigo-positive-control',status:test.status,format:test.format,count:test.count});
}else{
  results.push({route:'codigo-positive-control',status:'NOT_AVAILABLE_FROM_MUNICIPAL_ROUTE'});
}
const docExample=await fetchMeta('/seguro-defeso-codigo',{codigo:'10859427215',pagina:1});
results.push({route:'codigo-documented-example',status:docExample.status,format:docExample.format,count:docExample.count});
console.log('SEGURO_DEFESO_API_DIAGNOSTIC='+JSON.stringify(results));
if(results.some(x=>x.status===401||x.status===403||x.status===429||x.status==='NETWORK_ERROR'))process.exitCode=2;
