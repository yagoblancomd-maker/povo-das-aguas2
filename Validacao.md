# Verificação da entrega

**Resultado local:** 27 cenários de servidor e 9 verificações de interface em DOM simulado aprovados. O código de servidor e todos os scripts de interface foram analisados pelo parser JavaScript do Node/V8. O documento parametrizado foi renderizado em 12 páginas e inspecionado visualmente; a comparação do texto confirmou alteração apenas nos cinco parágrafos previstos, com preservação das tabelas. Os registros completos dos testes acompanham esta pasta.

**Não verificado no Google:** instalação real, autorização OAuth, identidade das contas, acesso ao Drive, compartilhamento dos documentos, execução nativa da Sheets API, conversão do DOCX, preenchimento de Google Docs, comportamento em navegador real e desempenho com o volume da equipe. As verificações de interface utilizam um DOM simulado; o navegador Chromium não estava instalado no ambiente de execução. Não há URL de aplicativo publicada nesta entrega.

| Área | Implementado | Evidência local | Verificação Google |
| --- | --- | --- | --- |
| Instalação | Criação e retomada, IDs persistidos, cabeçalhos protegidos | Instalação repetida e após registros existentes | Pendente |
| Pessoas | CPF com dígitos verificadores, texto e zeros iniciais, consulta e retificação | Duplicidade, data, telefone, conflito, histórico | Pendente |
| Atendimentos | Vínculo com pessoa, demanda/referência, outras demandas | Reenvio, colisão e nova referência | Pendente |
| Documentos | Múltiplos arquivos, 5 MB, PDF/JPEG/PNG, substituição e versões | MIME, repetição, falha após Drive, substituição cruzada | Pendente |
| Conferência | Validação humana, terceiro, anexo, procuração a rogo | Anexação insuficiente, 60/61 dias, futuro, testemunhas | Pendente |
| Pendências | Responsável, abertura e resolução, invalidação da conferência | Bloqueio e resolução | Pendente |
| Histórico | Antes/depois, identidade, data e operação | Atualizações e auditoria na transação simulada | Pendente |
| Concorrência | Lock do script e versão esperada | Atualização com versão anterior rejeitada; lock real não simulado | Pendente |
| Minutas | Cópia do modelo, mapa obrigatório, versões e revisão | Modelo certo, placeholders, preservação e desatualização | Pendente |
| Permissões | Validação no servidor e rejeição de identidade vazia | Intruso, consulta e tentativa de gravação | Pendente |
| Interface | Oito módulos carregados sob demanda, busca, formulários | Carregamento e busca em DOM simulado | Pendente em navegador e celular |
| DIST e PROC | Estrutura reservada | Mensagem explícita de etapa futura | Não implementados operacionalmente |

## Roteiro de homologação com dados fictícios

Execute a instalação duas vezes e compare os IDs, as pastas, as abas e os cabeçalhos. Cadastre uma pessoa fictícia com CPF de teste que comece por zero, data válida e telefone com DDD. Confirme o texto do CPF diretamente no banco. Tente duplicar o CPF e informe datas impossíveis, telefone incompleto e a opção Outro sem especificação: o servidor deve rejeitar cada caso. Use uma conta sem autorização e uma conta CONSULTA para confirmar os bloqueios de gravação.

Crie um atendimento, repita a mesma requisição e confirme um único registro. Tente outra operação com a mesma pessoa, demanda e referência: deve ser bloqueada. Registre uma demanda legitimamente distinta com outra referência e confirme o vínculo à mesma pessoa. Abra a ficha em duas janelas, altere na primeira e tente gravar a versão antiga na segunda. A segunda gravação deve informar conflito e conservar a primeira alteração.

Anexe dados fictícios em cada categoria. Confirme a pasta sob a raiz da instalação, os nomes padronizados e os links no banco. Anexe dois arquivos na mesma categoria. Substitua um deles e verifique que o anterior continua no Drive, com vigente=false na planilha. Envie o mesmo conteúdo novamente e confirme ausência de nova cópia vigente. Teste arquivo vazio, acima de 5 MB e com extensão/MIME divergentes do conteúdo.

