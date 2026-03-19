# Ocado MCP Server — Bootstrap Instructions

> **This file is written for Claude, not for humans.**
> When a user pastes the raw GitHub URL of this file into Claude Code or Cowork, Claude should read these instructions and execute them step-by-step to set up the LLM-Shopping-Cart MCP server from scratch.

---

## Step 1 of 10: Check / install git

Check if `git` is available:

```bash
git --version
```

If `git` is not found, detect the OS and offer to install it:
- **macOS**: `xcode-select --install` or `brew install git`
- **Ubuntu/Debian**: `sudo apt update && sudo apt install -y git`
- **Fedora/RHEL**: `sudo dnf install -y git`
- **Windows (Git Bash)**: Download from https://git-scm.com/download/win — Git Bash is included
- **Windows (WSL)**: `sudo apt install -y git`

**Always ask the user for permission before installing anything.**

---

## Step 2 of 10: Check / install Node.js

Check if `node` (v18+) and `npm` are available:

```bash
node --version
npm --version
```

If Node.js is missing or below v18, suggest installation:
- **macOS / Linux**: Install via [nvm](https://github.com/nvm-sh/nvm):
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  source ~/.bashrc   # or ~/.zshrc
  nvm install 20
  ```
- **Windows**: Download the LTS installer from https://nodejs.org/ — this adds `node` and `npm` to PATH for both PowerShell and Git Bash
- **Alternative (all platforms)**: Download from https://nodejs.org/ (LTS version)

**Always ask the user for permission before installing anything.**

---

## Step 3 of 10: Clone the repository

Clone the repo to a sensible default location. Ask the user where they'd like it, defaulting to the current folder:

```bash
git clone https://github.com/ampai-uk/llm-shopping-cart.git llm-shopping-cart
cd llm-shopping-cart
```

---

## Step 4 of 10: Run `/setup` (local environment)

Now that the repo is cloned and you are inside it, the `.claude/commands/setup.md` slash command is available.

> **Note:** `/setup` is a **Claude Code slash command**, not a terminal command. Type `/setup` in the Claude Code chat prompt and press Enter. Claude will execute the setup wizard automatically.

This handles: `npm install`, `.env` configuration, Ocado login, order history fetch, and smoke test verification.

**You must complete `/setup` fully before continuing.** Steps 5–10 depend on the `session.json` and `data/orders.json` files it creates. Wait for `/setup` to report success, then proceed.

---

## Step 5 of 10: Check / install gcloud CLI

Check if `gcloud` is available:

```bash
gcloud --version 2>/dev/null | head -1
```

If `gcloud` is not found, detect the OS and offer to install it:
- **macOS**: `brew install google-cloud-sdk`
- **Ubuntu/Debian**: `sudo snap install google-cloud-cli --classic` or `sudo apt install google-cloud-cli`
- **Other Linux**: Direct download from https://cloud.google.com/sdk/docs/install
- **Windows**: Download the installer from https://cloud.google.com/sdk/docs/install — run `GoogleCloudSDKInstaller.exe`

**Ask user permission before installing.**

### Windows PATH fix

On Windows (Git Bash / MSYS2), the installer adds `gcloud` to the Windows PATH but **not** to the bash PATH. If `gcloud` is not found after install, add it manually:

```bash
export PATH="/c/Users/$USERNAME/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"
```

Verify it works:
```bash
gcloud --version | head -1
```

If the above still fails, try using the `.cmd` wrapper directly:
```bash
gcloud.cmd --version | head -1
```

If only `gcloud.cmd` works, create an alias for the rest of the session:
```bash
alias gcloud='gcloud.cmd'
```

---

## Step 6 of 10: Authenticate with Google Cloud

Check if already logged in:
```bash
gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null
```

If no active account, run:
```bash
gcloud auth login 2>/dev/null || true
```

Tell the user:
> "A browser window will open for Google Cloud authentication. Sign in with your Google account and grant the requested permissions."

> **Note:** On Windows, `gcloud auth login` may print warnings to stderr and exit with code 1 even on success. **Ignore the exit code.** Always verify by checking the active account afterwards:

```bash
gcloud auth list --filter=status:ACTIVE --format="value(account)"
```

If an active account is shown, authentication succeeded — proceed to the next step.

---

## Step 7 of 10: GCP project and billing

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

### Check billing

```bash
gcloud billing projects describe $(gcloud config get-value project) --format="value(billingAccountName)" 2>/dev/null
```

If no billing account is linked, tell the user:
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

---

## Step 8 of 10: Select region

Default to `europe-west2` (London). Ask the user:
> "I'll deploy to **europe-west2** (London) by default. Would you like a different region?
>
> Common options:
> - `europe-west2` — London
> - `europe-west1` — Belgium
> - `us-central1` — Iowa
> - `us-east1` — South Carolina
> - `asia-east1` — Taiwan"

---

## Step 9 of 10: Deploy to Cloud Run

First verify that local setup is complete (session and orders exist from Step 4):
```bash
test -f session.json && echo "session.json: OK" || echo "session.json: MISSING"
test -f data/orders.json && echo "data/orders.json: OK" || echo "data/orders.json: MISSING"
```

If either file is missing, tell the user:
> "Local setup is incomplete. Please run `/setup` first (Step 4), then return here."

> **Note:** `/setup` is a Claude Code slash command — type it in the chat prompt, not in a terminal.

Run the deployment script with the selected project and region:
```bash
chmod +x scripts/gcp-setup.sh
./scripts/gcp-setup.sh <project-id> <region>
```

> **Idempotency:** The script is safe to re-run. It checks for existing buckets, secrets, and service accounts before creating them. If the deploy fails partway through (e.g. billing not enabled, API quota exceeded), fix the issue and re-run the same command — it will skip already-completed steps and resume.

This script (`scripts/gcp-setup.sh`) handles:
1. Enabling required APIs (Cloud Run, Storage, Secret Manager, Cloud Build, Artifact Registry)
2. Creating a GCS bucket for data files
3. Creating OAuth credentials in Secret Manager
4. Creating a service account with appropriate permissions
5. Uploading `session.json` and `data/orders.json` to GCS
6. Building and deploying to Cloud Run
7. Saving OAuth credentials to `.oauth-credentials` in the project root (gitignored)

After deployment, the script prints two service URLs. **Use the stable URL** from `gcloud run services describe` (the shorter one), not the build-time URL from `gcloud run deploy` output.

Get the service URL:
```bash
SERVICE_URL=$(gcloud run services describe ocado-mcp --project=<project-id> --region=<region> --format="value(status.url)")
echo "Service URL: $SERVICE_URL"
```

Test the health endpoint:
```bash
curl -s "$SERVICE_URL/" | head -5
```

---

## Step 10 of 10: Configure Claude Connector

Read the saved OAuth credentials:
```bash
cat .oauth-credentials
```

Tell the user:
```
Deployment complete!

  Service URL:    <service-url>
  MCP Endpoint:   <service-url>/mcp
  Token Endpoint: <service-url>/token

To configure in Claude.ai:
  1. Go to Claude.ai Settings > Connectors
  2. Add a new MCP connector
  3. URL: <service-url>/mcp
  4. Authentication: OAuth 2.0
  5. Client ID: (from .oauth-credentials)
  6. Client Secret: (from .oauth-credentials)
  7. Token URL: <service-url>/token

To update data after a new Ocado delivery:
  1. Run /setup locally to refresh session and orders
  2. Re-run /deploy to upload fresh data to Cloud Run
```

> **Note:** `/setup` and `/deploy` are **Claude Code slash commands** — type them in the Claude Code chat prompt, not in a terminal.
