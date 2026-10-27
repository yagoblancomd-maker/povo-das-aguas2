import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const text=await fs.readFile(new URL('../src/actions.mjs',import.meta.url),'utf8');
const between=(start,end)=>{
  const a=text.indexOf(start);
  const b=text.indexOf(end,a+start.length);
  if(a<0||b<0)throw Error('Bloco ausente: '+start);
  return text.slice(a,b);
};
const code=[
  between('function seguroDefesoPeriodo(q){','\nfunction seguroDefesoFlat'),
  between('function seguroDefesoFlat(row){','\nfunction defesoNormalizeName'),
  between('async function seguroDefeso(q){','\nasync function generateSeguroReportAction')
].join('\n');

const sample=(date='2025-03-01',id=1)=>({
  id,pessoaSeguroDefeso:{nome:'Beneficiario Teste',nis:'00000000000'},
  municipio:{nomeIBGE:'Pelotas',uf:{sigla:'RS'}},
  dataMesReferencia:date,valor:1518,parcela:'1'
});
const test=async(pages,q={codigo:'00000000000'},expectError=null,tracked=[])=>{
  let page=0;
  const context={
    required(v,k){if(!v)throw Error('Ausente: '+k);},
    httpError(statusCode,message){return Object.assign(new Error(message),{statusCode});},
    SECRET_IDS:{portal:'povo-portal-api-key'},
    async getSecret(){return 'mock-secret';},
    fetch:async(url)=>{tracked.push(url);return {status:200,ok:true,async json(){return pages[page++]??[];}};},
    AbortSignal, console:{info(){}},now:()=> '2026-10-27T00:00:00Z'
  };
  vm.createContext(context);
  vm.runInContext(code+'\nthis.execute=seguroDefeso;',context);
  if(expectError){
    await assert.rejects(context.execute(q),e=>e.statusCode===expectError);
    return;
  }
  const result=await context.execute(q);
  return JSON.parse(JSON.stringify(result));
};
const empty=await test([[]]);
assert.equal(empty.respostaOrigem,'LISTA_VAZIA');
assert.equal(empty.situacao,'NENHUM_REGISTRO_NA_FONTE');
assert.equal(empty.paginasConsultadas,1);
assert.equal(empty.registrosRecebidos,0);
const found=await test([[sample()],[]]);
assert.equal(found.quantidade,1);
assert.equal(found.registrosRecebidos,1);
assert.equal(found.paginasConsultadas,2);
assert.equal(found.situacao,'REGISTROS_ENCONTRADOS');
const outside=await test([[sample('2024-04-01')],[]]);
assert.equal(outside.quantidade,0);
assert.equal(outside.registrosForaPeriodo,1);
assert.equal(outside.situacao,'SEM_REGISTROS_NO_PERIODO');
await test([{unexpected:'object'}],{codigo:'00000000000'},502);
await test([[sample()]],{codigo:'00000000000',periodoInicio:'2025-01-01',periodoFim:'2026-01-01'},400);
await test([[sample()]],{codigo:'00000000000',periodoInicio:'2025-12-31',periodoFim:'2025-01-01'},400);
const requested=[];
const leadingZero=await test([[sample('2025-03-01')],[]],{codigo:'01234567890'},null,requested);
assert.equal(leadingZero.quantidade,1);
assert.equal(requested[0],'https://api.portaldatransparencia.gov.br/api-de-dados/seguro-defeso-codigo?codigo=01234567890&pagina=1');
assert.equal(requested[1],'https://api.portaldatransparencia.gov.br/api-de-dados/seguro-defeso-codigo?codigo=01234567890&pagina=2');
console.log('SEGURO_DEFESO_TESTS_OK: 8 cenarios, CPF com zero inicial preservado');
