# Povo das Águas — migração Google Cloud

Esta branch mantém a nova arquitetura **completamente paralela** ao Apps Script atual.

## Arquitetura

- Cloud Run: aplicação web e API.
- Cloud SQL PostgreSQL: banco transacional.
- Google Drive/Docs: documentos continuam no ecossistema Google.
- Google Sheets atual: somente fonte de migração, sem escrita.
- Firebase Hosting permanece preparado para uma etapa posterior; a primeira publicação serve front-end e API no mesmo Cloud Run para reduzir complexidade.

## Publicação automatizada

O provisionamento está em:

`cloud/infra/bootstrap-gcp.sh`

Ele cria a infraestrutura, publica, localiza o banco atual no Drive e copia os dados para PostgreSQL.

## Segurança da migração

- não altera a `main`;
- não altera o Apps Script;
- não escreve no Google Sheets durante a importação;
- não leva sessões/links de recuperação antigos para o novo banco;
- preserva os hashes de senha `bcrypt-sha256-v1`, permitindo usar a mesma senha no novo sistema.

## Branch

`google-cloud-migration`
