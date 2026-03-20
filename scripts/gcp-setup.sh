#!/usr/bin/env bash
set -euo pipefail

# --- Parse flags ---
NO_OAUTH=false
POSITIONAL=()
for arg in "$@"; do
  case "$arg" in
    --no-oauth) NO_OAUTH=true ;;
    *) POSITIONAL+=("$arg") ;;
  esac
done

# --- Configuration ---
PROJECT="${POSITIONAL[0]:-${GCP_PROJECT:-com-auratech-fcl}}"
REGION="${POSITIONAL[1]:-${GCP_REGION:-europe-west2}}"
SERVICE="ocado-mcp"
BUCKET="${PROJECT}-ocado-mcp"
SECRET_CLIENT_ID="ocado-oauth-client-id"
SECRET_CLIENT_SECRET="ocado-oauth-client-secret"
SECRET_JWT="ocado-oauth-jwt-secret"
SA_NAME="ocado-mcp-sa"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== Ocado MCP — GCP Setup ==="
echo "  Project:  $PROJECT"
echo "  Region:   $REGION"
echo "  Bucket:   $BUCKET"
echo "  Service:  $SERVICE"
echo "  Auth:     $([ "$NO_OAUTH" = true ] && echo 'none (public URL)' || echo 'OAuth')"
echo ""

# --- 1. Enable required APIs ---
echo "1. Enabling APIs..."
APIS=(
  run.googleapis.com
  storage.googleapis.com
  cloudbuild.googleapis.com
  artifactregistry.googleapis.com
)
if [ "$NO_OAUTH" = false ]; then
  APIS+=(secretmanager.googleapis.com)
fi
gcloud services enable "${APIS[@]}" --project="$PROJECT" --quiet
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

# --- 3. Create OAuth secrets in Secret Manager (skipped if --no-oauth) ---
if [ "$NO_OAUTH" = true ]; then
  echo "3. Skipping OAuth secrets (--no-oauth mode)."
  echo "   The MCP server will be accessible without authentication."
  echo ""
else
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

  # Save credentials to local file (gitignored)
  CREDS_FILE="${PROJECT_ROOT}/.oauth-credentials"
  cat > "$CREDS_FILE" <<CREDS
OAUTH_CLIENT_ID=$OAUTH_CLIENT_ID
OAUTH_CLIENT_SECRET=$OAUTH_CLIENT_SECRET
CREDS
  echo "   Saved credentials to .oauth-credentials (gitignored)"
  echo ""
fi

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

# Secret Manager access (only if OAuth is enabled)
if [ "$NO_OAUTH" = false ]; then
  for secret in "$SECRET_CLIENT_ID" "$SECRET_CLIENT_SECRET" "$SECRET_JWT"; do
    gcloud secrets add-iam-policy-binding "$secret" \
      --project="$PROJECT" \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="roles/secretmanager.secretAccessor" \
      --quiet || true
    echo "   Granted secretmanager.secretAccessor on $secret"
  done
fi

# --- 6. Upload session.json and orders.json ---
echo "6. Uploading data files to GCS..."

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

DEPLOY_ARGS=(
  --project="$PROJECT"
  --region="$REGION"
  --source="$PROJECT_ROOT"
  --service-account="$SA_EMAIL"
  --allow-unauthenticated
  --memory=256Mi
  --cpu=1
  --min-instances=0
  --max-instances=3
  --timeout=60
  --set-env-vars="GCS_BUCKET=${BUCKET}"
  --quiet
)

if [ "$NO_OAUTH" = false ]; then
  DEPLOY_ARGS+=(--set-secrets="OAUTH_CLIENT_ID=${SECRET_CLIENT_ID}:latest,OAUTH_CLIENT_SECRET=${SECRET_CLIENT_SECRET}:latest,OAUTH_JWT_SECRET=${SECRET_JWT}:latest")
fi

gcloud run deploy "$SERVICE" "${DEPLOY_ARGS[@]}"

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
echo ""
echo "  MCP endpoint:  $SERVICE_URL/mcp"

if [ "$NO_OAUTH" = true ]; then
  echo ""
  echo "  Auth: NONE — the URL is publicly accessible."
  echo "  Keep this URL private."
  echo ""
  echo "  Claude Connectors config:"
  echo "    URL: $SERVICE_URL/mcp"
  echo "    Authentication: None"
else
  echo "  Token endpoint: $SERVICE_URL/token"
  echo ""
  echo "  Test token:"
  echo "    curl -s -X POST $SERVICE_URL/token -d 'grant_type=client_credentials&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>'"
  echo ""
  echo "  Claude Connectors config:"
  echo "    URL:           $SERVICE_URL/mcp"
  echo "    Authentication: OAuth 2.0"
  echo "    Client ID:     (from step 3 above)"
  echo "    Client Secret: (from step 3 above)"
  echo "    Token URL:     $SERVICE_URL/token"
fi
