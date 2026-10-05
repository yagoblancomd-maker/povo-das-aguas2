# Mapeamento do modelo de última parcela

Todos os nove marcadores são obrigatórios. Os campos de endereçamento, seção, valor da causa e local/data são informados no atendimento e dependem da conferência humana. O sistema não infere juízo, competência territorial, valor da causa ou data de distribuição. Não calcula atualização monetária.

| Marcador | Origem | Composição |
| --- | --- | --- |
| `<<ENDERECAMENTO>>` | Atendimentos.enderecamento | Linha completa de endereçamento |
| `<<SECAO_JUDICIARIA>>` | Atendimentos.secaoJudiciaria | Linha completa da seção judiciária |
| `<<NOME_COMPLETO>>` | Pessoas.nome | Nome integral |
| `<<CPF>>` | Pessoas.cpf | Texto com máscara 000.000.000-00 |
| `<<ENDERECO>>` | Pessoas.tipoVia, via, numero, complemento, bairro | Via, número, complemento quando existente e bairro/localidade |
| `<<CIDADE_UF>>` | Pessoas.cidade, uf | Cidade/UF, completando o endereço |
| `<<TELEFONE>>` | Pessoas.telefone | Telefone com DDD informado |
| `<<VALOR_CAUSA>>` | Atendimentos.valorCausa | Número brasileiro com duas casas; R$ permanece no modelo |
| `<<LOCAL_DATA>>` | Atendimentos.localData | Texto informado e conferido |

O resultado conjunto do endereço segue, por exemplo, `Rua Marechal Floriano Peixoto, 105, Ap 101, Centro, Rio Grande/RS`. O complemento é opcional. O campo número aceita `s/n` quando aplicável; não é convertido em número de planilha.

**Alterações no documento:** substituição das duas linhas fixas do endereçamento por marcadores, normalização dos marcadores de nome/endereço/cidade/valor, transformação da linha final em `<<LOCAL_DATA>>` e inserção de espaço após o telefone. Os trechos alterados estão em negrito. Nenhum outro parágrafo ou célula de tabela teve o texto alterado. As assinaturas fixas, a qualificação como pescador(a), o endereço dos procuradores, os pedidos e a fundamentação permanecem como fornecidos, sujeitos à revisão do responsável.

A opção aceita pelo gerador é exclusivamente `Seguro-Defeso 2025` com `Somente a última de 2025`. A seleção de todas as parcelas ou outros casos gera bloqueio, mesmo que o administrador tenha aprovado esse modelo. Para novas hipóteses é necessário implementar seleção de modelos e suas regras específicas, com orientação jurídica.

Cada geração tem um ID e uma versão. O modelo é copiado para a pasta do atendimento; o original não é preenchido. O preenchimento percorre as abas do Google Docs, corpos, cabeçalhos e rodapés, preservando os atributos do texto substituído. Marcadores devem ser texto normal contínuo, não campos em imagens ou desenhos. Ao concluir, não pode restar nenhum marcador no padrão `<<...>>`.

A minuta nasce como AGUARDA_REVISAO. Alterações dos dados da pessoa, do atendimento, da documentação, das pendências ou do modelo sinalizam desatualização. A revisão é registrada com usuário e data e é bloqueada para uma versão desatualizada. Uma nova geração preserva as anteriores. Alterações realizadas diretamente no texto da minuta no Google Docs não são versionadas por esta aplicação; devem ser acompanhadas pelo histórico nativo do Docs e pela revisão jurídica. A auditoria de dados refere-se às operações feitas pelo sistema.
