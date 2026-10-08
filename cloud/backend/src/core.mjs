import crypto from 'node:crypto';
import {getPool} from './db.mjs';
import {has,permissions,publicUser,ROLES} from './access.mjs';

export const SALARIO_MINIMO_2025=1518;
export const MAX_FILE_BYTES=5*1024*1024;
export const STORAGE_BUCKET=process.env.STORAGE_BUCKET||'povo-das-aguas-arquivos-2026';

export const JURISDICOES=Object.freeze({
  PELOTAS:['Amaral Ferrador','Arroio do Padre','Arroio Grande','Canguçu','Capão do Leão','Cerrito','Herval','Jaguarão','Morro Redondo','Pedro Osório','Pelotas','Piratini','São Lourenço do Sul','Turuçu'],
  'RIO GRANDE':['Chuí','Rio Grande','Santa Vitória do Palmar','São José do Norte'],
  'CAPÃO DA CANOA':['Arroio do Sal','Balneário Pinhal','Capão da Canoa','Caraá','Cidreira','Dom Pedro de Alcântara','Imbé','Itati','Mampituba','Maquiné','Morrinhos do Sul','Osório','Terra de Areia','Torres','Tramandaí','Três Cachoeiras','Três Forquilhas','Xangri-lá']
});

export const ENTIDADES_PADRAO=[
  'COPAPEL','RIG - COLÔNIA Z-1','SJN - COLÔNIA Z-2','PEL - COLÔNIA Z-3',
  'SLS - COLÔNIA Z-8','TAV - COLÔNIA Z-11','AGR - COLÔNIA Z-24','Outro'
];

export const DEFAULTS=Object.freeze({
  rascunhos:'PENDENTE',
  vencimentoFuturo:'PENDENTE',
  anexoOrientacao:'',
  templateId:'',
  templateAprovado:false,
  distribuicaoAutomatica:false,
  entidades:ENTIDADES_PADRAO,
  municipios:Object.values(JURISDICOES).flat().sort((a,b)=>a.localeCompare(b,'pt-BR')),
  demandas:['Seguro-Defeso 2025'],
  categorias:['RG_CPF','RESIDENCIA','PROCESSO_ADMINISTRATIVO','PESCA','PROCURACAO','HIPOSSUFICIENCIA'],
  situacoes:['EM_PREPARACAO','ENCAMINHADO','CONFERIDO'],
  advogadosDistribuicao:[
    'JOSÉ RICARDO CAETANO COSTA — OAB/RS 028.912',
    'THELMO DE CARVALHO TEIXEIRA BRANCO FILHO — OAB/RS 132.839B',
    'GUILHERME HOMMERDING ALT — OAB/RS 053.288',
    'PATRÍCIA DE ALMEIDA OLIVEIRA — OAB/RS 127.669',
    'LUIZE LIMA DA ROSA — OAB/RS 104.145',
    'YAGO FREITAS BLANCO — OAB/RS 137.930',
    'JOÃO PEDRO DE OLIVEIRA SIMÕES LOPES GASTAL — OAB/RS 129.245'
  ]
});

export const PERMISSIONS=Object.freeze({
  consulta:{label:'Consulta',descricao:'Visualizar painel, pessoas, fichas, documentos e processos sem alterar registros.'},
  cadastro:{label:'Cadastro',descricao:'Criar novas pessoas, anexar documentos durante a inclusão e concluir novos cadastros.'},
  retificacao:{label:'Retificação',descricao:'Editar pessoas já gravadas e corrigir dados existentes.'},
  retificacao_propria:{label:'Retificação dos próprios cadastros',descricao:'Editar somente pessoas cadastradas pelo próprio usuário.'},
  criar_tarefa_entidade:{label:'Criar tarefas da entidade',descricao:'Permite à Colônia criar tarefas vinculadas somente a membros da própria entidade e destiná-las aos usuários autorizados.'},
  conferencia:{label:'Conferência',descricao:'Conferir documentos e registrar validações.'},
  minuta:{label:'Minutas jurídicas',descricao:'Gerar e revisar minutas jurídicas.'},
  distribuicao:{label:'Distribuir processos',descricao:'Receber e concluir tarefas individuais de distribuição.'},
  gestao_distribuicao:{label:'Gerenciar distribuição',descricao:'Atribuir e acompanhar tarefas de distribuição.'},
  administracao:{label:'Administração',descricao:'Gerenciar usuários, configurações e integrações.'}
});