Teste uma fatura vencida há exatamente 60 dias e outra há 61 dias. A primeira passa na regra temporal; a segunda não. Verifique que a configuração PENDENTE bloqueia o encaminhamento. Teste uma fatura futura com ACEITAR e RECUSAR. Para terceiro, não marque a declaração e confirme bloqueio da conferência final. Repita com analfabetismo, sem uma das verificações da procuração. Processo apenas anexado, sem marcação de completo e anexo, não pode ser concluído como conferido.

Registre pendência com responsável autorizado e confirme o bloqueio. Resolva-a, confira todos os arquivos e conclua a conferência. Gere a minuta somente para a última parcela, verificando cada campo, a formatação, o modelo original intacto e a pasta de destino. Teste modelo com marcador desconhecido e campos obrigatórios vazios. As opções de todas as parcelas e outros casos devem ser recusadas pelo gerador. Retifique um dado utilizado e confirme sinalização de desatualização e preservação do arquivo anterior.

Simule interrupção de rede após anexação e após a resposta de gravação. Mantenha os dados da tentativa e use a mesma sessão para repetir. Confirme que os arquivos concluídos aparecem na ficha e que o envio pode prosseguir. Para testar falha de serviço controlada, use uma cópia de homologação do projeto e da pasta; nunca altere permissões de recursos reais em uso. Compare o histórico, as operações e os objetos no Drive antes de considerar a recuperação aprovada.

Abra todas as telas em computador e celular, usando teclado e leitor de tela quando disponível. Troque de módulo durante leituras lentas e confirme descarte de respostas anteriores. Durante gravações, os botões ficam temporariamente indisponíveis. Revise especialmente a seleção de múltiplos arquivos, os formulários de retificação e os links. O selo de homologação deve ser concedido somente após essas verificações.

## Limites e dependências

**Continuam pendentes:** conta responsável, modalidade de autenticação, lista de usuários e perfis definitivos, anexo, política de rascunhos, política de vencimento futuro, aprovação do modelo e modelos de outras hipóteses. O código fecha os fluxos dependentes quando essas informações faltam. Não cria permissões de compartilhamento automaticamente.

As alterações do aplicativo são atômicas dentro do lote enviado à Sheets API. Drive e Sheets não compartilham transação: se ocorrer falha depois da criação de arquivo e antes da confirmação do banco, a mensagem informa o recurso do Drive e que o registro não está confirmado. Repetir a mesma operação reutiliza o objeto criado. Pastas e arquivos não devem ser renomeados manualmente durante recuperação. Não existe coletor automático de arquivos órfãos; se a sessão for abandonada ou as configurações forem alteradas antes da retomada, a administração deverá reconciliar os recursos pelos IDs, sem apagar versões por suposição.

Os recibos de operação ficam em Operacoes e não devem ser excluídos. A interface mantém apenas identificadores de operação e hashes em sessionStorage; não armazena arquivos nem dados pessoais completos nesse armazenamento. A retomada automática exata usa a mesma sessão e os mesmos parâmetros. Se o navegador for encerrado, consulte a ficha antes de reenviar. Verificações de CPF, demanda/referência e hash do documento oferecem proteção adicional, mas não substituem uma fila persistente de uploads entre dispositivos, que não foi implementada.

As listas e o painel usam os dados do banco, sem números da imagem institucional. A pesquisa de pessoas retorna até 200 resultados por consulta; refine a pesquisa pelo nome ou CPF. A leitura de cada aba é reutilizada dentro da requisição. Ainda é necessário ensaio de volume, cotas e tempo de resposta no Google antes de ampliar a operação. Não existe medição de capacidade realizada em produção.

A auditoria e o controle de concorrência abrangem operações do aplicativo. Edição direta na planilha ou no código por administradores não é interceptada. Alterações de conteúdo diretamente nos arquivos Google Docs devem ser acompanhadas pelo histórico nativo do Google e pela revisão jurídica. O módulo administrativo configura listas e perfis existentes, mas não fornece um editor de regras jurídicas ou de novas máquinas de estados.
