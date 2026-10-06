# Provisionamento

A versão atual do Apps Script permanece intacta.

## Google Cloud

Defina um projeto com faturamento habilitado e região `southamerica-east1`.

Ative:
- Cloud Run
- Cloud SQL Admin
- Secret Manager
- Artifact Registry
- Cloud Build

Crie um Cloud SQL PostgreSQL, database `povo_das_aguas` e usuário `povo_app`.

Aplique:
`cloud/backend/sql/001_initial_schema.sql`

Crie o segredo da senha do banco no Secret Manager.

## Backend local

```bash
cd cloud/backend
cp .env.example .env
npm install
npm start
```

Endpoints iniciais:
- GET /healthz
- GET /readyz
- POST /api/v1/auth/login
- GET /api/v1/auth/session
- POST /api/v1/auth/logout
- GET /api/v1/bootstrap
- GET /api/v1/pessoas
- GET /api/v1/pessoas/:id

## Importação inicial

Dê à identidade executora acesso de leitura à planilha atual, preencha
`SPREADSHEET_ID` e execute:

```bash
npm run import:sheets
```

Nesta primeira etapa são copiados Pessoas, Configurações, Usuários e Sessões.
O importador não escreve no Sheets.

## Firebase Hosting

Use `cloud/frontend/firebase.json`. O rewrite `/api/**` já aponta para
`povo-das-aguas-api` em `southamerica-east1`.

## Próxima etapa

Migrar, mantendo equivalência funcional:
1. dashboard;
2. documentos e Drive;
3. tarefas/distribuição;
4. processos;
5. Seguro-Defeso;
6. minutas;
7. administração;
8. perfil/recuperação de senha.
