# Povo das Águas

Esta entrega contém o código-fonte de um projeto independente em Google Apps Script, com cadastro, atendimentos, ficha, documentos, conferência, pendências e minutas. **A pasta-pai configurada é `1wKO6B73R2e-H8E5R_vxRAHmUOIFz3bu7`. Nenhuma pasta ou planilha foi criada na conta Google durante esta entrega.**

O diretório `src` contém os arquivos a importar. `Povo_das_Aguas.json` reúne os mesmos arquivos no formato de exportação usado pelo Salém, com `server_js`, `html` e `json`. O conteúdo `server_js` corresponde a arquivos `.gs`; conteúdo `html` corresponde a arquivos `.html`. **Nunca cole HTML em um arquivo `.gs`.** O editor do Apps Script não importa esse JSON por simples upload; ele serve para automação via API ou ferramentas de importação compatíveis.

A estrutura do arquivo de referência `SALEM 3 (5)(2).json` foi examinada. Foram preservados o padrão de quatro arquivos por módulo e a navegação central, sem reutilizar o banco, as rotinas de negócio ou os identificadores do Salém.

A instalação, o acesso, a aprovação do modelo e o roteiro de homologação estão descritos em `docs/Instalacao.md`. O dicionário das abas está em `docs/Dados.md`. O mapeamento dos marcadores está em `docs/Placeholders.md`. O escopo verificado e suas limitações constam de `docs/Validacao.md`.

O modelo em `modelos/Modelo_ultima_parcela_placeholders.docx` mantém os argumentos e os pedidos do documento fornecido. **As alterações de texto ficam em negrito** e se restringem aos campos variáveis, ao endereçamento e ao espaço que separa o telefone da expressão seguinte. O original também acompanha o pacote, sem alteração. Não houve validação jurídica da fundamentação, dos números, dos precedentes ou dos fatos narrados no modelo.

**O sistema ainda não deve ser apresentado como operacional.** Os testes executados foram locais, com serviços Google simulados. Não houve publicação de aplicativo web, autorização OAuth, criação real de recursos, nem geração nativa de Google Docs nesta conta. O pacote inclui testes reproduzíveis e o roteiro de homologação com dados fictícios.

Para executar os testes locais, na pasta do projeto, use `node tests/server.test.cjs` e `node tests/interface.test.cjs`. Os testes não acessam contas Google e não enviam documentos.


**Atualização de jurisdição: os 36 municípios passam a integrar a lista existente. O cadastro salva automaticamente Pessoas.jurisdicao; a geração aceita <<JURISDIÇÃO>> e <<JURISDICAO>>. A próxima abertura após atualizar o código completa a lista salva, acrescenta a coluna e atualiza os registros existentes. O cálculo de 1 a 4 parcelas e os demais módulos permanecem preservados. Execute node jurisdicoes.test.cjs para verificar os 11 cenários específicos com serviços Google simulados.**
