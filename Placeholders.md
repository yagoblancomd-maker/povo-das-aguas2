# Placeholders da minuta — Seguro-Defeso 2025

**O sistema mantém os sete marcadores obrigatórios e passa a aceitar <<JURISDIÇÃO>> ou <<JURISDICAO>>, preenchidos a partir de Pessoas.jurisdicao. A jurisdição é calculada automaticamente pelo município de residência. O usuário não digita esse valor nem o valor da causa.**

| Marcador | Origem | Regra |
| --- | --- | --- |
| **`<<JURISDIÇÃO>>` ou `<<JURISDICAO>>`** | **Pessoas.jurisdicao** | **PELOTAS, RIO GRANDE ou CAPÃO DA CANOA, conforme município cadastrado e UF RS** |
| `<<NOME_COMPLETO>>` | Pessoas.nome | Nome integral |
| `<<CPF>>` | Pessoas.cpf | CPF com máscara 000.000.000-00 |
| `<<ENDERECO>>` | Pessoas.tipoVia, via, numero, complemento, bairro | Endereço completo |
| `<<CIDADE_UF>>` | Pessoas.cidade, uf | Cidade/UF |
| `<<TELEFONE>>` | Pessoas.telefone | Telefone informado no cadastro |
| `<<PARCELAS_NAO_RECEBIDAS>>` | Pessoas.parcelasNaoRecebidas | 1 (uma), 2 (duas), 3 (três) ou 4 (quatro) parcelas |
| `<<VALOR_CAUSA>>` | cálculo automático | quantidade de parcelas × R$ 1.518,00 |

## Cálculo do Seguro-Defeso 2025

Cada parcela corresponde a um salário mínimo de R$ 1.518,00:

- 1 parcela: R$ 1.518,00
- 2 parcelas: R$ 3.036,00
- 3 parcelas: R$ 4.554,00
- 4 parcelas: R$ 6.072,00

O cálculo é executado novamente no servidor. O valor enviado pelo navegador não é utilizado como fonte de verdade.

## Compatibilidade com modelos antigos

Ao enviar o DOCX em Administração, o sistema converte o arquivo para Google Docs e normaliza automaticamente os seguintes marcadores antigos:

- `<<NOME COMPLETO>>` → `<<NOME_COMPLETO>>`
- `<<ENDEREÇO>>` → `<<ENDERECO>>`
- `<<CIDADE>>` → `<<CIDADE_UF>>`
- `<<PARCELAS QUE NÃO RECEBEU>>` → `<<PARCELAS_NAO_RECEBIDAS>>`
- `<<##VALOR>>` → `<<VALOR_CAUSA>>`

**O modelo continua exigindo os sete marcadores anteriores. O marcador adicional de jurisdição é reconhecido com ou sem acento; os demais marcadores desconhecidos continuam bloqueados. Modelos antigos sem esse marcador continuam compatíveis. Município/UF sem jurisdição definida bloqueia a geração.**

## Fluxo de geração

No cadastro de Pessoas, a ordem é:

1. gravar todos os dados da pessoa;
2. criar ou localizar a pasta `NOME - CPF`;
3. gravar e confirmar todos os documentos selecionados;
4. se algum upload falhar, preservar o que já foi confirmado e não gerar a minuta;
5. somente após todos os uploads concluídos, gerar `MINUTA.NOME` na pasta da pessoa.

Falha na geração da minuta não desfaz o cadastro nem os documentos já confirmados.

O modelo ativo fica na pasta `MODELOS` da raiz do Povo das Águas. A interface de Administração recebe um DOCX, converte-o para Google Docs e ativa o modelo automaticamente; não é necessário copiar ou informar IDs do Drive manualmente.


**O campo Município já existente recebe os 36 municípios informados. A coluna jurisdicao é acrescentada ao final de Pessoas, preservando as colunas anteriores, inclusive parcelasNaoRecebidas. Ao abrir a versão atualizada do aplicativo, os cadastros antigos recebem a jurisdição correspondente e a lista de municípios salva é atualizada. As alterações dos registros recebem auditoria e os atendimentos afetados voltam à preparação para nova conferência. A atualização é idempotente.**
