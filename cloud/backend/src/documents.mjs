import crypto from 'node:crypto';
import {Storage} from '@google-cloud/storage';
import {getPool,tx} from './db.mjs';
import {requireAuth} from './auth.mjs';
import {has} from './access.mjs';

const storage=new Storage();
const BUCKET=process.env.DOCUMENT_BUCKET||'povo-das-aguas-arquivos-2026';
const REQUIRED=['RG_CPF','RESIDENCIA','PROCESSO_ADMINISTRATIVO','PESCA','PROCURACAO','HIPOSSUFICIENCIA'];
const ALLOWED_MIME=new Set([
  'application/pdf','image/jpeg','image/png','image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const id=p=>p+'_'+crypto.randomBytes(14).toString('hex');
const safeName=v=>String(v||'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,120)||'arquivo';

function fail(message,statusCode=400){
  const e=new Error(message);e.statusCode=statusCode;throw e;
}
async function canWrite(user,person){
  if(has(user,'cadastro')||has(user,'retificacao'))return true;
  return has(user,'retificacao_propria')&&
    String(person.criado_por||person.usuario_email||'').toLowerCase()===String(user.email||'').toLowerCase();
}
async function audit(c,user,entity,recordId,before,after,operation){
  await c.query(
    `INSERT INTO historico
     (id,versao,criado_em,alterado_em,usuario_email,entidade,registro_id,antes,depois,operacao)
     VALUES($1,1,now(),now(),$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
    [id('HIST'),user.email,entity,recordId,JSON.stringify(before||null),JSON.stringify(after||null),operation]
  );
}

export async function documentRoutes(app){
  app.post('/api/v1/pessoas/:id/documentos',{preHandler:requireAuth},async(req,reply)=>{
    let objectName='';
    try{
      const pool=await getPool();
      const person=(await pool.query('SELECT * FROM pessoas WHERE id=$1',[req.params.id])).rows[0];
      if(!person)fail('Pessoa não localizada.',404);
      if(!(await canWrite(req.auth.user,person)))fail('Você não possui permissão para anexar documentos.',403);

      const categoria=String(req.query?.categoria||'').trim().toUpperCase();
      if(!/^[A-Z0-9_]{2,80}$/.test(categoria))fail('Categoria de documento inválida.');

      const part=await req.file();
      if(!part)fail('Selecione um arquivo.');
      if(!ALLOWED_MIME.has(part.mimetype))fail('Envie PDF, JPEG, PNG, WebP ou DOCX.');
      const buffer=await part.toBuffer();
      if(!buffer.length)fail('O arquivo está vazio.');
      if(buffer.length>15*1024*1024)fail('O arquivo excede 15 MB.');

      const documentId=id('DOC');
      objectName='pessoas/'+person.id+'/'+documentId+'_'+safeName(part.filename);
      const hash=crypto.createHash('sha256').update(buffer).digest('hex');
      await storage.bucket(BUCKET).file(objectName).save(buffer,{
        resumable:false,
        metadata:{
          contentType:part.mimetype,
          cacheControl:'private,max-age=0,no-store',
          metadata:{pessoaId:person.id,categoria,documentId}
        }
      });

      const result=await tx(async c=>{
        const after=(await c.query(
          `INSERT INTO documentos
           (id,versao,criado_em,alterado_em,usuario_email,atendimento_id,categoria,file_id,url,nome,hash,mime,
            substitui_id,vigente,vencimento,terceiro,conferido,declaracao_terceiro,processo_completo,
            anexo_presente,rogo,testemunhas,observacoes)
           VALUES($1,1,now(),now(),$2,$3,$4,$5,'',$6,$7,$8,NULL,true,$9,$10,false,$11,$12,$13,$14,$15,$16)
           RETURNING *`,
          [
            documentId,req.auth.user.email,'PESSOA:'+person.id,categoria,'gcs:'+objectName,
            part.filename,hash,part.mimetype,
            String(req.query?.vencimento||''),
            String(req.query?.terceiro||'')==='true',
            String(req.query?.declaracaoTerceiro||'')==='true',
            String(req.query?.processoCompleto||'')==='true',
            String(req.query?.anexoPresente||'')==='true',
            String(req.query?.rogo||'')==='true',
            String(req.query?.testemunhas||'')==='true',
            String(req.query?.observacoes||'').slice(0,1000)
          ]
        )).rows[0];
        await audit(c,req.auth.user,'Documentos',documentId,null,after,'UPLOAD');
        return after;
      });
      return reply.code(201).send(result);
    }catch(e){
      if(objectName){try{await storage.bucket(BUCKET).file(objectName).delete({ignoreNotFound:true});}catch{}}
      return reply.code(e.statusCode||400).send({error:'DOCUMENT',message:e.message});
    }
  });

  app.get('/api/v1/documentos/:id/download',{preHandler:requireAuth},async(req,reply)=>{
    const pool=await getPool();
    const doc=(await pool.query('SELECT * FROM documentos WHERE id=$1 AND vigente=true',[req.params.id])).rows[0];
    if(!doc)return reply.code(404).send({error:'NOT_FOUND',message:'Documento não localizado.'});
    if(!String(doc.file_id||'').startsWith('gcs:')){
      if(doc.url)return reply.redirect(doc.url);
      return reply.code(404).send({error:'NOT_FOUND',message:'Arquivo legado indisponível.'});
    }
    const objectName=String(doc.file_id).slice(4);
    reply.header('Content-Type',doc.mime||'application/octet-stream');
    reply.header('Content-Disposition',"inline; filename*=UTF-8''"+encodeURIComponent(doc.nome||'documento'));
    reply.header('Cache-Control','private,no-store');
    return reply.send(storage.bucket(BUCKET).file(objectName).createReadStream());
  });

  app.patch('/api/v1/documentos/:id/conferencia',{preHandler:requireAuth},async(req,reply)=>{
    if(!has(req.auth.user,'conferencia'))return reply.code(403).send({error:'FORBIDDEN',message:'Sem permissão de conferência.'});
    try{
      return await tx(async c=>{
        const before=(await c.query('SELECT * FROM documentos WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
        if(!before)fail('Documento não localizado.',404);
        const after=(await c.query(
          'UPDATE documentos SET conferido=$2,alterado_em=now(),usuario_email=$3,versao=versao+1 WHERE id=$1 RETURNING *',
          [before.id,req.body?.conferido!==false,req.auth.user.email]
        )).rows[0];
        await audit(c,req.auth.user,'Documentos',before.id,before,after,'CONFERIR');
        return after;
      });
    }catch(e){return reply.code(e.statusCode||400).send({error:'DOCUMENT',message:e.message});}
  });

  app.delete('/api/v1/documentos/:id',{preHandler:requireAuth},async(req,reply)=>{
    try{
      const result=await tx(async c=>{
        const before=(await c.query('SELECT * FROM documentos WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
        if(!before)fail('Documento não localizado.',404);
        const personId=String(before.atendimento_id||'').startsWith('PESSOA:')?String(before.atendimento_id).slice(7):'';
        const person=personId?(await c.query('SELECT * FROM pessoas WHERE id=$1',[personId])).rows[0]:null;
        if(!person||!(await canWrite(req.auth.user,person)))fail('Sem permissão para remover este documento.',403);
        const after=(await c.query(
          'UPDATE documentos SET vigente=false,alterado_em=now(),usuario_email=$2,versao=versao+1 WHERE id=$1 RETURNING *',
          [before.id,req.auth.user.email]
        )).rows[0];
        await audit(c,req.auth.user,'Documentos',before.id,before,after,'REMOVER');
        return {before,after};
      });
      if(String(result.before.file_id||'').startsWith('gcs:')){
        try{await storage.bucket(BUCKET).file(String(result.before.file_id).slice(4)).delete({ignoreNotFound:true});}catch{}
      }
      return {ok:true};
    }catch(e){return reply.code(e.statusCode||400).send({error:'DOCUMENT',message:e.message});}
  });

  app.post('/api/v1/pessoas/:id/finalizar',{preHandler:requireAuth},async(req,reply)=>{
    if(!has(req.auth.user,'cadastro'))return reply.code(403).send({error:'FORBIDDEN',message:'Sem permissão para concluir cadastros.'});
    try{
      return await tx(async c=>{
        const person=(await c.query('SELECT * FROM pessoas WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
        if(!person)fail('Pessoa não localizada.',404);
        const docs=(await c.query('SELECT * FROM documentos WHERE atendimento_id=$1 AND vigente=true',['PESSOA:'+person.id])).rows;
        const missing=REQUIRED.filter(cat=>!docs.some(d=>d.categoria===cat));
        if(missing.length)fail('Documentos obrigatórios pendentes: '+missing.join(', ')+'.');
        const residence=docs.filter(d=>d.categoria==='RESIDENCIA');
        if(residence.some(d=>d.terceiro&&!d.declaracao_terceiro))fail('Confirme a declaração de residência para comprovante em nome de terceiro.');
        if(residence.some(d=>d.terceiro)&&!docs.some(d=>d.categoria==='IDENTIDADE_TITULAR_RESIDENCIA')){
          fail('Anexe a identidade do titular da residência.');
        }
        const parcelas=Number(person.parcelas_nao_recebidas||0);
        if(!Number.isInteger(parcelas)||parcelas<1||parcelas>4)fail('Informe entre 1 e 4 parcelas não recebidas.');
        const existingProcess=(await c.query("SELECT id FROM processos WHERE pessoa_id=$1 AND COALESCE(numero,'')<>'' LIMIT 1",[person.id])).rows[0];
        if(existingProcess)return {ok:true,mensagem:'A pessoa já possui processo distribuído.',processoId:existingProcess.id};
        let task=(await c.query("SELECT * FROM tarefas WHERE pessoa_id=$1 AND tipo='DISTRIBUICAO_PROCESSO' LIMIT 1",[person.id])).rows[0];
        if(!task){
          task=(await c.query(
            `INSERT INTO tarefas
             (id,versao,criado_em,alterado_em,usuario_email,tipo,pessoa_id,responsavel,situacao,jurisdicao,
              valor_causa,atribuida_em,concluida_em,processo_id,observacoes)
             VALUES($1,1,now(),now(),$2,'DISTRIBUICAO_PROCESSO',$3,'','PENDENTE_ATRIBUICAO',$4,$5,'','','',
                    'Tarefa criada após a conclusão do cadastro no ambiente Cloud.')
             RETURNING *`,
            [id('TAR'),req.auth.user.email,person.id,person.jurisdicao||'',String(parcelas*1518)]
          )).rows[0];
          await audit(c,req.auth.user,'Tarefas',task.id,null,task,'CRIAR');
        }
        return {ok:true,tarefaDistribuicao:task.id,mensagem:'Cadastro conferido e encaminhado para a fila de distribuição.'};
      });
    }catch(e){return reply.code(e.statusCode||400).send({error:'FINALIZE',message:e.message});}
  });
}
