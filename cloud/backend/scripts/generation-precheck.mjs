import {all} from '../src/core.mjs';
import {permissions} from '../src/access.mjs';
import {executeAction} from '../src/actions.mjs';
import {closeDb} from '../src/db.mjs';

const users=(await all('Usuarios')).filter(u=>u.ativo===true||u.ativo==='true');
const admin=users.find(u=>(permissions(u)||[]).includes('administracao'))||users[0];
const creator=users.find(u=>(permissions(u)||[]).includes('cadastro'))||admin;
if(!admin||!creator)throw new Error('Nenhum usuario ativo.');

const integrations=await executeAction('adminIntegracoes',{},admin);
const people=await all('Pessoas');
const docs=await all('Documentos');
const rows=[];

for(const person of people){
  let state=null;
  let stateError='';
  try{
    state=await executeAction('pessoaCadastroEstado',{pessoaId:person.id},creator);
  }catch(error){
    stateError=error.message;
  }
  const ownDocs=docs.filter(d=>String(d.atendimentoId||'')==='PESSOA:'+person.id && (d.vigente===true||d.vigente==='true'));
  rows.push({
    id:person.id,
    nome:person.nome,
    cpf:person.cpf,
    cidade:person.cidade,
    jurisdicao:person.jurisdicao,
    parcelas:person.parcelasNaoRecebidas,
    etapa:state?.etapa||'',
    ultimoErro:state?.ultimoErro||stateError,
    documentos:ownDocs.length,
    categorias:[...new Set(ownDocs.map(d=>d.categoria))].sort()
  });
}

let defeso={attempted:false};
if(integrations.portalTransparencia?.configurada && people[0]){
  defeso.attempted=true;
  try{
    const result=await executeAction('seguroDefesoConsultar',{codigo:people[0].cpf},creator);
    defeso={
      attempted:true,
      ok:true,
      pessoa:people[0].nome,
      quantidade:result.quantidade,
      registrosRecebidos:result.registrosRecebidos,
      periodoInicio:result.periodoInicio,
      periodoFim:result.periodoFim
    };
  }catch(error){
    defeso={attempted:true,ok:false,error:error.message,status:error.statusCode||null};
  }
}

console.log('GEN_PRECHECK='+JSON.stringify({
  integracoes:integrations,
  pessoas:rows,
  defeso
}));
await closeDb();
