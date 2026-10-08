import 'dotenv/config';
import {google} from 'googleapis';
import {getPool,closeDb} from '../src/db.mjs';
import {ensureSchema} from '../src/schema.mjs';

const spreadsheetId=process.env.SPREADSHEET_ID;
if(!spreadsheetId)throw new Error('Defina SPREADSHEET_ID.');

const COMMON=[
  ['id','id'],
  ['versao','versao'],
  ['criadoEm','criado_em'],
  ['alteradoEm','alterado_em'],
  ['usuario','usuario_email']
];

const TABLES=[
  ['Pessoas','pessoas',[
    ['nome','nome'],['cpf','cpf'],['nascimento','nascimento'],['telefone','telefone'],
    ['tipoVia','tipo_via'],['via','via'],['numero','numero'],['complemento','complemento'],
    ['bairro','bairro'],['cidade','cidade'],['uf','uf'],['entidade','entidade'],
    ['outraEntidade','outra_entidade'],['analfabeto','analfabeto'],
    ['parcelasNaoRecebidas','parcelas_nao_recebidas'],['jurisdicao','jurisdicao'],
    ['cep','cep'],['email','email'],['criadoPor','criado_por'],['origemCadastro','origem_cadastro']
  ]],
  ['Usuarios','usuarios',[
    ['email','email'],['perfil','perfil'],['ativo','ativo'],['nome','nome'],
    ['funcao','funcao'],['permissoes','permissoes'],
    ['permissoesVersao','permissoes_versao'],['senhaHash','senha_hash'],
    ['senhaSalt','senha_salt'],['senhaAlgoritmo','senha_algoritmo'],
    ['sessionVersion','session_version'],['ultimoLogin','ultimo_login'],
    ['nomeUsuario','nome_usuario'],['fotoId','foto_id'],
    ['emailsAnteriores','emails_anteriores'],['entidade','entidade']
  ]],
  ['Sessoes','sessoes',[
    ['usuarioId','usuario_id'],['tokenHash','token_hash'],['expiraEm','expira_em'],
    ['sessionVersion','session_version'],['revogada','revogada']
  ]],
  ['Recuperacoes','recuperacoes',[
    ['usuarioId','usuario_id'],['tokenHash','token_hash'],['expiraEm','expira_em'],
    ['sessionVersion','session_version'],['usada','usada']
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
    ['processoId','processo_id'],['observacoes','observacoes'],
    ['titulo','titulo'],['descricao','descricao'],['criadoPor','criado_por'],
    ['prazo','prazo'],['prioridade','prioridade'],['tags','tags'],
    ['modoDistribuicao','modo_distribuicao'],['origem','origem']
  ]],
  ['TarefaMensagens','tarefa_mensagens',[
    ['tarefaId','tarefa_id'],['autor','autor'],['mensagem','mensagem']
  ]],
  ['TarefaAnexos','tarefa_anexos',[
    ['tarefaId','tarefa_id'],['fileId','file_id'],['url','url'],
    ['nome','nome'],['mime','mime'],['hash','hash'],['bytes','bytes'],
    ['enviadoPor','enviado_por'],['pessoaId','pessoa_id'],['documentoId','documento_id']
  ]],
  ['TarefaLeituras','tarefa_leituras',[
    ['usuario','usuario'],['ultimoVistoEm','ultimo_visto_em'],['tarefaId','tarefa_id']
  ]],
  ['TarefaTags','tarefa_tags',[
    ['nome','nome'],['cor','cor'],['ativo','ativo']
  ]],
  ['Processos','processos',[
    ['pessoaId','pessoa_id'],['atendimentoId','atendimento_id'],
    ['numero','numero'],['juizo','juizo'],['distribuidoEm','distribuido_em'],
    ['responsavel','responsavel'],['movimentacoes','movimentacoes'],
    ['datajudTribunal','datajud_tribunal'],['datajudGrau','datajud_grau'],
    ['datajudClasse','datajud_classe'],['datajudOrgao','datajud_orgao'],
    ['datajudSistema','datajud_sistema'],['datajudDataAjuizamento','datajud_data_ajuizamento'],
    ['datajudNivelSigilo','datajud_nivel_sigilo'],['datajudAssuntos','datajud_assuntos'],
    ['datajudTags','datajud_tags'],['datajudMarcoAtual','datajud_marco_atual'],
    ['datajudUltimaMovimentacao','datajud_ultima_movimentacao'],
    ['datajudUltimaAtualizacaoOrigem','datajud_ultima_atualizacao_origem'],
    ['datajudUltimaConsulta','datajud_ultima_consulta'],
    ['datajudStatus','datajud_status'],['datajudErro','datajud_erro']
  ]],
  ['Operacoes','operacoes',[
    ['hash','hash'],['resultado','resultado']
  ]]
];

