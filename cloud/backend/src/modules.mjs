import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {getPool,tx} from './db.mjs';
import {requireAuth} from './auth.mjs';
import {has,permissions,publicUser,ROLES} from './access.mjs';

const SALARIO_MINIMO_2025=1518;
const TASK_TYPE='DISTRIBUICAO_PROCESSO';
const TASK_PENDING='PENDENTE_ATRIBUICAO';
const TASK_ASSIGNED='ATRIBUIDA';
const TASK_DONE='CONCLUIDA';

const JURISDICOES=Object.freeze({
  PELOTAS:['Amaral Ferrador','Arroio do Padre','Arroio Grande','Canguçu','Capão do Leão','Cerrito','Herval','Jaguarão','Morro Redondo','Pedro Osório','Pelotas','Piratini','São Lourenço do Sul','Turuçu'],
  'RIO GRANDE':['Chuí','Rio Grande','Santa Vitória do Palmar','São José do Norte'],
  'CAPÃO DA CANOA':['Arroio do Sal','Balneário Pinhal','Capão da Canoa','Caraá','Cidreira','Dom Pedro de Alcântara','Imbé','Itati','Mampituba','Maquiné','Morrinhos do Sul','Osório','Terra de Areia','Torres','Tramandaí','Três Cachoeiras','Três Forquilhas','Xangri-lá']
});

const PERMISSION_META=Object.freeze({
  consulta:['Consulta','Visualizar painel, pessoas, fichas, documentos e processos.'],
  cadastro:['Cadastro','Criar novos cadastros.'],
  retificacao:['Retificação','Editar cadastros existentes.'],
  retificacao_propria:['Retificação própria','Editar apenas cadastros criados pelo usuário.'],
  conferencia:['Conferência','Conferir documentos.'],
  minuta:['Minutas','Gerar e revisar minutas.'],
  distribuicao:['Distribuição','Executar tarefas de distribuição.'],
  gestao_distribuicao:['Gestão de distribuição','Atribuir e acompanhar tarefas.'],
  administracao:['Administração','Gerenciar usuários e configurações.']
});

const id=prefix=>prefix+'_'+crypto.randomBytes(14).toString('hex');
const now=()=>new Date().toISOString();
const cpf=v=>String(v||'').replace(/\D/g,'');
const clean=v=>String(v??'').trim();
const sha=v=>crypto.createHash('sha256').update(String(v),'utf8').digest('hex');

function normalizeText(v){
  return clean(v).toUpperCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[–—]/g,'-')
    .replace(/\s*-\s*/g,'-')
    .replace(/\s+/g,' ');
}

function jurisdiction(city,uf='RS'){
  if(clean(uf).toUpperCase()!=='RS')return '';
  const target=normalizeText(city);
  for(const [name,cities] of Object.entries(JURISDICOES)){
    if(cities.some(c=>normalizeText(c)===target))return name;
  }
  return '';
}

function causeValue(p){
  const n=Number(p?.parcelas_nao_recebidas||0);
  return Number.isFinite(n)&&n>0?n*SALARIO_MINIMO_2025:0;
}

function fail(message,statusCode=400){
  const e=new Error(message);
  e.statusCode=statusCode;
  throw e;
}

function guard(permission){
  return async function(req,reply){
    if(!has(req.auth.user,permission)){
      return reply.code(403).send({error:'FORBIDDEN',message:'Acesso não autorizado.'});
    }
  };
}

