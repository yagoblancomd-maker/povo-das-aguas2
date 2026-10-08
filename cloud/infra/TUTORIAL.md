# Publicar o Povo das Águas no Google Cloud

<walkthrough-tutorial-duration duration="10"></walkthrough-tutorial-duration>

## Etapa única

Este procedimento cria uma **nova infraestrutura paralela**. O Apps Script atual não é alterado.

No terminal do Cloud Shell, execute:

```bash
bash cloud/infra/bootstrap-gcp.sh
```

O script fará sozinho:

- criação/seleção do projeto Google Cloud;
- verificação de faturamento;
- ativação das APIs necessárias;
- criação do PostgreSQL no Cloud SQL;
- criação do segredo da senha;
- publicação no Cloud Run;
- autorização de leitura do banco atual;
- cópia dos dados do Google Sheets para PostgreSQL;
- exibição do link final.

### Quando o Google parar o processo

Se aparecer **BILLING_REQUIRED**, abra o endereço mostrado pelo script, habilite/vincule o faturamento e depois execute novamente:

```bash
bash cloud/infra/bootstrap-gcp.sh
```

Se uma tela de autorização do Google aparecer, apenas confirme o acesso solicitado. Essa autorização é usada para ler a planilha atual durante a cópia. A planilha não é alterada.

Ao final aparecerá:

```text
CONCLUÍDO
https://....run.app
```