const BOOL=new Set([
  'vigente','terceiro','conferido','declaracao_terceiro',
  'processo_completo','anexo_presente','rogo','testemunhas',
  'ativo','revogada','usada'
]);

const INT=new Set([
  'versao','permissoes_versao','session_version','bytes'
]);

const JSONCOL=new Set([
  'antes','depois','valor','permissoes','emails_anteriores',
  'movimentacoes','resultado','tags','datajud_assuntos','datajud_tags'
]);

const TIME=new Set([
  'criado_em','alterado_em','ultimo_login','expira_em',
  'atribuida_em','concluida_em','distribuido_em','ultimo_visto_em'
]);

function cast(column,value){
  if(value===''||value===undefined||value===null)return null;

  if(BOOL.has(column)){
    if(typeof value==='boolean')return value;
    return ['true','1','sim','yes'].includes(String(value).trim().toLowerCase());
  }

  if(INT.has(column)){
    const n=Number(value);
    return Number.isFinite(n)?Math.trunc(n):0;
  }

  if(JSONCOL.has(column)){
    if(typeof value==='object')return JSON.stringify(value);
    const text=String(value).trim();
    if(!text)return JSON.stringify(
      column==='tags'||column==='datajud_assuntos'||column==='datajud_tags'
        ?[]
        :{}
    );
    try{return JSON.stringify(JSON.parse(text));}
    catch{return JSON.stringify(text);}
  }

  if(TIME.has(column)){
    const d=new Date(value);
    return Number.isNaN(d.getTime())?null:d.toISOString();
  }

  return String(value);
}

async function readSheet(sheets,name){
  try{
    const response=await sheets.spreadsheets.values.get({
      spreadsheetId,
      range:`'${name}'!A:ZZ`,
      valueRenderOption:'UNFORMATTED_VALUE'
    });

    const values=response.data.values||[];
    if(!values.length)return [];

    const headers=values[0].map(v=>String(v??''));

    return values
      .slice(1)
      .filter(row=>row.some(v=>v!==''&&v!==undefined&&v!==null))
      .map(row=>
        Object.fromEntries(
          headers.map((header,index)=>[
            header,
            row[index]??''
          ])
        )
      );
  }catch(error){
    if(error?.code===400||error?.code===404){
      console.warn(name+': aba ausente; ignorada.');
      return [];
    }
    throw error;
  }
}

async function upsert(client,sheet,table,specific,rows){
  const map=[...COMMON,...specific];
  const columns=map.map(([,target])=>target);

  for(const row of rows){
    if(!row.id)continue;

    const vals=map.map(([source,target])=>cast(target,row[source]));
    const places=vals.map((_,index)=>'$'+(index+1));
    const updates=columns
      .filter(column=>column!=='id')
      .map(column=>`${column}=EXCLUDED.${column}`);

    await client.query(
      `INSERT INTO ${table}(${columns.join(',')})
       VALUES(${places.join(',')})
       ON CONFLICT(id) DO UPDATE SET ${updates.join(',')}`,
      vals
    );
  }

  console.log(sheet+': '+rows.length+' linha(s) processada(s)');
  return rows.length;
}

const auth=new google.auth.GoogleAuth({
  scopes:[
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.readonly'
  ]
});

const sheets=google.sheets({version:'v4',auth});

console.log('Aplicando schema incremental...');
await ensureSchema();

const pool=await getPool();
const client=await pool.connect();

const counts={};

try{
  const role=String(process.env.DB_ROLE||'').trim();
  if(role){
    if(!/^[A-Za-z0-9_@.\-]+$/.test(role))throw new Error('DB_ROLE inválido.');
    await client.query('SET ROLE "'+role.replace(/"/g,'""')+'"');
  }

  await client.query('BEGIN');

  if(String(process.env.IMPORT_TRUNCATE||'false').toLowerCase()==='true'){
    throw new Error('IMPORT_TRUNCATE=true é proibido nesta migração. O importador opera somente por UPSERT.');
  }

  for(const [sheet,table,map] of TABLES){
    const rows=await readSheet(sheets,sheet);
    counts[sheet]=await upsert(client,sheet,table,map,rows);
  }

  await client.query('COMMIT');

  console.log('MIGRATION_COUNTS='+JSON.stringify(counts));
  console.log('Migração concluída com sucesso.');
}catch(error){
  await client.query('ROLLBACK');
  throw error;
}finally{
  client.release();
  await closeDb();
}
