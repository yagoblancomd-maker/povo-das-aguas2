#!/usr/bin/env bash
set -Eeuo pipefail

REGION="southamerica-east1"
PROJECT_ID="${PROJECT_ID:-povo-aguas-337929201-261006}"
SERVICE="povo-das-aguas"
INSTANCE="pda-db"
DATABASE="povo_das_aguas"
DB_USER="povo_app"
RUNTIME_SA="povo-api"
SECRET="povo-db-password"
STATUS_BUCKET="${PROJECT_ID}-deploy-status"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

green(){ printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }
red(){ printf '\033[31m%s\033[0m\n' "$*" >&2; }

command -v gcloud >/dev/null || { red "gcloud não encontrado."; exit 1; }
ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -1 || true)"

if [[ -z "$ACCOUNT" ]]; then
  yellow "LOGIN_REQUIRED"
  gcloud auth login
  ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -1)"
fi

green "Conta Google: $ACCOUNT"

if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  green "Criando projeto Google Cloud $PROJECT_ID..."
  gcloud projects create "$PROJECT_ID" --name="Povo das Águas"
fi

gcloud config set project "$PROJECT_ID" >/dev/null

BILLING_ENABLED="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true)"
if [[ "$BILLING_ENABLED" != "True" && "$BILLING_ENABLED" != "true" ]]; then
  ACCOUNT_ID="$(gcloud billing accounts list --filter='open=true' --format='value(name)' | head -1 || true)"
  if [[ -z "$ACCOUNT_ID" ]]; then
    yellow "BILLING_REQUIRED"
    echo "Abra: https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
    echo "Depois execute este mesmo script novamente."
    exit 42
  fi
  yellow "O projeto ainda não está vinculado ao faturamento."
  echo "A conta disponível é: $ACCOUNT_ID"
  echo "Vincule em: https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
  echo "Depois execute este mesmo script novamente."
  exit 42
fi

green "Faturamento confirmado."

green "Ativando APIs..."
gcloud services enable   run.googleapis.com   sqladmin.googleapis.com   secretmanager.googleapis.com   artifactregistry.googleapis.com   cloudbuild.googleapis.com   iam.googleapis.com   storage.googleapis.com   drive.googleapis.com   sheets.googleapis.com   --project="$PROJECT_ID"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  green "Criando conta de serviço..."
  gcloud iam service-accounts create "$RUNTIME_SA"     --display-name="Povo das Águas API"
fi

for ROLE in roles/cloudsql.client roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID"     --member="serviceAccount:$SA_EMAIL"     --role="$ROLE"     --condition=None     --quiet >/dev/null
done

BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID"   --member="serviceAccount:$BUILD_SA"   --role="roles/run.builder"   --condition=None   --quiet >/dev/null || true

if ! gcloud sql instances describe "$INSTANCE" >/dev/null 2>&1; then
  green "Criando PostgreSQL no Cloud SQL. Esta etapa pode levar alguns minutos..."
  gcloud sql instances create "$INSTANCE"     --database-version=POSTGRES_16     --edition=ENTERPRISE     --tier=db-f1-micro     --region="$REGION"     --availability-type=zonal     --storage-type=SSD     --storage-size=10     --storage-auto-increase     --quiet
fi

if ! gcloud sql databases describe "$DATABASE" --instance="$INSTANCE" >/dev/null 2>&1; then
  gcloud sql databases create "$DATABASE" --instance="$INSTANCE"
fi

if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
  DB_PASS="$(gcloud secrets versions access latest --secret="$SECRET")"
else
  DB_PASS="$(openssl rand -hex 24)"
  printf '%s' "$DB_PASS" | gcloud secrets create "$SECRET" --data-file=-
fi

if gcloud sql users list --instance="$INSTANCE" --format='value(name)' | grep -qx "$DB_USER"; then
  gcloud sql users set-password "$DB_USER"     --instance="$INSTANCE"     --password="$DB_PASS"
else
  gcloud sql users create "$DB_USER"     --instance="$INSTANCE"     --password="$DB_PASS"
fi

CONNECTION="$(gcloud sql instances describe "$INSTANCE" --format='value(connectionName)')"

green "Publicando Cloud Run..."
gcloud run deploy "$SERVICE"   --source="$ROOT/cloud"   --region="$REGION"   --service-account="$SA_EMAIL"   --allow-unauthenticated   --add-cloudsql-instances="$CONNECTION"   --set-env-vars="INSTANCE_CONNECTION_NAME=$CONNECTION,DB_NAME=$DATABASE,DB_USER=$DB_USER,NODE_ENV=production"   --set-secrets="DB_PASSWORD=$SECRET:latest"   --cpu=1   --memory=512Mi   --concurrency=40   --min=0   --max=3   --timeout=300   --quiet

URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
green "Cloud Run publicado: $URL"

green "Autorizando leitura do banco atual para a migração..."
yellow "AUTHORIZATION_REQUIRED"
gcloud auth application-default login   --scopes="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/spreadsheets.readonly"

ACCESS_TOKEN="$(gcloud auth application-default print-access-token)"
DRIVE_JSON="$(curl -fsS -G 'https://www.googleapis.com/drive/v3/files'   -H "Authorization: Bearer $ACCESS_TOKEN"   --data-urlencode "q=name contains 'PDA Banco' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"   --data-urlencode "orderBy=modifiedTime desc"   --data-urlencode "pageSize=10"   --data-urlencode "fields=files(id,name,modifiedTime)")"

SPREADSHEET_ID="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("files") or [{}])[0].get("id",""))' <<<"$DRIVE_JSON")"
SPREADSHEET_NAME="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("files") or [{}])[0].get("name",""))' <<<"$DRIVE_JSON")"

if [[ -z "$SPREADSHEET_ID" ]]; then
  red "Não encontrei automaticamente a planilha 'PDA Banco'."
  exit 3
fi

green "Banco atual localizado: $SPREADSHEET_NAME"

pushd "$ROOT/cloud/backend" >/dev/null
npm install --silent
INSTANCE_CONNECTION_NAME="$CONNECTION" DB_NAME="$DATABASE" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASS" SPREADSHEET_ID="$SPREADSHEET_ID" IMPORT_TRUNCATE=true npm run import:sheets
popd >/dev/null

green "Dados copiados para o PostgreSQL."

# Registra o resultado em um objeto público previsível para conferência remota.
if ! gcloud storage buckets describe "gs://$STATUS_BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$STATUS_BUCKET"     --location="$REGION"     --uniform-bucket-level-access
fi

STATUS_FILE="$(mktemp)"
cat >"$STATUS_FILE" <<JSON
{"ok":true,"projectId":"$PROJECT_ID","region":"$REGION","service":"$SERVICE","url":"$URL","deployedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
JSON

gcloud storage cp "$STATUS_FILE" "gs://$STATUS_BUCKET/status.json"
gcloud storage buckets add-iam-policy-binding "gs://$STATUS_BUCKET"   --member=allUsers   --role=roles/storage.objectViewer >/dev/null 2>&1 || true
rm -f "$STATUS_FILE"

green "CONCLUÍDO"
echo "$URL"