async function history(client,user,entity,recordId,before,after,operation){
  await client.query(
    `INSERT INTO historico
      (id,versao,criado_em,alterado_em,usuario_email,entidade,registro_id,antes,depois,operacao)
     VALUES($1,1,now(),now(),$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
    [
      id('HIST'),user.email,entity,recordId,
      JSON.stringify(before||null),JSON.stringify(after||null),operation
    ]
  );
}

function personInput(body,before=null){
  const p={...(before||{})};
  const fields=[
    'nome','nascimento','telefone','tipo_via','via','numero','complemento',
    'bairro','cidade','uf','entidade','outra_entidade','analfabeto',
    'parcelas_nao_recebidas','cep','email'
  ];
  for(const f of fields){
    const camel=f.replace(/_([a-z])/g,(_,x)=>x.toUpperCase());
    if(Object.prototype.hasOwnProperty.call(body,camel))p[f]=clean(body[camel]);
    else if(Object.prototype.hasOwnProperty.call(body,f))p[f]=clean(body[f]);
  }
  p.cpf=cpf(body.cpf??p.cpf);
  if(!p.nome)fail('Informe o nome.');
  if(p.cpf.length!==11)fail('Informe um CPF com 11 dígitos.');
  if(!p.cidade)fail('Informe o município.');
  p.uf=clean(p.uf||'RS').toUpperCase();
  p.jurisdicao=jurisdiction(p.cidade,p.uf);
  const parcelas=Number(p.parcelas_nao_recebidas||0);
  if(parcelas&&(!Number.isInteger(parcelas)||parcelas<1||parcelas>4)){
    fail('As parcelas não recebidas devem estar entre 1 e 4.');
  }
  return p;
}

async function personCanEdit(user,person){
  if(has(user,'retificacao'))return true;
  if(has(user,'retificacao_propria')){
    return String(person.criado_por||person.usuario_email||'').toLowerCase()===
      String(user.email||'').toLowerCase();
  }
  return false;
}

async function dashboard(user){
  const pool=await getPool();
  const [peopleR,docsR,processR,histR,tasksR]=await Promise.all([
    pool.query('SELECT * FROM pessoas ORDER BY criado_em DESC'),
    pool.query('SELECT * FROM documentos WHERE vigente=true'),
    pool.query('SELECT * FROM processos ORDER BY COALESCE(NULLIF(distribuido_em,''),criado_em::text) DESC'),
    pool.query('SELECT * FROM historico ORDER BY COALESCE(alterado_em,criado_em) DESC LIMIT 7'),
    pool.query(
      `SELECT * FROM tarefas WHERE tipo=$1 AND situacao<>$2 AND lower(COALESCE(responsavel,''))=lower($3)`,
      [TASK_TYPE,TASK_DONE,user.email]
    )
  ]);
  const people=peopleR.rows,docs=docsR.rows,processes=processR.rows;
  const peopleById=new Map(people.map(p=>[p.id,p]));
  const docsById=new Map(docs.map(d=>[d.id,d]));
  const jurisdictions={};
  for(const p of people){
    const key=p.jurisdicao||'NÃO DEFINIDA';
    jurisdictions[key]=(jurisdictions[key]||0)+1;
  }
  const activities=histR.rows.map(h=>{
    let descricao=h.entidade? h.entidade+' atualizado':'Registro atualizado';
    if(h.entidade==='Pessoas'){
      const p=peopleById.get(h.registro_id);
      descricao=p?'Cadastro atualizado · '+p.nome:'Cadastro de pessoa atualizado';
    }else if(h.entidade==='Documentos'){
      const d=docsById.get(h.registro_id);
      descricao=d?'Documento atualizado · '+(d.nome||d.categoria||'documento'):'Documento atualizado';
    }else if(h.entidade==='Processos')descricao='Processo judicial atualizado';
    else if(h.entidade==='Usuarios')descricao='Usuário e permissões atualizados';
    else if(h.entidade==='Configuracoes')descricao='Configuração do sistema atualizada';
    return {
      id:h.id,entidade:h.entidade,registroId:h.registro_id,
      data:h.alterado_em||h.criado_em,usuario:h.usuario_email||'',descricao
    };
  });
  return {
    atualizadoEm:now(),
    pessoas:people.length,
    documentos:docs.length,
    aConferir:docs.filter(d=>!d.conferido).length,
    iniciais:docs.filter(d=>d.categoria==='INICIAL_SEGURO_DEFESO_2025').length,
    relatorios:docs.filter(d=>d.categoria==='RELATORIO_SEGURO_DEFESO_2025').length,
    acoesTramitacao:processes.length,
    minhasTarefas:tasksR.rows.length,
    valorCausas:people.reduce((a,p)=>a+causeValue(p),0),
    valorCausasTramitacao:processes.reduce((a,p)=>a+causeValue(peopleById.get(p.pessoa_id)),0),
    jurisdicoes:jurisdictions,
    ultimosCadastros:people.slice(0,6).map(p=>({
      id:p.id,nome:p.nome,cpf:p.cpf,cidade:p.cidade,jurisdicao:p.jurisdicao,
      criadoEm:p.criado_em,
      documentos:docs.filter(d=>d.atendimento_id==='PESSOA:'+p.id).length
    })),
    atividades:activities
  };
}

function taskSummary(row){
  return {
    id:row.id,versao:row.versao,pessoaId:row.pessoa_id,pessoa:row.pessoa,
    cpf:row.cpf||'',cidade:row.cidade||'',jurisdicao:row.jurisdicao||row.pessoa_jurisdicao||'',
    valorCausa:Number(row.valor_causa||0),responsavel:row.responsavel||'',
    responsavelNome:row.responsavel_nome||'',situacao:row.situacao,
    criadoEm:row.criado_em,atribuidaEm:row.atribuida_em,concluidaEm:row.concluida_em,
    processoId:row.processo_id||''
  };
}

const TASK_JOIN=`
 SELECT t.*,p.nome pessoa,p.cpf,p.cidade,p.jurisdicao pessoa_jurisdicao,
        COALESCE(u.nome,u.email) responsavel_nome
 FROM tarefas t
 LEFT JOIN pessoas p ON p.id=t.pessoa_id
 LEFT JOIN usuarios u ON lower(u.email)=lower(t.responsavel)
`;

export async function coreRoutes(app){
  app.get('/api/v1/dashboard',{preHandler:[requireAuth,guard('consulta')]},
    async req=>dashboard(req.auth.user));

  app.get('/api/v1/dossie/:id',{preHandler:[requireAuth,guard('consulta')]},async(req,reply)=>{
    const pool=await getPool();
    const person=(await pool.query('SELECT * FROM pessoas WHERE id=$1',[req.params.id])).rows[0];
    if(!person)return reply.code(404).send({error:'NOT_FOUND',message:'Pessoa não localizada.'});
    const owner='PESSOA:'+person.id;
    const [docs,atend,processes,tasks]=await Promise.all([
      pool.query('SELECT * FROM documentos WHERE atendimento_id=$1 ORDER BY criado_em DESC',[owner]),
      pool.query('SELECT * FROM atendimentos WHERE pessoa_id=$1 ORDER BY criado_em DESC',[person.id]),
      pool.query('SELECT * FROM processos WHERE pessoa_id=$1 ORDER BY criado_em DESC',[person.id]),
      pool.query('SELECT * FROM tarefas WHERE pessoa_id=$1 ORDER BY criado_em DESC',[person.id])
    ]);
    return {pessoa:person,documentos:docs.rows,atendimentos:atend.rows,processos:processes.rows,tarefas:tasks.rows};
  });

  app.post('/api/v1/pessoas',{preHandler:[requireAuth,guard('cadastro')]},async(req,reply)=>{
    try{
      const user=req.auth.user;
      const p=personInput(req.body||{});
      const result=await tx(async c=>{
        const duplicate=(await c.query('SELECT id FROM pessoas WHERE cpf=$1',[p.cpf])).rows[0];
        if(duplicate)fail('CPF já cadastrado.',409);
        const row={
          id:id('PES'),versao:1,criado_em:now(),alterado_em:now(),usuario_email:user.email,
          ...p,criado_por:user.email
        };
        const cols=['id','versao','criado_em','alterado_em','usuario_email','nome','cpf','nascimento','telefone','tipo_via','via','numero','complemento','bairro','cidade','uf','entidade','outra_entidade','analfabeto','parcelas_nao_recebidas','jurisdicao','cep','email','criado_por'];
        const vals=cols.map(k=>row[k]??null);
        const q=await c.query(
          `INSERT INTO pessoas(${cols.join(',')}) VALUES(${vals.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,
          vals
        );
        await history(c,user,'Pessoas',row.id,null,q.rows[0],'CRIAR');
        return q.rows[0];
      });
      return reply.code(201).send(result);
    }catch(e){return reply.code(e.statusCode||400).send({error:'VALIDATION',message:e.message});}
  });

  app.put('/api/v1/pessoas/:id',{preHandler:requireAuth},async(req,reply)=>{
    try{
      const user=req.auth.user;
      const result=await tx(async c=>{
        const before=(await c.query('SELECT * FROM pessoas WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
        if(!before)fail('Pessoa não localizada.',404);
        if(!(await personCanEdit(user,before)))fail('Você não possui permissão para retificar este cadastro.',403);
        const expected=Number(req.body?.versao);
        if(expected&&expected!==Number(before.versao))fail('Este cadastro foi alterado por outra pessoa. Recarregue antes de salvar.',409);
        const p=personInput(req.body||{},before);
        const dup=(await c.query('SELECT id FROM pessoas WHERE cpf=$1 AND id<>$2',[p.cpf,before.id])).rows[0];
        if(dup)fail('CPF já cadastrado em outra pessoa.',409);
        const q=await c.query(
          `UPDATE pessoas SET
            versao=versao+1,alterado_em=now(),usuario_email=$2,nome=$3,cpf=$4,nascimento=$5,
            telefone=$6,tipo_via=$7,via=$8,numero=$9,complemento=$10,bairro=$11,cidade=$12,uf=$13,
            entidade=$14,outra_entidade=$15,analfabeto=$16,parcelas_nao_recebidas=$17,jurisdicao=$18,
            cep=$19,email=$20
           WHERE id=$1 RETURNING *`,
          [before.id,user.email,p.nome,p.cpf,p.nascimento,p.telefone,p.tipo_via,p.via,p.numero,p.complemento,
           p.bairro,p.cidade,p.uf,p.entidade,p.outra_entidade,p.analfabeto,p.parcelas_nao_recebidas,p.jurisdicao,p.cep,p.email]
        );
        await c.query(
          `UPDATE tarefas SET jurisdicao=$2,valor_causa=$3,alterado_em=now(),versao=versao+1
             WHERE pessoa_id=$1 AND tipo=$4 AND situacao<>$5`,
          [before.id,p.jurisdicao,String(causeValue(p)),TASK_TYPE,TASK_DONE]
        );
        await history(c,user,'Pessoas',before.id,before,q.rows[0],'ATUALIZAR');
        return q.rows[0];
      });
      return result;
    }catch(e){return reply.code(e.statusCode||400).send({error:'VALIDATION',message:e.message});}
  });

  app.get('/api/v1/tarefas/minhas',{preHandler:[requireAuth,guard('distribuicao')]},async req=>{
    const pool=await getPool();
    const rows=(await pool.query(
      TASK_JOIN+` WHERE t.tipo=$1 AND lower(COALESCE(t.responsavel,''))=lower($2)
                   ORDER BY (t.situacao=$3),COALESCE(t.alterado_em,t.criado_em) DESC`,
      [TASK_TYPE,req.auth.user.email,TASK_DONE]
    )).rows.map(taskSummary);
    return {email:req.auth.user.email,pendentes:rows.filter(x=>x.situacao!==TASK_DONE),concluidas:rows.filter(x=>x.situacao===TASK_DONE)};
  });

  app.get('/api/v1/distribuicao',{preHandler:[requireAuth,guard('gestao_distribuicao')]},async()=>{
    const pool=await getPool();
    const [tasksR,usersR]=await Promise.all([
      pool.query(TASK_JOIN+` WHERE t.tipo=$1
        ORDER BY (t.situacao=$2),COALESCE(t.alterado_em,t.criado_em) DESC`,[TASK_TYPE,TASK_DONE]),
      pool.query('SELECT * FROM usuarios WHERE ativo=true ORDER BY COALESCE(nome,email)')
    ]);
    const tasks=tasksR.rows.map(taskSummary);
    const users=usersR.rows.filter(u=>has(u,'distribuicao')).map(u=>({
      id:u.id,nome:u.nome||u.email,funcao:u.funcao||'',email:u.email,perfil:u.perfil
    }));
    return {
      tarefas:tasks,usuarios:users,
      indicadores:{
        semResponsavel:tasks.filter(x=>x.situacao===TASK_PENDING).length,
        atribuidas:tasks.filter(x=>x.situacao===TASK_ASSIGNED).length,
        concluidas:tasks.filter(x=>x.situacao===TASK_DONE).length
      }
    };
  });

  app.patch('/api/v1/distribuicao/:id/atribuir',{preHandler:[requireAuth,guard('gestao_distribuicao')]},async(req,reply)=>{
    try{
      const email=clean(req.body?.responsavel).toLowerCase();
      if(!email)fail('Selecione um responsável.');
      return await tx(async c=>{
        const responsible=(await c.query('SELECT * FROM usuarios WHERE lower(email)=lower($1) AND ativo=true',[email])).rows[0];
        if(!responsible||!has(responsible,'distribuicao'))fail('O usuário selecionado não pode executar distribuições.');
        const before=(await c.query('SELECT * FROM tarefas WHERE id=$1 AND tipo=$2 FOR UPDATE',[req.params.id,TASK_TYPE])).rows[0];
        if(!before)fail('Tarefa não localizada.',404);
        if(before.situacao===TASK_DONE)fail('A tarefa já foi concluída.');
        const after=(await c.query(
          `UPDATE tarefas SET responsavel=$2,situacao=$3,atribuida_em=now(),alterado_em=now(),
             usuario_email=$4,versao=versao+1 WHERE id=$1 RETURNING *`,
          [before.id,responsible.email,TASK_ASSIGNED,req.auth.user.email]
        )).rows[0];
        await history(c,req.auth.user,'Tarefas',before.id,before,after,'ATRIBUIR');
        return after;
      });
    }catch(e){return reply.code(e.statusCode||400).send({error:'VALIDATION',message:e.message});}
  });

  app.post('/api/v1/distribuicao/:id/concluir',{preHandler:[requireAuth,guard('distribuicao')]},async(req,reply)=>{
    try{
      const numero=clean(req.body?.numero);
      if(!/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(numero)){
        fail('Informe o número CNJ completo do processo.');
      }
      return await tx(async c=>{
        const before=(await c.query('SELECT * FROM tarefas WHERE id=$1 AND tipo=$2 FOR UPDATE',[req.params.id,TASK_TYPE])).rows[0];
        if(!before)fail('Tarefa não localizada.',404);
        const manager=has(req.auth.user,'gestao_distribuicao');
        if(!manager&&String(before.responsavel||'').toLowerCase()!==String(req.auth.user.email).toLowerCase()){
          fail('Esta tarefa não está atribuída a você.',403);
        }
        if(before.situacao===TASK_DONE)fail('A tarefa já foi concluída.');
        const duplicate=(await c.query('SELECT id FROM processos WHERE numero=$1',[numero])).rows[0];
        if(duplicate)fail('Este número de processo já está cadastrado.',409);
        const person=(await c.query('SELECT * FROM pessoas WHERE id=$1',[before.pessoa_id])).rows[0];
        if(!person)fail('Pessoa vinculada não localizada.',404);
        const processId=id('PROC');
        const process=(await c.query(
          `INSERT INTO processos
           (id,versao,criado_em,alterado_em,usuario_email,pessoa_id,atendimento_id,numero,juizo,distribuido_em,responsavel,movimentacoes)
           VALUES($1,1,now(),now(),$2,$3,NULL,$4,$5,now(),$6,'[]'::jsonb) RETURNING *`,
          [processId,req.auth.user.email,person.id,numero,before.jurisdicao||person.jurisdicao||'',req.auth.user.email]
        )).rows[0];
        const task=(await c.query(
          `UPDATE tarefas SET situacao=$2,concluida_em=now(),processo_id=$3,alterado_em=now(),
             usuario_email=$4,versao=versao+1 WHERE id=$1 RETURNING *`,
          [before.id,TASK_DONE,processId,req.auth.user.email]
        )).rows[0];
        await history(c,req.auth.user,'Processos',processId,null,process,'CRIAR');
        await history(c,req.auth.user,'Tarefas',before.id,before,task,'CONCLUIR');
        return {tarefa:task,processo:process};
      });
    }catch(e){return reply.code(e.statusCode||400).send({error:'VALIDATION',message:e.message});}
  });

  app.get('/api/v1/processos',{preHandler:[requireAuth,guard('consulta')]},async()=>{
    const pool=await getPool();
    const q=await pool.query(
      `SELECT pr.*,p.nome pessoa,p.cpf,p.jurisdicao pessoa_jurisdicao
         FROM processos pr LEFT JOIN pessoas p ON p.id=pr.pessoa_id
        ORDER BY COALESCE(NULLIF(pr.distribuido_em,''),pr.criado_em::text) DESC`
    );
    return q.rows.map(pr=>({
      id:pr.id,numero:pr.numero,pessoaId:pr.pessoa_id,pessoa:pr.pessoa||'Pessoa não localizada',
      cpf:pr.cpf||'',jurisdicao:pr.juizo||pr.pessoa_jurisdicao||'',
      distribuidoEm:pr.distribuido_em,responsavel:pr.responsavel
    }));
  });

  app.get('/api/v1/perfil',{preHandler:requireAuth},async req=>({usuario:publicUser(req.auth.user)}));

  app.put('/api/v1/perfil',{preHandler:requireAuth},async(req,reply)=>{
    try{
      const body=req.body||{};
      const name=clean(body.nome).replace(/\s+/g,' ');
      const username=clean(body.nomeUsuario).replace(/\s+/g,' ');
      const newEmail=clean(body.email||req.auth.user.email).toLowerCase();
      if(!name||name.length>140)fail('Informe o nome, com até 140 caracteres.');
      if(!username||username.length>80)fail('Informe o nome de usuário, com até 80 caracteres.');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))fail('E-mail inválido.');
      const result=await tx(async c=>{
        const before=(await c.query('SELECT * FROM usuarios WHERE id=$1 FOR UPDATE',[req.auth.user.id])).rows[0];
        const emailChanged=newEmail!==String(before.email).toLowerCase();
        if(emailChanged){
          const ok=await bcrypt.compare(sha(body.senhaAtual||''),before.senha_hash||'');
          if(!ok)fail('Senha atual incorreta.',401);
          const duplicate=(await c.query('SELECT id FROM usuarios WHERE lower(email)=lower($1) AND id<>$2',[newEmail,before.id])).rows[0];
          if(duplicate)fail('Este e-mail já está em uso.',409);
        }
        const newVersion=Number(before.session_version||0)+(emailChanged?1:0);
        const after=(await c.query(
          `UPDATE usuarios SET nome=$2,nome_usuario=$3,email=$4,session_version=$5,
             alterado_em=now(),versao=versao+1 WHERE id=$1 RETURNING *`,
          [before.id,name,username,newEmail,newVersion]
        )).rows[0];
        if(emailChanged){
          for(const table of ['tarefas','atendimentos','distribuicao','processos']){
            await c.query(`UPDATE ${table} SET responsavel=$2 WHERE lower(COALESCE(responsavel,''))=lower($1)`,[before.email,newEmail]);
          }
          await c.query('UPDATE sessoes SET revogada=true WHERE usuario_id=$1 AND id<>$2',[before.id,req.auth.sessionId]);
          await c.query('UPDATE sessoes SET session_version=$2,usuario_email=$3,alterado_em=now() WHERE id=$1',[req.auth.sessionId,newVersion,newEmail]);
        }
        await history(c,{email:newEmail},'Usuarios',before.id,publicUser(before),publicUser(after),'ATUALIZAR_PERFIL');
        return publicUser(after);
      });
      return {ok:true,usuario:result};
    }catch(e){return reply.code(e.statusCode||400).send({error:'VALIDATION',message:e.message});}
  });

  app.post('/api/v1/perfil/senha',{preHandler:requireAuth},async(req,reply)=>{
    try{
      const current=String(req.body?.senhaAtual??'');
      const next=String(req.body?.novaSenha??'');
      if(!next.length||next.length>200)fail('Informe a nova senha.');
      await tx(async c=>{
        const before=(await c.query('SELECT * FROM usuarios WHERE id=$1 FOR UPDATE',[req.auth.user.id])).rows[0];
        const ok=await bcrypt.compare(sha(current),before.senha_hash||'');
        if(!ok)fail('Senha atual incorreta.',401);
        const hash=await bcrypt.hash(sha(next),12);
        const version=Number(before.session_version||0)+1;
        await c.query(
          `UPDATE usuarios SET senha_hash=$2,senha_salt=$3,senha_algoritmo='bcrypt-sha256-v1',
             session_version=$4,alterado_em=now(),versao=versao+1 WHERE id=$1`,
          [before.id,hash,hash.slice(0,29),version]
        );
        await c.query('UPDATE sessoes SET revogada=true WHERE usuario_id=$1 AND id<>$2',[before.id,req.auth.sessionId]);
        await c.query('UPDATE sessoes SET session_version=$2,alterado_em=now() WHERE id=$1',[req.auth.sessionId,version]);
        await history(c,req.auth.user,'Usuarios',before.id,publicUser(before),{...publicUser(before),versao:Number(before.versao)+1},'ALTERAR_SENHA');
      });
      return {ok:true};
    }catch(e){return reply.code(e.statusCode||400).send({error:'VALIDATION',message:e.message});}
  });

  app.get('/api/v1/admin',{preHandler:[requireAuth,guard('administracao')]},async()=>{
    const pool=await getPool();
    const [usersR,configR]=await Promise.all([
      pool.query('SELECT * FROM usuarios ORDER BY COALESCE(nome,email)'),
      pool.query('SELECT * FROM configuracoes ORDER BY chave')
    ]);
    return {
      usuarios:usersR.rows.map(u=>({...publicUser(u),permissoesEfetivas:permissions(u)})),
      configuracoes:configR.rows,
      perfis:Object.keys(ROLES),
      permissoes:Object.entries(PERMISSION_META).map(([key,[label,descricao]])=>({key,label,descricao}))
    };
  });

  app.put('/api/v1/admin/usuarios/:id',{preHandler:[requireAuth,guard('administracao')]},async(req,reply)=>{
    try{
      const body=req.body||{};
      const result=await tx(async c=>{
        const before=(await c.query('SELECT * FROM usuarios WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
        if(!before)fail('Usuário não localizado.',404);
        const perfil=clean(body.perfil||before.perfil);
        const funcao=clean(body.funcao??before.funcao);
        const ativo=typeof body.ativo==='boolean'?body.ativo:before.ativo;
        const perms=Array.isArray(body.permissoes)?[...new Set(body.permissoes.map(String))]:permissions(before);
        if(!perms.includes('consulta'))perms.unshift('consulta');
        const changedAccess=perfil!==before.perfil||ativo!==before.ativo||JSON.stringify(perms)!==JSON.stringify(permissions(before));
        const sessionVersion=Number(before.session_version||0)+(changedAccess?1:0);
        const after=(await c.query(
          `UPDATE usuarios SET perfil=$2,funcao=$3,ativo=$4,permissoes=$5::jsonb,
             permissoes_versao=permissoes_versao+1,session_version=$6,
             alterado_em=now(),versao=versao+1 WHERE id=$1 RETURNING *`,
          [before.id,perfil,funcao,ativo,JSON.stringify(perms),sessionVersion]
        )).rows[0];
        if(changedAccess)await c.query('UPDATE sessoes SET revogada=true WHERE usuario_id=$1',[before.id]);
        await history(c,req.auth.user,'Usuarios',before.id,publicUser(before),publicUser(after),'ADMIN_ATUALIZAR');
        return publicUser(after);
      });
      return {ok:true,usuario:result};
    }catch(e){return reply.code(e.statusCode||400).send({error:'VALIDATION',message:e.message});}
  });
}
