export const MODULES=Object.freeze({
  PAINEL:'Início',
  PESS:'Novo Cadastro',
  ACOMP:'Consultar Cadastros',
  DEFESO:'Consultar Defeso 2025',
  HIST:'Histórico',
  TAREFAS:'Tarefas',
  AGENDA:'Agenda',
  CHAT:'Chat CIDIJUS',
  MENSAGENS:'Mensagens padrão',
  MIN:'Minutas',
  DIST:'Atribuir tarefas',
  PROC:'Processos',
  PERF:'Meu perfil',
  ADM:'Administração'
});

export const MODULE_PERMISSION=Object.freeze({
  PAINEL:'consulta',
  PESS:'cadastro',
  ACOMP:'consulta',
  DEFESO:'consulta',
  HIST:'consulta',
  TAREFAS:'consulta',
  AGENDA:'consulta',
  CHAT:'consulta',
  MENSAGENS:'consulta',
  MIN:'minuta',
  DIST:'gestao_distribuicao',
  PROC:'consulta',
  PERF:'consulta',
  ADM:'administracao'
});

export const ROLES=Object.freeze({
  CONSULTA:['consulta'],
  NOVO_USUARIO:['consulta','cadastro'],
  PROFESSOR_RESIDENTE:['consulta','cadastro','retificacao','conferencia','minuta','gestao_distribuicao'],
  COLABORADOR:['consulta','cadastro','retificacao_propria'],
  COLONIA_PESCADOR:['consulta','cadastro','retificacao_propria','criar_tarefa_entidade'],
  ALUNO:['consulta','distribuicao'],
  CADASTRO:['consulta','cadastro'],
  CONFERENCIA:['consulta','cadastro','retificacao','conferencia'],
  JURIDICO:['consulta','cadastro','retificacao','conferencia','minuta','distribuicao'],
  ADMIN:['consulta','cadastro','retificacao','conferencia','minuta','distribuicao','gestao_distribuicao','administracao']
});

export function permissions(user){
  const parsed=Array.isArray(user.permissoes)?user.permissoes:[...(ROLES[user.perfil]||[])];
  if(!parsed.includes('consulta'))parsed.unshift('consulta');
  return [...new Set(parsed)];
}

export const has=(user,permission)=>permissions(user).includes(permission);
export const isColonyUser=user=>String(user?.perfil||'').toUpperCase()==='COLONIA_PESCADOR';

export function modules(user){
  return Object.fromEntries(
    Object.entries(MODULES)
      .filter(([code])=>has(user,MODULE_PERMISSION[code]||'consulta'))
  );
}

export function publicUser(user){
  return {
    id:user.id,
    versao:user.versao,
    email:user.email,
    perfil:user.perfil,
    ativo:user.ativo,
    nome:user.nome||'',
    funcao:user.funcao||'',
    nomeUsuario:user.nomeUsuario||user.nome_usuario||'',
    entidade:user.entidade||'',
    permissoes:permissions(user)
  };
}
