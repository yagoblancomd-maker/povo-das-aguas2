import 'dotenv/config';
import ExcelJS from 'exceljs';
import {getPool,closeDb} from '../src/db.mjs';
import {ensureSchema} from '../src/schema.mjs';

const xlsxPath=process.env.XLSX_PATH;
if(!xlsxPath)throw new Error('Defina XLSX_PATH.');

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

async function readSheet(workbook,name){
  const sheet=workbook.getWorksheet(name);
  if(!sheet){
    console.warn(name+': aba ausente; ignorada.');
    return [];
  }

  const headers=[];
  sheet.getRow(1).eachCell({includeEmpty:true},(cell,col)=>{
    headers[col-1]=String(cell.value??'');
  });

  const rows=[];
  sheet.eachRow({includeEmpty:false},(row,rowNumber)=>{
    if(rowNumber===1)return;

    const record={};
    let hasValue=false;

    for(let col=1;col<=headers.length;col++){
      const header=headers[col-1];
      if(!header)continue;

      let value=row.getCell(col).value;

      if(value&&typeof value==='object'){
        if(Object.prototype.hasOwnProperty.call(value,'result')){
          value=value.result;
        }else if(value instanceof Date){
          value=value.toISOString();
        }else if(Array.isArray(value.richText)){
          value=value.richText.map(x=>x.text||'').join('');
        }else if(value.text!==undefined){
          value=value.text;
        }
      }

      if(value!==''&&value!==null&&value!==undefined)hasValue=true;
      record[header]=value??'';
    }

    if(hasValue)rows.push(record);
  });

  return rows;
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

async function archiveOrphans(client,origin,rows){
  if(!rows.length)return 0;
  await client.query(`CREATE TABLE IF NOT EXISTS migration_backup_20261007.orphan_records(
    origem text not null,
    registro_id text not null,
    dados jsonb not null,
    archived_at timestamptz not null default now(),
    primary key(origem,registro_id)
  )`);
  for(const row of rows){
    await client.query(
      `INSERT INTO migration_backup_20261007.orphan_records(origem,registro_id,dados,archived_at)
       VALUES($1,$2,$3::jsonb,now())
       ON CONFLICT(origem,registro_id) DO UPDATE SET dados=excluded.dados,archived_at=excluded.archived_at`,
      [origin,String(row.id||''),JSON.stringify(row)]
    );
  }
  console.log(origin+': '+rows.length+' registro(s) órfão(s) arquivado(s).');
  return rows.length;
}

const workbook=new ExcelJS.Workbook();
await workbook.xlsx.readFile(xlsxPath);

const snapshotPeopleRows=await readSheet(workbook,'Pessoas');
const validPersonIds=new Set(snapshotPeopleRows.map(row=>String(row.id||'')).filter(Boolean));
const snapshotTaskRows=await readSheet(workbook,'Tarefas');
const orphanTaskRows=snapshotTaskRows.filter(row=>String(row.pessoaId||'')&&!validPersonIds.has(String(row.pessoaId)));
const validTaskRows=snapshotTaskRows.filter(row=>!String(row.pessoaId||'')||validPersonIds.has(String(row.pessoaId)));
const validTaskIds=new Set(validTaskRows.map(row=>String(row.id||'')).filter(Boolean));

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

  const replaceSource=String(process.env.IMPORT_REPLACE_SOURCE||'false').toLowerCase()==='true';

  if(replaceSource){
    console.log('Substituindo conjunto operacional pelo snapshot validado...');
    await client.query(`TRUNCATE
      tarefa_mensagens,tarefa_anexos,tarefa_leituras,tarefa_tags,
      historico,operacoes,distribuicao,minutas,pendencias,
      documentos,tarefas,processos,atendimentos,configuracoes,
      sessoes,recuperacoes,usuarios,pessoas
      CASCADE`);
  }else if(String(process.env.IMPORT_TRUNCATE||'false').toLowerCase()==='true'){
    throw new Error('IMPORT_TRUNCATE=true é proibido. Use IMPORT_REPLACE_SOURCE=true somente após backup validado.');
  }

  for(const [sheet,table,map] of TABLES){
    if(sheet==='Sessoes'||sheet==='Recuperacoes'){
      counts[sheet]=0;
      console.log(sheet+': não migrada; sessões e tokens antigos são descartados por segurança.');
      continue;
    }

    let rows;
    let orphanRows=[];

    if(sheet==='Pessoas'){
      rows=snapshotPeopleRows;
    }else if(sheet==='Tarefas'){
      rows=validTaskRows;
      orphanRows=orphanTaskRows;
    }else{
      rows=await readSheet(workbook,sheet);

      if(sheet==='Atendimentos'||sheet==='Processos'){
        orphanRows=rows.filter(row=>String(row.pessoaId||'')&&!validPersonIds.has(String(row.pessoaId)));
        rows=rows.filter(row=>!String(row.pessoaId||'')||validPersonIds.has(String(row.pessoaId)));
      }

      if(sheet==='TarefaMensagens'||sheet==='TarefaAnexos'||sheet==='TarefaLeituras'){
        const taskOrphans=rows.filter(row=>String(row.tarefaId||'')&&!validTaskIds.has(String(row.tarefaId)));
        orphanRows=[...orphanRows,...taskOrphans];
        rows=rows.filter(row=>!String(row.tarefaId||'')||validTaskIds.has(String(row.tarefaId)));
      }

      if(sheet==='Documentos'){
        const directOrphans=rows.filter(row=>{
          const owner=String(row.atendimentoId||'');
          return owner.startsWith('PESSOA:')&&!validPersonIds.has(owner.slice('PESSOA:'.length));
        });
        orphanRows=[...orphanRows,...directOrphans];
        rows=rows.filter(row=>{
          const owner=String(row.atendimentoId||'');
          return !owner.startsWith('PESSOA:')||validPersonIds.has(owner.slice('PESSOA:'.length));
        });
      }
    }

    counts[sheet+'_orfaos']=await archiveOrphans(client,sheet,orphanRows);
    counts[sheet]=await upsert(client,sheet,table,map,rows);
  }

  await client.query('COMMIT');

  console.log('MIGRATION_COUNTS='+JSON.stringify(counts));
  console.log('Migração XLSX concluída com sucesso.');
}catch(error){
  await client.query('ROLLBACK');
  throw error;
}finally{
  client.release();
  await closeDb();
}