export const ROLE_DESCRIPTIONS=Object.freeze({
  CONSULTA:'Acesso somente para consulta das informações já registradas.',
  NOVO_USUARIO:'Perfil de primeiro acesso com Consulta e Cadastro.',
  PROFESSOR_RESIDENTE:'Professor ou Residente com permissões operacionais, exceto Administração e Distribuir processos.',
  COLABORADOR:'Consulta, Cadastro e Retificação limitada aos próprios cadastros.',
  COLONIA_PESCADOR:'Acesso restrito aos cadastros e processos da entidade vinculada. Pode cadastrar membros da própria entidade, editar somente os próprios cadastros, receber tarefas e criar tarefas dentro do escopo da entidade.',
  ALUNO:'Consulta e Distribuir processos.',
  CADASTRO:'Consulta e inclusão de pessoas e documentos.',
  CONFERENCIA:'Cadastro, retificação e conferência documental.',
  JURIDICO:'Conferência e atividades jurídicas, incluindo minutas e tarefas de distribuição.',
  ADMIN:'Acesso integral ao sistema, gestão da distribuição e configurações.'
});

const schemas={
  Pessoas:{table:'pessoas',fields:['nome','cpf','nascimento','telefone','tipoVia','via','numero','complemento','bairro','cidade','uf','entidade','outraEntidade','analfabeto','parcelasNaoRecebidas','jurisdicao','cep','email','criadoPor','origemCadastro']},
  Atendimentos:{table:'atendimentos',fields:['pessoaId','demanda','referencia','parcelas','outrosCasos','observacoes','responsavel','situacao','folderId','revisao','conferencia','enderecamento','secaoJudiciaria','valorCausa','localData']},
  Documentos:{table:'documentos',fields:['atendimentoId','categoria','fileId','url','nome','hash','mime','substituiId','vigente','vencimento','terceiro','conferido','declaracaoTerceiro','processoCompleto','anexoPresente','rogo','testemunhas','observacoes']},
  Pendencias:{table:'pendencias',fields:['atendimentoId','descricao','responsavel','situacao']},
  Minutas:{table:'minutas',fields:['atendimentoId','fileId','url','numero','situacao','snapshot','templateId','templateModified','revisor','revisadaEm','pdfFileId','pdfUrl']},
  Historico:{table:'historico',fields:['entidade','registroId','antes','depois','operacao']},
  Configuracoes:{table:'configuracoes',fields:['chave','valor']},
  Usuarios:{table:'usuarios',fields:['email','perfil','ativo','nome','funcao','permissoes','permissoesVersao','senhaHash','senhaSalt','senhaAlgoritmo','sessionVersion','ultimoLogin','nomeUsuario','fotoId','emailsAnteriores','entidade']},
  Sessoes:{table:'sessoes',fields:['usuarioId','tokenHash','expiraEm','sessionVersion','revogada']},
  Recuperacoes:{table:'recuperacoes',fields:['usuarioId','tokenHash','expiraEm','sessionVersion','usada']},
  Distribuicao:{table:'distribuicao',fields:['atendimentoId','processoId','numero','juizo','data','responsavel','protocoloId']},
  Tarefas:{table:'tarefas',fields:['tipo','pessoaId','responsavel','situacao','jurisdicao','valorCausa','atribuidaEm','concluidaEm','processoId','observacoes','titulo','descricao','criadoPor','prazo','prazoTipo','prazoQuantidade','prazoContagem','prazoInicio','prioridade','tags','modoDistribuicao','origem']},
  TarefaMensagens:{table:'tarefa_mensagens',fields:['tarefaId','autor','mensagem']},
  TarefaAnexos:{table:'tarefa_anexos',fields:['tarefaId','fileId','url','nome','mime','hash','bytes','enviadoPor','pessoaId','documentoId']},
  TarefaLeituras:{table:'tarefa_leituras',fields:['usuario','ultimoVistoEm','tarefaId']},
  TarefaTags:{table:'tarefa_tags',fields:['nome','cor','ativo']},
  Processos:{table:'processos',fields:['pessoaId','atendimentoId','numero','juizo','distribuidoEm','responsavel','movimentacoes','datajudTribunal','datajudGrau','datajudClasse','datajudOrgao','datajudSistema','datajudDataAjuizamento','datajudNivelSigilo','datajudAssuntos','datajudTags','datajudMarcoAtual','datajudUltimaMovimentacao','datajudUltimaAtualizacaoOrigem','datajudUltimaConsulta','datajudStatus','datajudErro']},
  Operacoes:{table:'operacoes',fields:['hash','resultado']}
};

