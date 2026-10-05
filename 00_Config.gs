/** Projeto independente. Não reutiliza IDs nem dados do Salém. */
const PDA = Object.freeze({
  parent:'10alyWnpE3WW3Q-Q0PeZ2RsSZvpAkEubR',
  name:'Povo das Águas',
  tz:'America/Sao_Paulo',
  maxBytes:5*1024*1024
});

const SEGURO_DEFESO_2025 = Object.freeze({
  salarioMinimo:1518.00,
  minParcelas:1,
  maxParcelas:4,
  modeloNome:'INICIAL - SEGURO DEFESO 2025'
});

const SCHEMA = Object.freeze({
  Pessoas:[
    'nome','cpf','nascimento','telefone','tipoVia','via','numero','complemento',
    'bairro','cidade','uf','entidade','outraEntidade','analfabeto',
    'parcelasNaoRecebidas','jurisdicao','cep','email','criadoPor'
  ],
  Atendimentos:[
    'pessoaId','demanda','referencia','parcelas','outrosCasos','observacoes',
    'responsavel','situacao','folderId','revisao','conferencia','enderecamento',
    'secaoJudiciaria','valorCausa','localData'
  ],
  Documentos:[
    'atendimentoId','categoria','fileId','url','nome','hash','mime','substituiId',
    'vigente','vencimento','terceiro','conferido','declaracaoTerceiro',
    'processoCompleto','anexoPresente','rogo','testemunhas','observacoes'
  ],
  Pendencias:['atendimentoId','descricao','responsavel','situacao'],
  Minutas:[
    'atendimentoId','fileId','url','numero','situacao','snapshot','templateId',
    'templateModified','revisor','revisadaEm','pdfFileId','pdfUrl'
  ],
  Historico:['entidade','registroId','antes','depois','operacao'],
  Configuracoes:['chave','valor'],
  Usuarios:['email','perfil','ativo','nome','funcao','permissoes','permissoesVersao'],
  Distribuicao:['atendimentoId','processoId','numero','juizo','data','responsavel','protocoloId'],
  Tarefas:[
    'tipo','pessoaId','responsavel','situacao','jurisdicao','valorCausa',
    'atribuidaEm','concluidaEm','processoId','observacoes'
  ],
  Processos:['pessoaId','atendimentoId','numero','juizo','distribuidoEm','responsavel','movimentacoes'],
  Operacoes:['hash','resultado']
});

const COMMON=['id','versao','criadoEm','alteradoEm','usuario'];

const JURISDICOES = Object.freeze({
 'PELOTAS':['Amaral Ferrador','Arroio do Padre','Arroio Grande','Canguçu','Capão do Leão','Cerrito','Herval','Jaguarão','Morro Redondo','Pedro Osório','Pelotas','Piratini','São Lourenço do Sul','Turuçu'],
 'RIO GRANDE':['Chuí','Rio Grande','Santa Vitória do Palmar','São José do Norte'],
 'CAPÃO DA CANOA':['Arroio do Sal','Balneário Pinhal','Capão da Canoa','Caraá','Cidreira','Dom Pedro de Alcântara','Imbé','Itati','Mampituba','Maquiné','Morrinhos do Sul','Osório','Terra de Areia','Torres','Tramandaí','Três Cachoeiras','Três Forquilhas','Xangri-lá']
});
const LEGACY_ENTIDADES_PADRAO=Object.freeze([
  'COPAPEL — COLÔNIA DOS PESCADORES E AQUICULTORES PROFISSIONAIS ARTESANAIS DE PELOTAS',
  'COLÔNIA Z-1',
  'COLÔNIA Z-2',
  'COLÔNIA Z-3',
  'COLÔNIA Z-11',
  'Outro'
]);

const ENTIDADES_PADRAO=Object.freeze([
  'COPAPEL',
  'RIG - COLÔNIA Z-1',
  'SJN - COLÔNIA Z-2',
  'PEL - COLÔNIA Z-3',
  'SLS - COLÔNIA Z-8',
  'TAV - COLÔNIA Z-11',
  'AGR - COLÔNIA Z-24',
  'Outro'
]);

const DEFAULTS={
  rascunhos:'PENDENTE',
  vencimentoFuturo:'PENDENTE',
  anexoOrientacao:'',
  templateId:'',
  templateAprovado:false,
  entidades:Array.from(ENTIDADES_PADRAO),
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
};

