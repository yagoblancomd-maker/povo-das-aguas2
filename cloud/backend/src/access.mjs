export const MODULES=Object.freeze({
  PAINEL:'Início',PESS:'Novo Cadastro',ACOMP:'Consultar Cadastros',
  DEFESO:'Consultar Defeso 2025',TAREFAS:'Tarefas',MIN:'Minutas',
  DIST:'Atribuir tarefas',PROC:'Processos',PERF:'Meu perfil',ADM:'Administração'
});

export const MODULE_PERMISSION=Object.freeze({
  PAINEL:'consulta',PESS:'cadastro',ACOMP:'consulta',DEFESO:'consulta',
  TAREFAS:'distribuicao',MIN:'minuta',DIST:'gestao_distribuicao',
  PROC:'consulta',PERF:'consulta',ADM:'administracao'
});

export const ROLES=Object.freeze({
  CONSULTA:['consulta'],
  NOVO_USUARIO:['consulta','cadastro'],
  PROFESSOR_RESIDENTE:['consulta','cadastro','retificacao','conferencia','minuta','gestao_distribuicao'],
  COLABORADOR:['consulta','cadastro','retificacao_propria'],
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
export const has=(u,p)=>permissions(u).includes(p);
export function modules(u){
  return Object.fromEntries(Object.entries(MODULES).filter(([code])=>has(u,MODULE_PERMISSION[code]||'consulta')));
}
export function publicUser(u){
  return {
    id:u.id,versao:u.versao,email:u.email,perfil:u.perfil,ativo:u.ativo,
    nome:u.nome||'',funcao:u.funcao||'',nomeUsuario:u.nome_usuario||'',
    permissoes:permissions(u)
  };
}
