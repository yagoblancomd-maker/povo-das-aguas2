# Povo das Águas — Google Cloud

Migração paralela. Este diretório não substitui nem modifica o Apps Script atual.

Arquitetura-alvo:
- Firebase Hosting: front-end.
- Cloud Run: API.
- Cloud SQL PostgreSQL: banco transacional.
- Google Drive/Docs: arquivos e documentos.
- Google Sheets: somente origem de migração/exportação.

Primeira etapa já preparada:
1. API Cloud Run executável.
2. autenticação compatível com bcrypt-sha256-v1 atual;
3. sessões de 12 horas no PostgreSQL;
4. bootstrap de usuário/permissões/módulos;
5. consulta de Pessoas;
6. schema PostgreSQL;
7. importador inicial Sheets -> PostgreSQL;
8. Firebase Hosting mínimo para validação.

A produção continua no Apps Script até equivalência funcional.
