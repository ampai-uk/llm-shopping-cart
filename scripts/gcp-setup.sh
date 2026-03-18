#!/usr/bin/env bash
set -euo pipefail

# --- Configuration ---
PROJECT="${1:-${GCP_PROJECT:-com-auratech-fcl}}"
REGION="${2:-${GCP_REGION:-europe-west2}}"
SERVICE="ocado-mcp"
BUCKET="${PROJECT}-ocado-mcp"
SECRET_CLIENT_ID="ocado-oauth-client-id"
SECRET_CLIENT_SECRET="ocado-oauth-client-secret"
SECRET_JWT="ocado-oauth-jwt-secret"
SA_NAME="ocado-mcp-sa"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

echo "=== Ocado MCP — GCP Setup ==="
echo "  Project:  $PROJECT"
echo "  Region:   $REGION"
echo "  Bucket:   $BUCKET"
echo "  Service:  $SERVICE"
echo ""

# --- 1. Enable required APIs ---
echo "1. Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT" --quiet
echo "   Done."

# --- 2. Create GCS bucket ---
echo "2. Creating GCS bucket..."
if gcloud storage buckets describe "gs://${BUCKET}" --project="$PROJECT" &>/dev/null; then
  echo "   Bucket gs://${BUCKET} already exists — skipping."
else
  gcloud storage buckets create "gs://${BUCKET}" \
    --project="$PROJECT" \
    --location="$REGION" \
    --uniform-bucket-level-access
  echo "   Created gs://${BUCKET}"
fi

# --- 3. Create OAuth secrets in Secret Manager ---
echo "3. Setting up OAuth secrets in Secret Manager..."

create_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT" &>/dev/null; then
    echo "   Secret '$name' already exists — keeping existing value."
  else
    echo -n "$value" | gcloud secrets create "$name" \
      --project="$PROJECT" \
      --data-file=- \
      --replication-policy=user-managed \
      --locations="$REGION"
    echo "   Created secret '$name'"
  fi
}

SECRETS_EXIST=false
if gcloud secrets describe "$SECRET_CLIENT_ID" --project="$PROJECT" &>/dev/null; then
  SECRETS_EXIST=true
fi

if [ "$SECRETS_EXIST" = true ]; then
  echo "   OAuth secrets already exist — reusing existing credentials."
  OAUTH_CLIENT_ID=$(gcloud secrets versions access latest --secret="$SECRET_CLIENT_ID" --project="$PROJECT")
  OAUTH_CLIENT_SECRET=$(gcloud secrets versions access latest --secret="$SECRET_CLIENT_SECRET" --project="$PROJECT")
  # JWT secret doesn't need to be shown
  create_secret "$SECRET_JWT" ""  # no-op, already exists
else
  OAUTH_CLIENT_ID="ocado-mcp-$(openssl rand -hex 12)"
  OAUTH_CLIENT_SECRET="$(openssl rand -hex 32)"
  OAUTH_JWT_SECRET="$(openssl rand -hex 32)"
  create_secret "$SECRET_CLIENT_ID" "$OAUTH_CLIENT_ID"
  create_secret "$SECRET_CLIENT_SECRET" "$OAUTH_CLIENT_SECRET"
  create_secret "$SECRET_JWT" "$OAUTH_JWT_SECRET"
fi

echo ""
echo "   ┌──────────────────────────────────────────────────────────────────────┐"
echo "   │ OAuth Client ID:     $OAUTH_CLIENT_ID"
echo "   │ OAuth Client Secret: $OAUTH_CLIENT_SECRET"
if [ "$SECRETS_EXIST" = false ]; then
echo "   │ Save these for Claude Connectors — they won't be shown again.       │"
fi
echo "   └──────────────────────────────────────────────────────────────────────┘"
echo ""

# --- 4. Create service account ---
echo "4. Creating service account..."
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT" &>/dev/null; then
  echo "   Service account $SA_EMAIL already exists — skipping."
else
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$PROJECT" \
    --display-name="Ocado MCP Cloud Run"
  echo "   Created $SA_EMAIL"
fi

# --- 5. Grant permissions ---
echo "5. Granting permissions..."

# GCS access
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectUser" \
  --quiet || true
echo "   Granted storage.objectUser on gs://${BUCKET}"

# Secret Manager access
for secret in "$SECRET_CLIENT_ID" "$SECRET_CLIENT_SECRET" "$SECRET_JWT"; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --project="$PROJECT" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet || true
  echo "   Granted secretmanager.secretAccessor on $secret"
done

# --- 6. Upload session.json and orders.json ---
echo "6. Uploading data files to GCS..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_ROOT/session.json" ]; then
  gcloud storage cp "$PROJECT_ROOT/session.json" "gs://${BUCKET}/session.json"
  echo "   Uploaded session.json"
else
  echo "   WARNING: session.json not found — run 'node main.js --login' first"
fi

if [ -f "$PROJECT_ROOT/data/orders.json" ]; then
  gcloud storage cp "$PROJECT_ROOT/data/orders.json" "gs://${BUCKET}/orders.json"
  echo "   Uploaded orders.json"
else
  echo "   WARNING: data/orders.json not found — run 'node main.js --update-orders' first"
fi

# --- 7. Deploy to Cloud Run ---
echo "7. Deploying to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --source="$PROJECT_ROOT" \
  --service-account="$SA_EMAIL" \
  --allow-unauthenticated \
  --memory=256Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --timeout=60 \
  --set-env-vars="GCS_BUCKET=${BUCKET}" \
  --set-secrets="OAUTH_CLIENT_ID=${SECRET_CLIENT_ID}:latest,OAUTH_CLIENT_SECRET=${SECRET_CLIENT_SECRET}:latest,OAUTH_JWT_SECRET=${SECRET_JWT}:latest"

# --- 8. Print service URL ---
echo ""
echo "=== Deployment complete ==="
SERVICE_URL=$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --format="value(status.url)")
echo "  Service URL: $SERVICE_URL"
echo ""
echo "  Test:"
echo "    curl $SERVICE_URL/"
echo "    curl -s -X POST $SERVICE_URL/token -d 'grant_type=client_credentials&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>'"
echo ""
echo "  MCP endpoint:  $SERVICE_URL/mcp"
echo "  Token endpoint: $SERVICE_URL/token"
echo ""
echo "  Claude Connectors config:"
echo "    URL:           $SERVICE_URL/mcp"
echo "    Client ID:     (from step 3 above)"
echo "    Client Secret: (from step 3 above)"
