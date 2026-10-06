import 'dotenv/config';
import {google} from 'googleapis';
import {getPool,closeDb} from '../src/db.mjs';

const spreadsheetId=process.env.SPREADSHEET_ID;
if(!spreadsheetId)throw new Error('Defina SPREADSHEET_ID.');

const C=[
  ['id','id'],['versao','versao'],['criadoEm','criado_em'],
  ['alteradoEm','alterado_em'],['usuario','usuario_email']
];

const TABLES=[
  ['Pessoas','pessoas',[
    ['nome','nome'],['cpf','cpf'],['nascimento','nascimento'],['telefone','telefone'],
    ['tipoVia','tipo_via'],['via','via'],['numero','numero'],['complemento','complemento'],
    ['bairro','bairro'],['cidade','cidade'],['uf','uf'],['entidade','entidade'],
    ['outraEntidade','outra_entidade'],['analfabeto','analfabeto'],
    ['parcelasNaoRecebidas','parcelas_nao_recebidas'],['jurisdicao','jurisdicao'],
    ['cep','cep'],['email','email'],['criadoPor','criado_por']
  ]],
  ['Usuarios','usuarios',[
    ['email','email'],['perfil','perfil'],['ativo','ativo'],['nome','nome'],
    ['funcao','funcao'],['permissoes','permissoes'],
    ['permissoesVersao','permissoes_versao'],['senhaHash','senha_hash'],
    ['senhaSalt','senha_salt'],['senhaAlgoritmo','senha_algoritmo'],
    ['sessionVersion','session_version'],['ultimoLogin','ultimo_login'],
    ['nomeUsuario','nome_usuario'],['fotoId','foto_id'],['emailsAnteriores','emails_anteriores']
  ]],
  ['Configuracoes','configuracoes',[
    ['chave','chave'],['valor','valor']
  ]],
  ['Atendimentos','atendimentos',[
    ['pessoaId','pessoa_id'],['demanda','demanda'],['referencia','referencia'],
    ['parcelas','parcelas'],['outrosCasos','outros_casos'],['observacoes','observacoes'],
    ['responsavel','responsavel'],['situacao','situacao'],['folderId','folder_id'],
    ['revisao','revisao'],['conferencia','conferencia'],['enderecamento','enderecamento'],
    ['secaoJudiciaria','secao_judiciaria'],['valorCausa','valor_causa'],['localData','local_data']
  ]],
  ['Documentos','documentos',[
    ['atendimentoId','atendimento_id'],['categoria','categoria'],['fileId','file_id'],
    ['url','url'],['nome','nome'],['hash','hash'],['mime','mime'],['substituiId','substitui_id'],
    ['vigente','vigente'],['vencimento','vencimento'],['terceiro','terceiro'],
    ['conferido','conferido'],['declaracaoTerceiro','declaracao_terceiro'],
    ['processoCompleto','processo_completo'],['anexoPresente','anexo_presente'],
    ['rogo','rogo'],['testemunhas','testemunhas'],['observacoes','observacoes']
  ]],
  ['Pendencias','pendencias',[
    ['atendimentoId','atendimento_id'],['descricao','descricao'],
    ['responsavel','responsavel'],['situacao','situacao']
  ]],
  ['Minutas','minutas',[
    ['atendimentoId','atendimento_id'],['fileId','file_id'],['url','url'],
    ['numero','numero'],['situacao','situacao'],['snapshot','snapshot'],
    ['templateId','template_id'],['templateModified','template_modified'],
    ['revisor','revisor'],['revisadaEm','revisada_em'],
    ['pdfFileId','pdf_file_id'],['pdfUrl','pdf_url']
  ]],
  ['Historico','historico',[
    ['entidade','entidade'],['registroId','registro_id'],
    ['antes','antes'],['depois','depois'],['operacao','operacao']
  ]],
  ['Distribuicao','distribuicao',[
    ['atendimentoId','atendimento_id'],['processoId','processo_id'],
    ['numero','numero'],['juizo','juizo'],['data','data'],
    ['responsavel','responsavel'],['protocoloId','protocolo_id']
  ]],
  ['Tarefas','tarefas',[
    ['tipo','tipo'],['pessoaId','pessoa_id'],['responsavel','responsavel'],
    ['situacao','situacao'],['jurisdicao','jurisdicao'],['valorCausa','valor_causa'],
    ['atribuidaEm','atribuida_em'],['concluidaEm','concluida_em'],
    ['processoId','processo_id'],['observacoes','observacoes']
  ]],
  ['Processos','processos',[
    ['pessoaId','pessoa_id'],['atendimentoId','atendimento_id'],
    ['numero','numero'],['juizo','juizo'],['distribuidoEm','distribuido_em'],
    ['responsavel','responsavel'],['movimentacoes','movimentacoes']
  ]],
  ['Operacoes','operacoes',[
    ['hash','hash'],['resultado','resultado']
  ]]
];

