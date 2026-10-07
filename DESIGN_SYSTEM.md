# Sistema visual — Povo das Águas

## Direção

O Povo das Águas não deve parecer um produto SaaS genérico. A identidade visual combina três referências reais do projeto: extensão universitária, atendimento jurídico e comunidades das águas.

A regra principal é simples: se a interface continuar fazendo sentido depois de trocar o nome e o logotipo por outra empresa, a identidade ainda está genérica.

## Princípios

1. Conteúdo antes da decoração.
2. Fotografias reais antes de ilustrações abstratas ou imagens geradas.
3. Tipografia editorial para títulos e tipografia neutra para a operação.
4. Espaço vazio é parte da composição; não preencher o viewport por obrigação.
5. Card somente quando existe contenção semântica. Informação diferente não significa card diferente.
6. Bordas discretas, poucos arredondamentos e sombras apenas quando existe sobreposição real.
7. Uma cor institucional dominante, com acentos pontuais. Evitar arco-íris de badges.
8. Movimento somente para confirmar ação, transição ou estado. Evitar auroras, bolhas, ondas e animações ornamentais.
9. O portal pode ser institucional e humano; a aplicação interna deve ser silenciosa, densa e eficiente.
10. Acessibilidade e legibilidade têm prioridade sobre efeito visual.

## Tokens

- Papel: #F3F0E8
- Branco: #FFFDFA
- Tinta: #18363D
- Mar: #1B5F67
- Mar escuro: #144B51
- Argila: #A75B45
- Linha: #D8D2C7
- Texto secundário: #6A7771
- Sucesso: #3F6C5D
- Erro: #99483C

Títulos institucionais usam Georgia/serif. Interface usa Arial/Helvetica/sans-serif.

## Dimensões

- Largura máxima de conteúdo: 1180px.
- Raio padrão: 4–5px.
- Campos: 36px ou mais.
- Botões: planos, sem gradiente.
- Cabeçalho: compacto.
- Navegação: textual, horizontal e simples.

## Portal

O portal deve comunicar a razão de existir do projeto, não explicar toda a aplicação. Priorizar texto institucional curto, território, pessoas reais e acesso ao sistema. Fotos reais da equipe podem ser exibidas quando disponíveis.

Não usar auroras, bolhas, vetores de rede, ondas decorativas, glows ou ilustrações futuristas para representar água.

## Aplicação

A aplicação é ferramenta de trabalho. Formulários, tabelas, tarefas, documentos e processos devem ter densidade operacional, hierarquia clara e pouca ornamentação. O painel inicial deve apresentar informação e atalhos como conteúdo editorial, não como mosaico de cards.

## Evolução

Novos módulos devem reutilizar as variáveis `--pda-*` definidas em `App_Style.html`. Evitar criar paletas, gradientes, sombras ou raios próprios sem necessidade funcional.


## Direção fotográfica aprovada — V2

A identidade visual aprovada combina gestão profissional, território, fotografia documental e pertencimento. A aplicação deve parecer um produto próprio e maduro, sem voltar ao padrão SaaS genérico e sem cair em minimalismo burocrático.

Regras adicionais:

1. Fotografia real é parte estrutural da interface. Usar água, porto, embarcações, redes, margens e pessoas ligadas às comunidades pesqueiras.
2. Preservar o logo oficial sem redesenhar ou descaracterizar o símbolo.
3. Não criar testemunhos, reportagens, entrevistas, matérias, citações, resultados ou histórias que não existam no projeto.
4. Indicadores, atividades, pessoas, processos e tarefas devem vir do backend real.
5. Clean significa nada desnecessário: pode haver fotografia, textura, profundidade e cor, desde que a leitura seja imediata.
6. Sombras e sobreposições são permitidas para dar materialidade, mas sem glow/neon ou efeitos futuristas gratuitos.
7. Sidebar, topbar, hero fotográfico, superfícies, botões e estados devem manter o mesmo padrão em todos os módulos.
8. Fotografia deve apoiar o contexto e não competir com formulários, tabelas e tarefas.

### Paleta V2

- Mar profundo: #07364B
- Azul petróleo: #0F6673
- Água: #238D8F
- Papel quente: #F4F0E8
- Branco quente: #FFFDFA
- Tinta: #173F51
- Coral/argila: #C65A43
- Areia: #D7B77A
- Sucesso: #2F8B65
- Atenção: #D49A42
- Erro: #C65349

### Ativos fotográficos

Os ativos oficiais da camada visual atual estão em PHOTO_Assets.html:

- --pda-photo-net
- --pda-photo-community
- --pda-photo-boat
- --pda-photo-port
- --pda-photo-channel

Eles devem ser reutilizados em heroes, atalhos visuais e contexto territorial, evitando repetir a mesma imagem em todos os elementos de uma tela.

### Proibições de conteúdo

Não inserir apenas para enriquecer o visual:

- depoimentos fictícios;
- pescadores inventados apresentados como casos reais;
- matérias ou notícias inexistentes;
- citações atribuídas a pessoas;
- números de impacto sem origem no backend;
- logos de órgãos como se houvesse parceria não registrada;
- documentos oficiais falsos apresentados como reais.
