# Abas, campos e integridade

Todas as entidades usam `id`, `versao`, `criadoEm`, `alteradoEm` e `usuario`. O ID é estável e independe da linha. As datas de auditoria usam ISO 8601; as datas de nascimento e vencimento usam DD/MM/AAAA. A versão aumenta a cada alteração. Os campos são gravados como texto explícito na API Sheets, evitando conversão de CPF, zeros iniciais ou interpretação de fórmulas. Booleanos são representados por `true` e `false`.

Pessoas se relaciona com Atendimentos por pessoaId. Documentos, Pendencias e Minutas se relacionam com Atendimentos por atendimentoId. Processos prevê pessoaId e atendimentoId. Não é permitido substituir o vínculo pessoal de um atendimento existente. A identidade pessoal usa CPF único; a identidade da demanda usa pessoa, tipo e referência informada. Número da linha nunca identifica uma entidade.

## Pessoas

Cadastro único da pessoa. Nome e CPF obrigatórios em qualquer política; demais campos exigidos para encaminhar.

Campos específicos: `nome`, `cpf`, `nascimento`, `telefone`, `tipoVia`, `via`, `numero`, `complemento`, `bairro`, `cidade`, `uf`, `entidade`, `outraEntidade`, `analfabeto`.

## Atendimentos

Demanda, opções de parcelas, responsáveis, preparação, conferência e dados da minuta. revisao é um contador de invalidação; conferencia registra quem concluiu.

Campos específicos: `pessoaId`, `demanda`, `referencia`, `parcelas`, `outrosCasos`, `observacoes`, `responsavel`, `situacao`, `folderId`, `revisao`, `conferencia`, `enderecamento`, `secaoJudiciaria`, `valorCausa`, `localData`.

## Documentos

Arquivos do Drive e metadados. vigente identifica a versão em uso; substituiId vincula a anterior; hash é SHA-256 do conteúdo. Flags registram conferência humana.

Campos específicos: `atendimentoId`, `categoria`, `fileId`, `url`, `nome`, `hash`, `mime`, `substituiId`, `vigente`, `vencimento`, `terceiro`, `conferido`, `declaracaoTerceiro`, `processoCompleto`, `anexoPresente`, `rogo`, `testemunhas`, `observacoes`.

## Pendencias

Exigências e responsáveis, com situação ABERTA ou RESOLVIDA.

Campos específicos: `atendimentoId`, `descricao`, `responsavel`, `situacao`.

## Minutas

Versões geradas. snapshot identifica os dados de origem; templateModified registra a última modificação do modelo; revisão identifica responsável e data.

Campos específicos: `atendimentoId`, `fileId`, `url`, `numero`, `situacao`, `snapshot`, `templateId`, `templateModified`, `revisor`, `revisadaEm`.

## Historico

Auditoria: antes/depois em JSON, entidade, ID e operação. Não é editável pela interface.

Campos específicos: `entidade`, `registroId`, `antes`, `depois`, `operacao`.

## Configuracoes

Chave de configuração e valor serializado em JSON. Alterações auditadas.

Campos específicos: `chave`, `valor`.

## Usuarios

E-mail obtido da conta Google, perfil e estado ativo. Não aceita mudança de e-mail de usuário existente.

Campos específicos: `email`, `perfil`, `ativo`.

## Distribuicao

Reserva para distribuição judicial, sem endpoint de gravação no escopo inicial.

Campos específicos: `atendimentoId`, `processoId`, `numero`, `juizo`, `data`, `responsavel`, `protocoloId`.

## Processos

Reserva para acompanhamento, sem integração com tribunais no escopo inicial.

Campos específicos: `pessoaId`, `atendimentoId`, `numero`, `juizo`, `distribuidoEm`, `responsavel`, `movimentacoes`.

## Operacoes

Recibo idempotente por usuário e identificador de operação, com hash dos parâmetros e resultado. Não contém o arquivo base64.

Campos específicos: `hash`, `resultado`.

## Perfis iniciais

Os perfis abaixo são propostos e dependem de confirmação administrativa. As permissões são verificadas em cada chamada no servidor, inclusive para chamadas feitas fora dos botões da tela. A ausência de e-mail de sessão impede o acesso.

| Perfil | Capacidades |
| --- | --- |
| CONSULTA | consulta |
| CADASTRO | consulta, cadastro |
| CONFERENCIA | consulta, cadastro, retificacao, conferencia |
| JURIDICO | consulta, cadastro, retificacao, conferencia, minuta |
| ADMIN | consulta, cadastro, retificacao, conferencia, minuta, administracao |

O perfil CADASTRO pode criar pessoas e atendimentos, anexar documentos e encaminhar para conferência. Alteração de pessoa ou atendimento existente exige retificacao. CONFERENCIA pode retificar, gerenciar pendências e conferir; JURIDICO também gera e revisa minutas. ADMIN pode administrar configurações e usuários, sem remover seu próprio acesso administrativo pela interface. Os documentos do Drive seguem também as permissões nativas da conta e das pastas.

## Arquivos compartilhados

`00_Config.gs` contém constantes, esquema e configurações iniciais. `01_Dados.gs` realiza leitura, validação de versões e lotes transacionais com histórico. `02_Acesso.gs` verifica identidade e permissões e fornece o lock. `03_Instalacao.gs` instala e retoma recursos. `04_Validacao.gs` contém regras comuns. `05_Drive.gs` salva e recupera arquivos e pastas. `06_Modulos.gs` registra módulos e expõe a API controlada. As demais funções internas usam sufixo `_`, impedindo invocação direta por google.script.run.

`Index.html` fornece navegação e área de conteúdo. `App_Style.html` e `App_Script.html` fornecem estilos e componentes compartilhados. `Logo.html` incorpora o logo fornecido, sem chamadas a serviços externos. Cada um dos módulos PAINEL, PESS, ATEND, ACOMP, MIN, ADM, DIST e PROC contém os quatro arquivos Modulo.gs, Style.html, View.html e Script.html. O script de cada módulo monta sua tela com os componentes compartilhados. A troca de tela remove o DOM anterior e seus eventos, e as respostas assíncronas são vinculadas à geração da navegação.