const ROLES={
  CONSULTA:['consulta'],
  NOVO_USUARIO:['consulta','cadastro'],
  PROFESSOR_RESIDENTE:[
    'consulta','cadastro','retificacao','conferencia','minuta','gestao_distribuicao'
  ],
  COLABORADOR:[
    'consulta','cadastro','retificacao_propria'
  ],
  ALUNO:[
    'consulta','distribuicao'
  ],
  CADASTRO:['consulta','cadastro'],
  CONFERENCIA:['consulta','cadastro','retificacao','conferencia'],
  JURIDICO:[
    'consulta','cadastro','retificacao','conferencia','minuta','distribuicao'
  ],
  ADMIN:[
    'consulta','cadastro','retificacao','conferencia','minuta',
    'distribuicao','gestao_distribuicao','administracao'
  ]
};

const PERMISSIONS=Object.freeze({
  consulta:{
    label:'Consulta',
    descricao:'Visualizar painel, pessoas, fichas, documentos e processos sem alterar registros.'
  },
  cadastro:{
    label:'Cadastro',
    descricao:'Criar novas pessoas, anexar documentos durante a inclusão e concluir novos cadastros. Não é necessária para editar registros já existentes.'
  },
  retificacao:{
    label:'Retificação',
    descricao:'Editar pessoas já gravadas, corrigir dados existentes e excluir documentos quando permitido. Funciona independentemente da permissão Cadastro.'
  },
  retificacao_propria:{
    label:'Retificação dos próprios cadastros',
    descricao:'Editar e corrigir somente pessoas que foram cadastradas pelo próprio usuário. Não autoriza alterações em cadastros criados por outras pessoas.'
  },
  conferencia:{
    label:'Conferência',
    descricao:'Conferir documentos e registrar validações no cadastro da pessoa.'
  },
  minuta:{
    label:'Minutas jurídicas',
    descricao:'Acessar o módulo de minutas, gerar novas versões e registrar revisão jurídica.'
  },
  distribuicao:{
    label:'Distribuir processos',
    descricao:'Receber tarefas individuais de distribuição, acessar os documentos da pessoa e concluir a tarefa informando o número do processo no TRF4.'
  },
  gestao_distribuicao:{
    label:'Gerenciar distribuição',
    descricao:'Atribuir e reatribuir tarefas de distribuição entre usuários autorizados e acompanhar a fila de trabalho.'
  },
  administracao:{
    label:'Administração',
    descricao:'Gerenciar usuários, perfis, APIs, configurações e o modelo oficial da petição.'
  }
});

const ROLE_DESCRIPTIONS=Object.freeze({
  CONSULTA:'Acesso somente para consulta das informações já registradas.',
  NOVO_USUARIO:'Perfil legado de primeiro acesso com Consulta e Cadastro.',
  PROFESSOR_RESIDENTE:'Professor ou Residente. Após aprovação funcional, recebe todas as permissões operacionais, exceto Administração e Distribuir processos. No autocadastro inicia somente com Consulta e Cadastro.',
  COLABORADOR:'Consulta, Cadastro e Retificação limitada aos cadastros criados pelo próprio colaborador.',
  ALUNO:'Consulta e Distribuir processos, para receber e concluir tarefas de distribuição atribuídas ao aluno.',
  CADASTRO:'Consulta e inclusão de pessoas e documentos.',
  CONFERENCIA:'Cadastro, retificação e conferência documental.',
  JURIDICO:'Conferência e atividades jurídicas, incluindo minutas e execução de tarefas de distribuição.',
  ADMIN:'Acesso integral ao sistema, gestão da distribuição e configurações administrativas.'
});

function props_(){
  return PropertiesService.getScriptProperties();
}

function fail_(message){
  throw new Error(message);
}

function required_(v,label){
  if(v===undefined||v===null||String(v).trim()==='')fail_('Informe '+label+'.');
  return v;
}

function uid_(){
  return Utilities.getUuid();
}

function hash_(value){
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    typeof value==='string'?value:JSON.stringify(value)
  ).map(x=>('0'+((x+256)%256).toString(16)).slice(-2)).join('');
}

function id_(prefix,key){
  return prefix+'_'+hash_(key).slice(0,28);
}

function now_(){
  return new Date().toISOString();
}

function bool_(v){
  return v===true||v==='true';
}

function clone_(v){
  return JSON.parse(JSON.stringify(v));
}

function cfg_(){
  const c=clone_(DEFAULTS);

  all_('Configuracoes').forEach(r=>{
    c[r.chave]=JSON.parse(r.valor);
  });

  if(
    JSON.stringify(c.entidades)===
    JSON.stringify(Array.from(LEGACY_ENTIDADES_PADRAO))
  ){
    c.entidades=Array.from(ENTIDADES_PADRAO);
  }

  c.municipios=municipiosComJurisdicao_(c.municipios);
  return c;
}
