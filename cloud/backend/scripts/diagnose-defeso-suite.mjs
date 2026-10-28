// Ensaios de contrato da API da CGU. Nenhum identificador individual, nome ou chave e impresso.
import {getSecret,SECRET_IDS} from '../src/secrets.mjs';
const KEY=await getSecret(SECRET_IDS.portal,{required:true,label:'API CGU'});
const BASE='https://api.portaldatransparencia.gov.br/api-de-dados/';
const outputs=[];
const digits=x=>String(x||'').replace(/\D/g,'');
async function call(route,query,auth=true){
  const u=new URL(route,BASE);
  for(const [k,v] of Object.entries(query))u.searchParams.set(k,String(v));
  const started=Date.now();
  try{
    const res=await fetch(u,{headers:auth?{'chave-api-dados':KEY,accept:'application/json'}:{accept:'application/json'},signal:AbortSignal.timeout(20000)});
    const body=await res.text();
    let parsed=null;
    try{parsed=JSON.parse(body);}catch{}
    return {status:res.status,ms:Date.now()-started,kind:Array.isArray(parsed)?'array':typeof parsed,rows:Array.isArray(parsed)?parsed:[],contentType:res.headers.get('content-type')};
  }catch(e){return {status:'NETWORK_FAILURE',reason:e.cause?.code||e.name,ms:Date.now()-started,kind:'none',rows:[]};}
}
function schema(rows,month){
  const r=rows[0]||{},p=r.pessoaSeguroDefeso||{},m=r.municipio||{};
  const dates=rows.map(x=>String(x.dataMesReferencia||''));
  const format=dates[0]?.replace(/[0-9]/g,'D')||'NONE';
  const firstDates=dates.slice(0,5).map(x=>x.slice(0,7));
  const monthMatches=dates.filter(x=>x.replace(/\D/g,'').startsWith(month)).length;
  return {
    keys:Object.keys(r).sort(),personKeys:Object.keys(p).sort(),municipioKeys:Object.keys(m).sort(),
    datePattern:format,firstDatePrefixes:firstDates,monthMatches,
    namesNonempty:rows.filter(x=>!!x.pessoaSeguroDefeso?.nome).length,
    nisPresent:rows.filter(x=>/^\d{11}$/.test(digits(x.pessoaSeguroDefeso?.nis))).length,
    cpfMaskedPresent:rows.filter(x=>!!x.pessoaSeguroDefeso?.cpfFormatado).length,
    numericValues:rows.filter(x=>Number.isFinite(Number(x.valor))).length,
    sampleValueType:typeof r.valor,
    idPresent:rows.filter(x=>x.id!==undefined&&x.id!==null).length
  };
}
async function municipal(city,id,month,pages=[1,2]){
  const results=[];
  for(const page of pages){
    const r=await call('seguro-defeso-beneficiario-por-municipio',{mesAno:month,codigoIbge:id,pagina:page});
    results.push({route:'municipal',city,month,page,http:r.status,ms:r.ms,rows:r.rows.length,
      ...(page===1?{schema:schema(r.rows,month)}:{})});
    if(page===1)results[results.length-1].rawRecords=r.rows;
    if(r.status!==200)break;
  }
  const raw=results[0]?.rawRecords||[];
  delete results[0]?.rawRecords;
  return {results,raw};
}
const sets=[
  ['Pelotas','4314407','202501',[1,2,35,36]],
  ['Pelotas','4314407','202506',[1,2]],
  ['Pelotas','4314407','202509',[1,2]],
  ['Belo Horizonte','3106200','202501',[1,2]]
];
let validNis='';
for(const [city,id,month,pages] of sets){
  const {results,raw}=await municipal(city,id,month,pages);
  outputs.push(...results);
  if(!validNis){
    const match=raw.find(x=>/^\d{11}$/.test(digits(x.pessoaSeguroDefeso?.nis)));
    if(match)validNis=digits(match.pessoaSeguroDefeso.nis);
  }
}
if(validNis){
  const first=await call('seguro-defeso-codigo',{codigo:validNis,pagina:1});
  const second=await call('seguro-defeso-codigo',{codigo:validNis,pagina:2});
  outputs.push({route:'nis-control-p1',http:first.status,ms:first.ms,rows:first.rows.length,
    sameNis:first.rows.filter(x=>digits(x.pessoaSeguroDefeso?.nis)===validNis).length,
    schema:schema(first.rows,'')});
  outputs.push({route:'nis-control-p2',http:second.status,ms:second.ms,rows:second.rows.length,
    sameNis:second.rows.filter(x=>digits(x.pessoaSeguroDefeso?.nis)===validNis).length});
}else outputs.push({route:'nis-control',error:'no-valid-nis'});
const missing=await call('seguro-defeso-codigo',{codigo:'00000000000',pagina:1});
outputs.push({route:'unknown-code',http:missing.status,ms:missing.ms,rows:missing.rows.length,kind:missing.kind});
const unauthed=await call('seguro-defeso-codigo',{codigo:'00000000000',pagina:1},false);
outputs.push({route:'without-key',http:unauthed.status,ms:unauthed.ms,kind:unauthed.kind});
const aggregate=await call('seguro-defeso-por-municipio',{mesAno:'202501',codigoIbge:'4314407',pagina:1});
outputs.push({route:'municipal-aggregate',http:aggregate.status,ms:aggregate.ms,rows:aggregate.rows.length,kind:aggregate.kind});
console.log('DEFESO_CONTRACT_SUITE='+JSON.stringify(outputs));
