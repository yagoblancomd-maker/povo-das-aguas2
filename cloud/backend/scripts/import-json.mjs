import fs from 'node:fs';
import 'dotenv/config';
import {getPool,closeDb} from '../src/db.mjs';

const source=JSON.parse(fs.readFileSync(process.env.MIGRATION_JSON,'utf8'));
const common={id:'id',versao:'versao',criadoEm:'criado_em',alteradoEm:'alterado_em',usuario:'usuario_email'};
const maps={
Pessoas:['pessoas',{...common,nome:'nome',cpf:'cpf',nascimento:'nascimento',telefone:'telefone',tipoVia:'tipo_via',via:'via',numero:'numero',complemento:'complemento',bairro:'bairro',cidade:'cidade',uf:'uf',entidade:'entidade',outraEntidade:'outra_entidade',analfabeto:'analfabeto',parcelasNaoRecebidas:'parcelas_nao_recebidas',jurisdicao:'jurisdicao',cep:'cep',email:'email',criadoPor:'criado_por'}],
Usuarios:['usuarios',{...common,email:'email',perfil:'perfil',ativo:'ativo',nome:'nome',funcao:'funcao',permissoes:'permissoes',permissoesVersao:'permissoes_versao',senhaHash:'senha_hash',senhaSalt:'senha_salt',senhaAlgoritmo:'senha_algoritmo',sessionVersion:'session_version',ultimoLogin:'ultimo_login',nomeUsuario:'nome_usuario',fotoId:'foto_id',emailsAnteriores:'emails_anteriores'}],
Atendimentos:['atendimentos',{...common,pessoaId:'pessoa_id',demanda:'demanda',referencia:'referencia',parcelas:'parcelas',outrosCasos:'outros_casos',observacoes:'observacoes',responsavel:'responsavel',situacao:'situacao',folderId:'folder_id',revisao:'revisao',conferencia:'conferencia',enderecamento:'enderecamento',secaoJudiciaria:'secao_judiciaria',valorCausa:'valor_causa',localData:'local_data'}],
Documentos:['documentos',{...common,atendimentoId:'atendimento_id',categoria:'categoria',fileId:'file_id',url:'url',nome:'nome',hash:'hash',mime:'mime',substituiId:'substitui_id',vigente:'vigente',vencimento:'vencimento',terceiro:'terceiro',conferido:'conferido',declaracaoTerceiro:'declaracao_terceiro',processoCompleto:'processo_completo',anexoPresente:'anexo_presente',rogo:'rogo',testemunhas:'testemunhas',observacoes:'observacoes'}],
Pendencias:['pendencias',{...common,atendimentoId:'atendimento_id',descricao:'descricao',responsavel:'responsavel',situacao:'situacao'}],
Minutas:['minutas',{...common,atendimentoId:'atendimento_id',fileId:'file_id',url:'url',numero:'numero',situacao:'situacao',snapshot:'snapshot',templateId:'template_id',templateModified:'template_modified',revisor:'revisor',revisadaEm:'revisada_em',pdfFileId:'pdf_file_id',pdfUrl:'pdf_url'}],
Historico:['historico',{...common,entidade:'entidade',registroId:'registro_id',antes:'antes',depois:'depois',operacao:'operacao'}],
Configuracoes:['configuracoes',{...common,chave:'chave',valor:'valor'}],
Distribuicao:['distribuicao',{...common,atendimentoId:'atendimento_id',processoId:'processo_id',numero:'numero',juizo:'juizo',data:'data',responsavel:'responsavel',protocoloId:'protocolo_id'}],
Processos:['processos',{...common,pessoaId:'pessoa_id',atendimentoId:'atendimento_id',numero:'numero',juizo:'juizo',distribuidoEm:'distribuido_em',responsavel:'responsavel',movimentacoes:'movimentacoes'}],
Operacoes:['operacoes',{...common,hash:'hash',resultado:'resultado'}],
Tarefas:['tarefas',{...common,tipo:'tipo',pessoaId:'pessoa_id',responsavel:'responsavel',situacao:'situacao',jurisdicao:'jurisdicao',valorCausa:'valor_causa',atribuidaEm:'atribuida_em',concluidaEm:'concluida_em',processoId:'processo_id',observacoes:'observacoes'}]
};
const bools=new Set(['ativo','vigente','terceiro','conferido','declaracao_terceiro','processo_completo','anexo_presente','rogo','testemunhas']);
const ints=new Set(['versao','permissoes_versao','session_version']);
const jsons=new Set(['permissoes','emails_anteriores','antes','depois','valor','movimentacoes','resultado']);
function cast(col,v){if(v===''||v===undefined)return null;if(bools.has(col))return String(v).toLowerCase()==='true';if(ints.has(col))return Number(v)||0;if(jsons.has(col)){try{return JSON.stringify(JSON.parse(v));}catch{return JSON.stringify(v);}}return v;}
const pool=await getPool(); const client=await pool.connect();
try{
 await client.query('BEGIN');
 for(const [sheet,[table,map]] of Object.entries(maps)){
  const rows=source[sheet]||[]; if(rows.length<2){console.log(sheet+': 0');continue;}
  const headers=rows[0]; const cols=Object.values(map); const keys=Object.keys(map);
  for(const row of rows.slice(1).filter(r=>r[0])){
   const obj=Object.fromEntries(headers.map((h,i)=>[h,row[i]??'']));
   const vals=keys.map((k,i)=>cast(cols[i],obj[k]));
   const places=vals.map((_,i)=>'$'+(i+1)); const updates=cols.filter(c=>c!=='id').map(c=>c+'=EXCLUDED.'+c);
   await client.query('INSERT INTO '+table+'('+cols.join(',')+') VALUES('+places.join(',')+') ON CONFLICT(id) DO UPDATE SET '+updates.join(','),vals);
  }
  console.log(sheet+': '+(rows.length-1));
 }
 await client.query('COMMIT'); console.log('MIGRATION_OK');
}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await closeDb();}
