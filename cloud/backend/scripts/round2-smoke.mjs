import fs from 'node:fs/promises';
import {Storage} from '@google-cloud/storage';
import {getPool,closeDb} from '../src/db.mjs';
import {all,get,change,config,personOwnerKey,sha} from '../src/core.mjs';
import {ROLES,permissions} from '../src/access.mjs';
import {executeAction} from '../src/actions.mjs';

const prefix='r2'+Date.now().toString().slice(-9);
const entity='PEL - COLÔNIA Z-3';
const email=prefix+'@example.invalid';
const userId='USR_'+prefix;
const autoModelId='MOD_'+prefix+'_AUTO';
const manualModelId='MOD_'+prefix+'_MANUAL';
const pool=await getPool();
const storage=new Storage();
const bucket=storage.bucket(process.env.STORAGE_BUCKET);
const out={prefix,checks:{},details:{}};
let personId='';
let createdCpf='';
const assert=(name,value,detail='')=>{
  out.checks[name]=!!value;
  if(!value)throw new Error('ASSERT '+name+(detail?': '+detail:''));
};

function cpfFromSeed(seed){
  let base=String(seed).replace(/\D/g,'').slice(-9).padStart(9,'1');
  if(/^(\d)\1+$/.test(base))base='529982247';
  const calc=s=>{
    let sum=0;
    const len=s.length;
    for(let i=0;i<len;i++)sum+=Number(s[i])*(len+1-i);
    const rest=(sum*10)%11;
    return rest===10?0:rest;
  };
  const d1=calc(base);
  const d2=calc(base+d1);
  return base+d1+d2;
}
function cpfMask(cpf){
  return String(cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
}

async function removeModel(id,admin){
  try{
    const list=await executeAction('modelosDocumentosListar',{},admin);
    if((list.modelos||[]).some(m=>m.id===id)){
      await executeAction('modeloDocumentoExcluir',{id,op:'cleanup-'+id},admin);
    }
  }catch(e){
    console.error('MODEL_CLEANUP_WARN',id,e.message);
  }
}

async function hardCleanup(){
  const client=await pool.connect();
  const refs=new Set();
  try{
    await client.query('BEGIN');
    if(personId){
      const owner=personOwnerKey(personId);
      const att=(await client.query('select id from atendimentos where pessoa_id=$1',[personId])).rows.map(r=>r.id);
      const owners=[owner,...att];
      const docs=(await client.query('select file_id from documentos where atendimento_id=any($1::text[])',[owners])).rows;
      const mins=(await client.query('select file_id,pdf_file_id from minutas where atendimento_id=any($1::text[])',[owners])).rows;
      const tasks=(await client.query('select id from tarefas where pessoa_id=$1',[personId])).rows.map(r=>r.id);
      for(const row of docs)if(String(row.file_id||'').startsWith('gcs:'))refs.add(String(row.file_id).slice(4));
      for(const row of mins){
        if(String(row.file_id||'').startsWith('gcs:'))refs.add(String(row.file_id).slice(4));
        if(String(row.pdf_file_id||'').startsWith('gcs:'))refs.add(String(row.pdf_file_id).slice(4));
      }
      if(tasks.length){
        const ta=(await client.query('select file_id from tarefa_anexos where tarefa_id=any($1::text[])',[tasks])).rows;
        for(const row of ta)if(String(row.file_id||'').startsWith('gcs:'))refs.add(String(row.file_id).slice(4));
        await client.query('delete from tarefa_mensagens where tarefa_id=any($1::text[])',[tasks]);
        await client.query('delete from tarefa_anexos where tarefa_id=any($1::text[])',[tasks]);
        await client.query('delete from tarefa_leituras where tarefa_id=any($1::text[])',[tasks]);
      }
      await client.query('delete from tarefas where pessoa_id=$1',[personId]);
      await client.query('delete from processos where pessoa_id=$1',[personId]);
      await client.query('delete from minutas where atendimento_id=any($1::text[])',[owners]);
      await client.query('delete from documentos where atendimento_id=any($1::text[])',[owners]);
      await client.query('delete from atendimentos where pessoa_id=$1',[personId]);
      await client.query('delete from pessoas where id=$1',[personId]);
      await client.query('delete from historico where registro_id=$1 or usuario_email=$2',[personId,email]);
    }
    await client.query('delete from sessoes where usuario_id=$1',[userId]);
    await client.query('delete from recuperacoes where usuario_id=$1',[userId]);
    await client.query('delete from usuarios where id=$1',[userId]);
    await client.query('delete from historico where usuario_email=$1',[email]);
    await client.query('COMMIT');
  }catch(e){
    try{await client.query('ROLLBACK')}catch{}
    console.error('HARD_CLEANUP_ERROR',e.message);
  }finally{
    client.release();
  }
  await Promise.all([...refs].map(name=>bucket.file(name).delete({ignoreNotFound:true}).catch(()=>{})));
}

let admin;
try{
  const users=await all('Usuarios');
  admin=users.find(u=>u.ativo&&(permissions(u)||[]).includes('administracao'));
  if(!admin)throw new Error('Administrador ativo não localizado.');

  const client=await pool.connect();
  try{
    await change(client,null,'Usuarios',userId,{
      email,
      perfil:'COLONIA_PESCADOR',
      ativo:true,
      nome:'Agente Teste Round 2',
      funcao:'Agente de entidade',
      permissoes:[...(ROLES.COLONIA_PESCADOR||[])],
      permissoesVersao:1,
      senhaHash:'',
      senhaSalt:'',
      senhaAlgoritmo:'',
      sessionVersion:1,
      ultimoLogin:null,
      nomeUsuario:prefix,
      fotoId:'',
      emailsAnteriores:[],
      entidade:entity
    });
  }finally{client.release();}
  const colony=await get('Usuarios',userId);

  const template=await fs.readFile(new URL('../assets/default-template.docx',import.meta.url));
  const commonModel={
    categoria:'MANIFESTACAO',
    finalidade:'Teste Round 2',
    descricao:'Modelo sintético para validação da automação.',
    jurisdicoes:'PELOTAS',
    entidades:entity,
    origensCadastro:'COLONIA',
    parcelas:'3',
    demandas:'Seguro-Defeso 2025',
    ativo:true,
    mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    base64:template.toString('base64')
  };
  await executeAction('modeloDocumentoSalvar',{
    ...commonModel,
    id:autoModelId,
    nome:'Modelo automático '+prefix,
    arquivoNome:'automatico.docx',
    automatico:true,
    op:'model-auto-'+prefix
  },admin);
  await executeAction('modeloDocumentoSalvar',{
    ...commonModel,
    id:manualModelId,
    nome:'Modelo manual '+prefix,
    arquivoNome:'manual.docx',
    automatico:false,
    op:'model-manual-'+prefix
  },admin);

  createdCpf=cpfFromSeed(Date.now());
  const person=await executeAction('pessoaSalvar',{
    op:'person-'+prefix,
    nome:'PESSOA TESTE ROUND 2 '+prefix.toUpperCase(),
    cpf:createdCpf,
    nascimento:'01/01/1980',
    telefone:'53999999999',
    tipoVia:'Rua',
    via:'Teste',
    numero:'100',
    complemento:'',
    bairro:'Centro',
    cidade:'Pelotas',
    uf:'RS',
    entidade:entity,
    outraEntidade:'',
    analfabeto:'NAO',
    parcelasNaoRecebidas:'3',
    cep:'96000000',
    email:''
  },colony);
  personId=person.id;
  assert('person_origin_colony',person.origemCadastro==='COLONIA');
  assert('person_entity_forced',person.entidade===entity);

  const preload=await executeAction('pessoasLeve',{precarregar:true,limit:5000},colony);
  assert('preload_contains_new_person',(preload.pessoas||[]).some(p=>p.id===personId));
  assert('preload_respects_colony_scope',(preload.pessoas||[]).every(p=>String(p.entidade||'')===entity));

  const cfg=await config();
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
  const uploaded=[];
  let i=0;
  for(const categoria of cfg.categorias||[]){
    const result=await executeAction('pessoaUpload',{
      op:'upload-'+prefix+'-'+(++i),
      pessoaId:personId,
      categoria,
      nome:categoria+'.pdf',
      mime:'application/pdf',
      base64:pdf.toString('base64'),
      vencimento:categoria==='RESIDENCIA'?'01/10/2026':'',
      terceiro:false,
      declaracaoTerceiro:false
    },colony);
    uploaded.push(result.documento);
  }
  assert('required_documents_uploaded',uploaded.length===(cfg.categorias||[]).length);

  const opened=await executeAction('documentoConteudo',{id:uploaded[0].id,pessoaId:personId},colony);
  assert('document_open_content',opened.id===uploaded[0].id&&String(opened.base64||'').length>0);

  const finalized=await executeAction('pessoaFinalizarCadastro',{
    op:'finalize-'+prefix,
    pessoaId:personId
  },colony);
  assert('automatic_model_generated',finalized.modelosAutomaticos?.gerados?.some(x=>x.modelo?.id===autoModelId));
  assert('distribution_created',!!finalized.tarefaDistribuicao);

  const task=await get('Tarefas',finalized.tarefaDistribuicao);
  const tags=Array.isArray(task.tags)?task.tags:JSON.parse(task.tags||'[]');
  assert('colony_distribution_unassigned',!String(task.responsavel||'').trim()&&task.situacao==='PENDENTE_ATRIBUICAO');
  assert('colony_distribution_tagged',tags.some(t=>String(t).toUpperCase()==='CRIADO PELA COLÔNIA'));

  const manual=await executeAction('modeloDocumentoGerar',{
    op:'manual-generate-'+prefix,
    pessoaId:personId,
    modeloId:manualModelId,
    demanda:'Seguro-Defeso 2025'
  },colony);
  assert('manual_model_generated',manual.modelo?.id===manualModelId&&(manual.documentos||[]).length===2);

  const docs=await executeAction('pessoaDocumentos',{pessoaId:personId,limit:100},colony);
  assert('generated_documents_visible',(docs.documentos||[]).filter(d=>d.categoria==='MODELO_GERADO').length>=4);

  const deleteDoc=manual.documentos?.[0];
  const deletedDoc=await executeAction('pessoaDocumentoExcluir',{
    op:'delete-doc-'+prefix,
    id:deleteDoc.id,
    versao:deleteDoc.versao,
    pessoaId:personId
  },colony);
  assert('document_delete_works',deletedDoc.documento?.vigente===false||deletedDoc.documento?.vigente==='false');

  const secondFinalize=await executeAction('pessoaFinalizarCadastro',{
    op:'finalize-second-'+prefix,
    pessoaId:personId
  },colony);
  assert('automatic_model_not_duplicated',secondFinalize.modelosAutomaticos?.gerados?.length===0&&secondFinalize.modelosAutomaticos?.ignorados?.some(x=>x.id===autoModelId));

  const currentPerson=await get('Pessoas',personId);
  const preview=await executeAction('pessoaExcluirPreview',{id:personId},admin);
  assert('delete_preview_has_links',preview.documentos>0&&preview.tarefas>0);

  const removed=await executeAction('pessoaExcluirDefinitivo',{
    op:'delete-person-'+prefix,
    id:personId,
    versao:currentPerson.versao,
    confirmar:true,
    confirmarVinculos:true,
    cpfConfirmacao:cpfMask(createdCpf)
  },admin);
  assert('delete_person_with_formatted_cpf',removed.ok===true);
  personId='';

  await removeModel(autoModelId,admin);
  await removeModel(manualModelId,admin);

  out.ok=Object.values(out.checks).every(Boolean);
  out.details={cpf:createdCpf,checks:Object.keys(out.checks).length};
  console.log('ROUND2_SMOKE='+JSON.stringify(out));
}finally{
  if(admin){
    await removeModel(autoModelId,admin);
    await removeModel(manualModelId,admin);
  }
  await hardCleanup();
  const remaining=await pool.query("select count(*)::int n from usuarios where lower(email)=$1",[email.toLowerCase()]);
  console.log('ROUND2_CLEANUP='+JSON.stringify({remainingUsers:remaining.rows[0].n,personId}));
  await closeDb();
}
