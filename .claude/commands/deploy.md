# Deploy Ocado MCP to Google Cloud Run

You are running the `/deploy` command to deploy the Ocado MCP server to Google Cloud Run. This makes the MCP server accessible via HTTP, suitable for use with Claude.ai Connectors.

If the user chose an authentication mode during `/setup`, use that choice. Otherwise, ask them:
- **No auth (`--no-oauth`):** Public URL, no OAuth secrets created. Simpler setup.
- **OAuth (default):** Requires OAuth 2.0 credentials. More secure.

Walk through each step, checking what's already done and skipping completed steps.

## Step 1: Check / install gcloud CLI

```bash
gcloud --version 2>/dev/null | head -1
```

If `gcloud` is not found, detect the OS and offer to install:
- **macOS**: `brew install google-cloud-sdk`
- **Ubuntu/Debian**: `sudo snap install google-cloud-cli --classic` or `sudo apt install google-cloud-cli`
- **Other Linux**: Direct download from https://cloud.google.com/sdk/docs/install

**Ask user permission before installing.**

Verify after install:
```bash
gcloud --version | head -1
```

## Step 2: Authenticate with Google Cloud

Check if already logged in:
```bash
gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null
```

If no active account, run:
```bash
gcloud auth login
```

This opens a browser. Walk the user through it:
> "A browser window will open for Google Cloud authentication. Sign in with your Google account and grant the requested permissions."

Verify authentication:
```bash
gcloud auth list --filter=status:ACTIVE --format="value(account)"
```

## Step 3: GCP Project

Ask the user:
> "Do you have an existing GCP project to use, or should I create a new one?"

**If existing project:**
```bash
gcloud projects describe <project-id>
```

**If new project:**
Generate a project ID like `ocado-mcp-<random-4-chars>`:
```bash
PROJECT_ID="ocado-mcp-$(openssl rand -hex 2)"
gcloud projects create "$PROJECT_ID" --name="Ocado MCP"
```

Set as active project:
```bash
gcloud config set project <project-id>
```

## Step 4: Billing

Check if billing is linked:
```bash
gcloud billing projects describe $(gcloud config get-value project) --format="value(billingAccountName)" 2>/dev/null
```

If no billing account is linked:
> "Your project needs a billing account to use Cloud Run. Google Cloud has a generous free tier — Cloud Run offers 2 million free requests per month.
>
> Please link a billing account at:
> https://console.cloud.google.com/billing/linkedaccount?project=<project-id>
>
> Let me know when you've done this."

Re-verify billing before proceeding:
```bash
gcloud billing projects describe $(gcloud config get-value project) --format="value(billingAccountName)"
```

## Step 5: Region selection

Default to `europe-west2` (London). Ask the user:
> "I'll deploy to **europe-west2** (London) by default. Would you like a different region?
>
> Common options:
> - `europe-west2` — London
> - `europe-west1` — Belgium
> - `us-central1` — Iowa
> - `us-east1` — South Carolina
> - `asia-east1` — Taiwan"

## Step 6: Verify local setup

Check that the local setup is complete:
```bash
test -f session.json && echo "session.json: OK" || echo "session.json: MISSING"
test -f data/orders.json && echo "data/orders.json: OK" || echo "data/orders.json: MISSING"
```

If either file is missing:
> "Local setup is incomplete. Please run `/setup` first to create your session and fetch order history, then re-run `/deploy`."

Stop here if files are missing.

## Step 7: Deploy

Run the deployment script with the selected project and region.

**If the user chose no auth (Option A):**
```bash
chmod +x scripts/gcp-setup.sh
bash scripts/gcp-setup.sh --no-oauth <project-id> <region>
```

**If the user chose OAuth (Option B / default):**
```bash
chmod +x scripts/gcp-setup.sh
bash scripts/gcp-setup.sh <project-id> <region>
```

**Windows (Git Bash / MSYS2):** If `gcloud` was installed via the Google Cloud SDK installer and wasn't found earlier, ensure PATH persists for this command:
```bash
export PATH="/c/Users/$USERNAME/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"
export PROJECT_ROOT="$(pwd)"
bash scripts/gcp-setup.sh [--no-oauth] <project-id> <region>
```

This script handles:
1. Enabling required APIs (Cloud Run, Storage, Secret Manager, Cloud Build, Artifact Registry)
2. Creating a GCS bucket for data files
3. Creating OAuth secrets in Secret Manager (skipped with `--no-oauth`)
4. Creating a service account with appropriate permissions
5. Uploading `session.json` and `data/orders.json` to GCS
6. Deploying to Cloud Run

## Step 8: Report and test

After deployment completes, get the service URL:
```bash
SERVICE_URL=$(gcloud run services describe ocado-mcp --project=<project-id> --region=<region> --format="value(status.url)")
echo "Service URL: $SERVICE_URL"
```

Test the health endpoint:
```bash
curl -s "$SERVICE_URL/" | head -5
```

Print the results. Adapt the output depending on whether OAuth was used:

**If OAuth:**
```
Deployment complete!

  Service URL:    <service-url>
  MCP Endpoint:   <service-url>/mcp
  Token Endpoint: <service-url>/token

  OAuth credentials were printed during deployment (step 3 of the script).
  Save them — you'll need them for Claude Connectors.

To configure in Claude.ai Connectors:
  1. Go to Claude.ai Settings > Connectors
  2. Add a new MCP connector
  3. URL: <service-url>/mcp
  4. Authentication: OAuth 2.0
  5. Client ID: (from deployment output)
  6. Client Secret: (from deployment output)
  7. Token URL: <service-url>/token
```

**If no auth:**
```
Deployment complete!

  Service URL:   <service-url>
  MCP Endpoint:  <service-url>/mcp
  Auth:          None (public URL — keep it private)

To configure in Claude.ai Connectors:
  1. Go to Claude.ai Settings > Connectors
  2. Add a new MCP connector
  3. URL: <service-url>/mcp
  4. Authentication: None
```

## Step 9: Register MCP connector in Claude Code

Ask the user:
> "Would you like me to register the deployed MCP server in your Claude Code settings so it's available as a connector?"

If they confirm:

**If no auth:**
```bash
claude mcp add --transport http ocado-remote <service-url>/mcp
```

**If OAuth:**
```bash
claude mcp add --transport http ocado-remote <service-url>/mcp \
  --header "Authorization: Bearer <token>"
```

To get a token for the header, first fetch one:
```bash
TOKEN=$(curl -s -X POST <service-url>/token \
  -d "grant_type=client_credentials&client_id=<client-id>&client_secret=<client-secret>" \
  | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).access_token))")
claude mcp add --transport http ocado-remote <service-url>/mcp \
  --header "Authorization: Bearer $TOKEN"
```

Note: OAuth tokens expire. For a more permanent setup, the user can configure the connector in Claude.ai Settings > Connectors with the full OAuth flow (client ID, client secret, token URL).

After adding, verify:
```bash
claude mcp list
```

**For both modes:**
```
To update data after a new Ocado delivery:
  1. Run /setup locally to refresh session and orders
  2. Re-run /deploy to upload fresh data to Cloud Run
```