const specialSnake={
  usuario:'usuario_email',criadoEm:'criado_em',alteradoEm:'alterado_em',
  pessoaId:'pessoa_id',tipoVia:'tipo_via',outraEntidade:'outra_entidade',
  parcelasNaoRecebidas:'parcelas_nao_recebidas',criadoPor:'criado_por',origemCadastro:'origem_cadastro',
  outrosCasos:'outros_casos',folderId:'folder_id',secaoJudiciaria:'secao_judiciaria',
  valorCausa:'valor_causa',localData:'local_data',atendimentoId:'atendimento_id',
  fileId:'file_id',substituiId:'substitui_id',declaracaoTerceiro:'declaracao_terceiro',
  processoCompleto:'processo_completo',anexoPresente:'anexo_presente',
  registroId:'registro_id',permissoesVersao:'permissoes_versao',senhaHash:'senha_hash',
  senhaSalt:'senha_salt',senhaAlgoritmo:'senha_algoritmo',sessionVersion:'session_version',
  ultimoLogin:'ultimo_login',nomeUsuario:'nome_usuario',fotoId:'foto_id',
  emailsAnteriores:'emails_anteriores',usuarioId:'usuario_id',tokenHash:'token_hash',
  expiraEm:'expira_em',processoId:'processo_id',protocoloId:'protocolo_id',
  atribuidaEm:'atribuida_em',concluidaEm:'concluida_em',distribuidoEm:'distribuido_em',
  templateId:'template_id',templateModified:'template_modified',revisadaEm:'revisada_em',
  pdfFileId:'pdf_file_id',pdfUrl:'pdf_url',
  titulo:'titulo',descricao:'descricao',prazo:'prazo',prazoTipo:'prazo_tipo',prazoQuantidade:'prazo_quantidade',prazoContagem:'prazo_contagem',prazoInicio:'prazo_inicio',prioridade:'prioridade',
  tags:'tags',modoDistribuicao:'modo_distribuicao',origem:'origem',
  tarefaId:'tarefa_id',ultimoVistoEm:'ultimo_visto_em',enviadoPor:'enviado_por',
  documentoId:'documento_id',datajudTribunal:'datajud_tribunal',datajudGrau:'datajud_grau',
  datajudClasse:'datajud_classe',datajudOrgao:'datajud_orgao',datajudSistema:'datajud_sistema',
  datajudDataAjuizamento:'datajud_data_ajuizamento',datajudNivelSigilo:'datajud_nivel_sigilo',
  datajudAssuntos:'datajud_assuntos',datajudTags:'datajud_tags',datajudMarcoAtual:'datajud_marco_atual',
  datajudUltimaMovimentacao:'datajud_ultima_movimentacao',
  datajudUltimaAtualizacaoOrigem:'datajud_ultima_atualizacao_origem',
  datajudUltimaConsulta:'datajud_ultima_consulta',datajudStatus:'datajud_status',datajudErro:'datajud_erro'
};
const snake=k=>specialSnake[k]||k.replace(/[A-Z]/g,m=>'_'+m.toLowerCase());
const dbColumn=(entity,key)=>entity==='TarefaLeituras'&&key==='usuario'?'usuario':snake(key);
const camel=s=>s.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());

export function entitySchema(entity){
  const s=schemas[entity];
  if(!s)throw httpError(500,'Entidade inválida: '+entity);
  return s;
}

export function rowToEntity(entity,row){
  if(!row)return null;
  const out={};
  for(const [k,v] of Object.entries(row)){
    if(k==='usuario_email'){
      if(entity==='TarefaLeituras')out.usuarioRegistro=v;
      else out.usuario=v;
    }
    else if(k==='criado_em')out.criadoEm=v instanceof Date?v.toISOString():v;
    else if(k==='alterado_em')out.alteradoEm=v instanceof Date?v.toISOString():v;
    else out[camel(k)]=v instanceof Date?v.toISOString():v;
  }
  if(entity==='Configuracoes'&&typeof out.valor!=='string')out.valor=JSON.stringify(out.valor);
  return out;
}