const BOOL=new Set([
  'vigente','terceiro','conferido','declaracao_terceiro',
  'processo_completo','anexo_presente','rogo','testemunhas','ativo'
]);
const INT=new Set(['versao','permissoes_versao','session_version']);
const JSONCOL=new Set([
  'antes','depois','valor','permissoes','emails_anteriores',
  'movimentacoes','resultado'
]);
const TIME=new Set(['criado_em','alterado_em','ultimo_login']);

function cast(column,v){
  if(v===''||v===undefined||v===null)return null;
  if(BOOL.has(column))return v===true||String(v).toLowerCase()==='true';
  if(INT.has(column)){
    const n=Number(v);
    return Number.isFinite(n)?n:0;
  }
  if(JSONCOL.has(column)){
    try{return JSON.stringify(typeof v==='string'?JSON.parse(v):v);}
    catch{return JSON.stringify(v);}
  }
  if(TIME.has(column)){
    const d=new Date(v);
    return Number.isNaN(d.getTime())?null:d.toISOString();
  }
  return String(v);
}

async function readSheet(sheets,name){
  const r=await sheets.spreadsheets.values.get({
    spreadsheetId,
    range:`'${name}'!A:ZZ`,
    valueRenderOption:'UNFORMATTED_VALUE'
  });
  const values=r.data.values||[];
  if(!values.length)return [];
  const headers=values[0].map(String);
  return values.slice(1)
    .filter(row=>row.some(v=>v!==''&&v!==undefined))
    .map(row=>Object.fromEntries(
      headers.map((h,i)=>[h,row[i]??''])
    ));
}

async function upsert(client,sheet,table,specific,rows){
  const map=[...C,...specific];
  const columns=map.map(([,target])=>target);

  for(const row of rows){
    if(!row.id)continue;
    const vals=map.map(([source,target])=>cast(target,row[source]));
    const places=vals.map((_,i)=>'$'+(i+1));
    const updates=columns
      .filter(x=>x!=='id')
      .map(x=>`${x}=EXCLUDED.${x}`);

    await client.query(
      `INSERT INTO ${table}(${columns.join(',')})
       VALUES(${places.join(',')})
       ON CONFLICT(id) DO UPDATE SET ${updates.join(',')}`,
      vals
    );
  }

  console.log(`${sheet}: ${rows.length} linhas processadas`);
}

const auth=new google.auth.GoogleAuth({
  scopes:[
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.readonly'
  ]
});
const sheets=google.sheets({version:'v4',auth});
const pool=await getPool();
const client=await pool.connect();

try{
  await client.query('BEGIN');

  if(String(process.env.IMPORT_TRUNCATE).toLowerCase()==='true'){
    await client.query(
      `TRUNCATE historico,operacoes,distribuicao,minutas,pendencias,
        documentos,tarefas,processos,atendimentos,configuracoes,
        sessoes,recuperacoes,usuarios,pessoas CASCADE`
    );
  }

  for(const [sheet,table,map] of TABLES){
    const rows=await readSheet(sheets,sheet);
    await upsert(client,sheet,table,map,rows);
  }

  await client.query('COMMIT');
  console.log('Migração concluída com sucesso.');
}catch(e){
  await client.query('ROLLBACK');
  throw e;
}finally{
  client.release();
  await closeDb();
}