export function httpError(statusCode,message){
  return Object.assign(new Error(message),{statusCode});
}
export function required(v,label){
  if(v===undefined||v===null||String(v).trim()==='')throw httpError(400,'Informe '+label+'.');
  return v;
}
export function bool(v){return v===true||v==='true';}
export function now(){return new Date().toISOString();}
export function sha(v){return crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');}
export function id(prefix,key){return prefix+'_'+sha(key).slice(0,28);}
export function randomId(prefix){return id(prefix,crypto.randomUUID()+':'+Date.now()+':'+Math.random());}

export async function all(entity,client){
  const s=entitySchema(entity),db=client||await getPool();
  const q=await db.query('SELECT * FROM '+s.table+' ORDER BY criado_em NULLS LAST,id');
  return q.rows.map(r=>rowToEntity(entity,r));
}
export async function whereAll(entity,whereSql='TRUE',params=[],client,orderSql='criado_em NULLS LAST,id'){
  const s=entitySchema(entity),db=client||await getPool();
  const q=await db.query('SELECT * FROM '+s.table+' WHERE '+whereSql+' ORDER BY '+orderSql,params);
  return q.rows.map(r=>rowToEntity(entity,r));
}
export async function get(entity,recordId,client){
  const s=entitySchema(entity),db=client||await getPool();
  const q=await db.query('SELECT * FROM '+s.table+' WHERE id=$1 LIMIT 1',[recordId]);
  if(!q.rows.length)throw httpError(404,entity+' não localizado.');
  return rowToEntity(entity,q.rows[0]);
}
export async function findOne(entity,whereSql,params=[],client){
  const s=entitySchema(entity),db=client||await getPool();
  const q=await db.query('SELECT * FROM '+s.table+' WHERE '+whereSql+' LIMIT 1',params);
  return q.rows[0]?rowToEntity(entity,q.rows[0]):null;
}

const JSON_FIELDS=new Set([
  'permissoes','emailsAnteriores','movimentacoes','antes','depois',
  'resultado','tags','datajudAssuntos','datajudTags'
]);

function jsonDbParam(value){
  if(value===null||value===undefined)return value;
  if(typeof value==='string'){
    try{return JSON.stringify(JSON.parse(value));}
    catch{return JSON.stringify(value);}
  }
  return JSON.stringify(value);
}

function dbValue(entity,key,value){
  if(entity==='Configuracoes'&&key==='valor')return jsonDbParam(value);
  if(JSON_FIELDS.has(key))return jsonDbParam(value);
  return value;
}

export async function change(client,ctx,entity,recordId,data,expectedVersion){
  const s=entitySchema(entity);
  const existing=await findOne(entity,'id=$1',[recordId],client);
  if(existing&&expectedVersion!==undefined&&expectedVersion!==null&&Number(existing.versao)!==Number(expectedVersion)){
    throw httpError(409,'Registro alterado por outro usuário. Recarregue os dados.');
  }
  const payload={};
  for(const key of s.fields){
    if(Object.prototype.hasOwnProperty.call(data,key))payload[key]=dbValue(entity,key,data[key]);
    else if(existing&&Object.prototype.hasOwnProperty.call(existing,key))payload[key]=dbValue(entity,key,existing[key]);
    else payload[key]=null;
  }
  const version=existing?Number(existing.versao||0)+1:1;
  const timestamp=now();
  const columns=['id','versao','criado_em','alterado_em','usuario_email',...s.fields.map(k=>dbColumn(entity,k))];
  const values=[recordId,version,existing?.criadoEm||timestamp,timestamp,ctx?.email||'',...s.fields.map(k=>payload[k])];
  const places=values.map((_,i)=>'$'+(i+1));
  const updates=columns.filter(c=>!['id','criado_em'].includes(c)).map(c=>c+'=EXCLUDED.'+c);
  await client.query(
    'INSERT INTO '+s.table+'('+columns.join(',')+') VALUES('+places.join(',')+') ON CONFLICT(id) DO UPDATE SET '+updates.join(','),
    values
  );
  const saved=await get(entity,recordId,client);
  if(ctx&&entity!=='Historico'&&!['Sessoes','Recuperacoes','Operacoes'].includes(entity)){
    await insertHistory(client,ctx,entity,recordId,existing,saved,'SALVAR');
  }
  return saved;
}

export async function remove(client,ctx,entity,recordId,expectedVersion){
  const s=entitySchema(entity);
  const existing=await get(entity,recordId,client);
  if(expectedVersion!==undefined&&Number(existing.versao)!==Number(expectedVersion))throw httpError(409,'Registro alterado. Recarregue.');
  await client.query('DELETE FROM '+s.table+' WHERE id=$1',[recordId]);
  if(ctx&&!['Sessoes','Recuperacoes','Operacoes'].includes(entity)){
    await insertHistory(client,ctx,entity,recordId,existing,null,'EXCLUIR');
  }
  return existing;
}

async function insertHistory(client,ctx,entity,recordId,before,after,operation){
  const hid=randomId('HIS');
  await client.query(
    'INSERT INTO historico(id,versao,criado_em,alterado_em,usuario_email,entidade,registro_id,antes,depois,operacao) VALUES($1,1,now(),now(),$2,$3,$4,$5::jsonb,$6::jsonb,$7)',
    [hid,ctx.email,entity,recordId,JSON.stringify(before),JSON.stringify(after),operation]
  );
}

export async function config(client){
  const c=JSON.parse(JSON.stringify(DEFAULTS));
  const rows=await all('Configuracoes',client);
  for(const r of rows){
    try{c[r.chave]=typeof r.valor==='string'?JSON.parse(r.valor):r.valor;}catch{}
  }
  c.municipios=[...new Set([...c.municipios,...Object.values(JURISDICOES).flat()])].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  return c;
}

export function jurisdiction(city){
  for(const [name,cities] of Object.entries(JURISDICOES))if(cities.includes(String(city||'').trim()))return name;
  return '';
}
export function causeValue(parcelas){
  const n=Number(parcelas||0);
  return Number.isInteger(n)&&n>=1&&n<=4?n*SALARIO_MINIMO_2025:0;
}
export function moneyBR(value){
  return Number(value||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
export function address(p){
  const via=[p.tipoVia,p.via].filter(Boolean).join(' ');
  const cep=p.cep?'CEP '+String(p.cep).replace(/(\d{5})(\d{3})/,'$1-$2'):'';
  return [via,p.numero,p.complemento,p.bairro,cep].filter(Boolean).join(', ');
}
export function personOwnerKey(personId){return 'PESSOA:'+personId;}
export function personIdFromOwner(owner){const m=String(owner||'').match(/^PESSOA:(.+)$/);return m?m[1]:'';}

export const DOC_LABELS=Object.freeze({
  RG_CPF:'Documento de identidade e CPF',
  RESIDENCIA:'Comprovante de residência',
  IDENTIDADE_TITULAR_RESIDENCIA:'Carteira de identidade do titular da residência',
  PROCESSO_ADMINISTRATIVO:'Processo administrativo',
  PESCA:'Documentos de pesca',
  PROCURACAO:'Procuração',
  HIPOSSUFICIENCIA:'Declaração de hipossuficiência',
  INICIAL_SEGURO_DEFESO_2025:'Petição inicial — Seguro-Defeso 2025',
  RELATORIO_SEGURO_DEFESO_2025:'Relatório Seguro-Defeso 2025',
  MODELO_GERADO:'Documento gerado por modelo'
});
export function docLabel(cat){return DOC_LABELS[cat]||String(cat||'Documento');}

export function normalizeEntityScope(value){
  return String(value||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toUpperCase();
}
export function isColonyUser(user){return String(user?.perfil||'').toUpperCase()==='COLONIA_PESCADOR';}
export function colonyUserEntity(user){return String(user?.entidade||'').trim();}
export function personInUserScope(user,p){
  if(!isColonyUser(user))return true;
  return normalizeEntityScope(p?.entidade)===normalizeEntityScope(colonyUserEntity(user));
}
export function authorizePersonScope(user,p){
  if(!personInUserScope(user,p))throw httpError(403,'Este cadastro pertence a outra entidade.');
  return p;
}
export function canRetify(user,p){
  if(!personInUserScope(user,p))return false;
  return has(user,'retificacao')||(has(user,'retificacao_propria')&&String(p.criadoPor||p.usuario||'').toLowerCase()===String(user.email||'').toLowerCase());
}
export function canWritePersonContent(user,p){return personInUserScope(user,p)&&(has(user,'cadastro')||canRetify(user,p)||has(user,'conferencia'));}
export function forcePersonEntity(user,payload){
  if(!isColonyUser(user))return payload;
  return {...payload,entidade:colonyUserEntity(user),outraEntidade:'',origemCadastro:'COLONIA'};
}

export function validateCpf(input){
  const s=String(input||'').replace(/\D/g,'');
  if(!/^\d{11}$/.test(s)||/^(\d)\1+$/.test(s))throw httpError(400,'CPF inválido.');
  for(let j=9;j<11;j++){
    let n=0;for(let i=0;i<j;i++)n+=Number(s[i])*(j+1-i);
    let d=(n*10)%11;if(d===10)d=0;if(d!==Number(s[j]))throw httpError(400,'CPF inválido.');
  }
  return s;
}
export function validateDateBR(s){
  if(!/^\d{2}\/\d{2}\/\d{4}$/.test(String(s||'')))throw httpError(400,'Data deve usar DD/MM/AAAA.');
  const [d,m,y]=s.split('/').map(Number),dt=new Date(Date.UTC(y,m-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)throw httpError(400,'Data inválida.');
  return dt;
}
export async function validatePerson(input,client,complete=true){
  const c=await config(client);
  const p={};
  for(const key of schemas.Pessoas.fields)p[key]=typeof input[key]==='string'?input[key].trim():(input[key]??'');
  p.cpf=validateCpf(p.cpf);required(p.nome,'nome completo');
  if(p.nome.length>200)throw httpError(400,'Nome muito longo.');
  if(complete){
    for(const k of ['nascimento','telefone','tipoVia','via','numero','bairro','cidade','uf','cep','entidade','analfabeto','parcelasNaoRecebidas'])required(p[k],k);
  }
  if(p.parcelasNaoRecebidas!==''){
    const n=Number(p.parcelasNaoRecebidas);if(!Number.isInteger(n)||n<1||n>4)throw httpError(400,'Informe de 1 a 4 parcelas não recebidas.');
    p.parcelasNaoRecebidas=String(n);
  }
  if(p.cep!==''){p.cep=String(p.cep).replace(/\D/g,'');if(!/^\d{8}$/.test(p.cep))throw httpError(400,'CEP inválido.');}
  if(p.nascimento)validateDateBR(p.nascimento);
  if(p.telefone){
    const digits=String(p.telefone).replace(/\D/g,'');if(!/^\d{11}$/.test(digits))throw httpError(400,'Telefone deve usar DDD + 9 dígitos.');
    p.telefone=digits.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3');
  }
  if(p.email){
    p.email=String(p.email).trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))throw httpError(400,'E-mail inválido.');
  }
  if(p.uf&&!/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(p.uf))throw httpError(400,'UF inválida.');
  if(p.cidade&&!c.municipios.includes(p.cidade))throw httpError(400,'Município não cadastrado.');
  p.jurisdicao=jurisdiction(p.cidade);
  if(p.entidade&&!c.entidades.includes(p.entidade))throw httpError(400,'Entidade não cadastrada.');
  if(p.entidade==='Outro')required(p.outraEntidade,'outra entidade');
  if(p.analfabeto&&!['SIM','NAO'].includes(p.analfabeto))throw httpError(400,'Informe SIM ou NAO para a condição registrada.');
  return p;
}

export function requirePermission(user,permission){
  if(!has(user,permission))throw httpError(403,'Você não possui permissão para esta operação.');
}

export function profileDetails(){
  return {
    perfis:Object.keys(ROLES),
    perfisDetalhes:Object.fromEntries(Object.keys(ROLES).map(perfil=>[perfil,{descricao:ROLE_DESCRIPTIONS[perfil]||'',permissoes:[...(ROLES[perfil]||[])]}])),
    permissoes:Object.entries(PERMISSIONS).map(([key,value])=>({key,label:value.label,descricao:value.descricao}))
  };
}

export async function idempotentMutation(action,q,user,producer){
  const pool=await getPool();
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const op=String(q?.op||'').trim();
    const ctx={email:user.email,action,op};
    if(op){
      const opId=id('OP',user.email+':'+op);
      const digest=sha({action,payload:{...q,op:undefined}});
      const prev=await findOne('Operacoes','id=$1',[opId],client);
      if(prev){
        if(prev.hash!==digest)throw httpError(409,'Operação já utilizada com conteúdo diferente.');
        await client.query('ROLLBACK');
        return typeof prev.resultado==='string'?JSON.parse(prev.resultado):prev.resultado;
      }
      const result=await producer(client,ctx);
      await change(client,ctx,'Operacoes',opId,{hash:digest,resultado:result});
      await client.query('COMMIT');
      return result;
    }
    const result=await producer(client,ctx);
    await client.query('COMMIT');
    return result;
  }catch(e){
    try{await client.query('ROLLBACK');}catch{}
    throw e;
  }finally{client.release();}
}
