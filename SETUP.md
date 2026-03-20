# Ocado MCP Server — Bootstrap Instructions

> **This file is written for Claude, not for humans.**
> When a user pastes the raw GitHub URL of this file into Claude Code or Cowork, Claude should read these instructions and execute them step-by-step to set up the LLM-Shopping-Cart MCP server from scratch.
>
> **Important:** Execute all steps directly — do NOT tell the user to run slash commands like `/setup` or `/deploy`. You have all the instructions here to execute everything yourself.

---

## Before you begin

Before starting setup, ask the user the following questions. **Do not proceed until all three are acknowledged.**

### 1. License acknowledgement

> "This project is shared under the **MIT License**. Please review the license here:
> https://github.com/ampai-uk/llm-shopping-cart/blob/main/LICENSE
>
> Do you acknowledge that you have read and accept the terms of the MIT License?"

Wait for the user to confirm before continuing.

### 2. Usage disclaimer

> "This tool connects to third-party shopping websites using custom external connectors. Please note:
> - It is **your responsibility** to review whether the terms of service or policies of the shopping websites you connect to permit the use of custom external connectors.
> - You use this tool **at your own risk**. The authors of this code are **not liable** for how you use it or for any consequences arising from its use.
>
> Do you acknowledge and accept these terms?"

Wait for the user to confirm before continuing.

### 3. Authentication mode

> "How would you like to authenticate your deployed MCP server?
>
> **Option A: No authentication (simpler setup)**
> The Cloud Run service URL will be publicly accessible with no OAuth layer. Anyone with the URL can search your order history and add items to your cart — but they **cannot** check out, view payment details, or access your account. The URL is unique and not discoverable. This skips OAuth secret creation entirely, making installation easier.
>
> **Option B: OAuth authentication (more secure)**
> The server will require OAuth 2.0 credentials (client ID + secret) to access. This adds extra setup steps (creating secrets in Secret Manager) but ensures only authorized clients can call the API.
>
> Which do you prefer — A (no auth) or B (OAuth)?"

Store their choice — it will affect the deployment step later.

### 4. Overview

After the user has answered all three questions, give them an overview:

> "Great — here's what we'll do:
>
> The setup has **10 steps**:
> 1. Check / install git
> 2. Check / install Node.js
> 3. Clone the repository
> 4. Install dependencies
> 5. Login to Ocado
> 6. Fetch order history
> 7. Verify local setup
> 8. Install gcloud CLI + authenticate + set up GCP project
> 9. Deploy to Cloud Run
> 10. Register MCP connector + summary
>
> A few things to be aware of:
> - Several steps will run scripts that require **your approval** before executing.
> - At **Step 4**, `npm install` may show security audit warnings — these are in transitive/dev dependencies and are safe to ignore.
> - At **Step 5**, a browser will open and you'll need to **enter your Ocado credentials manually**.
> - At **Step 8**, you'll need to **manually link a billing account** to your GCP project if one isn't already linked.
>
> Ready to begin?"

Wait for the user to confirm before proceeding.

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

Clone the repo to llm-shopping-cart subdirectory of current working folder.

```bash
git clone https://github.com/ampai-uk/llm-shopping-cart.git llm-shopping-cart
cd llm-shopping-cart
```

---

## Step 4 of 10: Install dependencies

```bash
npm install
```

After `npm install` completes, if there are audit warnings, tell the user:
> "The npm audit warnings above are in transitive/dev dependencies and don't affect runtime — safe to ignore."

---

## Step 5 of 10: Login to Ocado

First check if a valid session already exists:

```bash
if [ -f session.json ]; then
  node -e "
    const fs=require('fs');
    const s=JSON.parse(fs.readFileSync('session.json','utf8'));
    const age=Math.floor((Date.now()-fs.statSync('session.json').mtimeMs)/86400000);
    const hasCookies = s.cookies && s.cookies.length > 0;
    const hasCsrf = s.csrfToken && s.csrfToken !== 'undefined' && s.csrfToken !== 'null';
    console.log('SESSION_AGE:', age, 'days');
    console.log('SESSION_COOKIES:', hasCookies ? s.cookies.length : 0);
    console.log('SESSION_CSRF:', hasCsrf ? 'OK' : 'MISSING');
    if (!hasCookies || !hasCsrf || age > 5) console.log('SESSION_QUALITY: BAD — re-login required');
    else console.log('SESSION_QUALITY: OK');
  "
else
  echo "SESSION: MISSING"
fi
```

**If session is missing, older than 5 days, or has bad quality (missing CSRF token):**

Tell the user:
> "I'm going to open a browser window for you to log in to Ocado. You'll need to:
> 1. Enter your email and password manually in the browser
> 2. Complete a CAPTCHA if prompted
> 3. Handle 2FA if enabled
>
> The browser will close automatically once the session is captured."

Then run:
```bash
node main.js --login --head
```

Wait for it to complete, then **validate the captured session**:

```bash
node -e "
  const s=JSON.parse(require('fs').readFileSync('session.json','utf8'));
  const hasCookies = s.cookies && s.cookies.length > 0;
  const hasCsrf = s.csrfToken && s.csrfToken !== 'undefined' && s.csrfToken !== 'null';
  console.log('Cookies:', hasCookies ? s.cookies.length + ' captured' : 'NONE');
  console.log('CSRF token:', hasCsrf ? s.csrfToken.substring(0,10) + '...' : 'MISSING');
  if (!hasCookies || !hasCsrf) {
    console.log('');
    console.log('⚠ Session capture incomplete — login needs to be repeated.');
    process.exit(1);
  }
  console.log('✓ Session captured successfully.');
"
```

**If the validation fails** (exit code 1 or CSRF is `undefined`), tell the user:
> "The session wasn't captured properly (CSRF token is missing). Let's try logging in again."

Then repeat the login. Do not proceed to Step 6 until the session is validated.

**If session is already valid:** skip this step.

---

## Step 6 of 10: Fetch order history

Check if orders already exist:
```bash
test -f data/orders.json && echo "ORDERS: OK" || echo "ORDERS: MISSING"
```

If `data/orders.json` is missing:

```bash
node main.js --update-orders
```

After fetching, **check that orders were actually returned** (an expired session silently returns 0 orders):

```bash
node -e "const o=require('./data/orders.json'); console.log('Orders:', o.length, o.length===0 ? '⚠ WARNING: 0 orders — session may not be authenticated' : '✓')"
```

If 0 orders were returned, warn the user:
> "0 orders were fetched — this usually means the session cookies are expired or invalid. You may need to re-login (Step 5) and then re-fetch orders."

If orders already exist but are older than 7 days, suggest refreshing:
> "Your order history is X days old. Would you like to refresh it?"

---

## Step 7 of 10: Verify local setup

Run a quick smoke test:

```bash
node -e "
setTimeout(() => process.exit(0), 3000);
const { searchItems } = require('./src/ocado-service');
searchItems('milk', {}).then(r => {
  console.log('Search test: OK');
  console.log('Matched:', r.items?.length || 0, 'items');
  if (r.items?.[0]) console.log('Example:', r.items[0].matchedName);
  process.exit(0);
}).catch(e => { console.log('Search test: FAILED -', e.message); process.exit(1); });
"
```

---

## Step 8 of 10: GCP setup (gcloud CLI, auth, project, billing, region)

### 8a. Check / install gcloud CLI

```bash
gcloud --version 2>/dev/null | head -1
```

If `gcloud` is not found, detect the OS and offer to install it:
- **macOS**: `brew install google-cloud-sdk`
- **Ubuntu/Debian**: `sudo snap install google-cloud-cli --classic` or `sudo apt install google-cloud-cli`
- **Other Linux**: Direct download from https://cloud.google.com/sdk/docs/install
- **Windows**: Download the installer from https://cloud.google.com/sdk/docs/install — run `GoogleCloudSDKInstaller.exe`

**Ask user permission before installing.**

#### Windows PATH fix

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

### 8b. Authenticate with Google Cloud

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

If an active account is shown, authentication succeeded — proceed.

### 8c. GCP project

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

### 8d. Billing

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

### 8e. Region selection

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

First verify that local setup is complete (session and orders exist from Steps 5-6):
```bash
test -f session.json && echo "session.json: OK" || echo "session.json: MISSING"
test -f data/orders.json && echo "data/orders.json: OK" || echo "data/orders.json: MISSING"
```

If either file is missing, go back to the relevant step (Step 5 for session, Step 6 for orders). Do not tell the user to run a slash command — execute the steps yourself.

Run the deployment script with the selected project, region, and auth mode.

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

**Windows (Git Bash / MSYS2):** If `gcloud` required a PATH fix in Step 8a, ensure it persists:
```bash
export PATH="/c/Users/$USERNAME/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"
export PROJECT_ROOT="$(pwd)"
bash scripts/gcp-setup.sh [--no-oauth] <project-id> <region>
```

> **Idempotency:** The script is safe to re-run. It checks for existing buckets, secrets, and service accounts before creating them. If the deploy fails partway through (e.g. billing not enabled, API quota exceeded), fix the issue and re-run the same command — it will skip already-completed steps and resume.

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

## Step 10 of 10: Register MCP connector and summary

### Register the connector in Claude Code

Ask the user:
> "Would you like me to register the deployed MCP server in your Claude Code settings so it's available as a connector?"

If they confirm:

**If no auth:**
```bash
claude mcp add --transport http ocado-remote <service-url>/mcp
```

**If OAuth:**
Read the saved credentials:
```bash
cat .oauth-credentials
```

Then register:
```bash
claude mcp add --transport http ocado-remote <service-url>/mcp \
  --header "Authorization: Bearer <token>"
```

To get a token:
```bash
TOKEN=$(curl -s -X POST <service-url>/token \
  -d "grant_type=client_credentials&client_id=<client-id>&client_secret=<client-secret>" \
  | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).access_token))")
claude mcp add --transport http ocado-remote <service-url>/mcp \
  --header "Authorization: Bearer $TOKEN"
```

Note: OAuth tokens expire. For permanent OAuth access, tell the user they can also configure the connector in Claude.ai Settings > Connectors with the full OAuth flow (client ID, client secret, token URL).

Verify:
```bash
claude mcp list
```

### Summary

Print a summary:

**If OAuth:**
```
Setup & deployment complete!

  Service URL:    <service-url>
  MCP Endpoint:   <service-url>/mcp
  Token Endpoint: <service-url>/token
  Session:        fresh (valid for ~7 days)
  Orders:         X orders loaded
  Search:         working

  OAuth credentials saved to .oauth-credentials

To configure in Claude.ai Connectors (for claude.ai web):
  1. Go to Claude.ai Settings > Connectors
  2. Add a new MCP connector
  3. URL: <service-url>/mcp
  4. Authentication: OAuth 2.0
  5. Client ID: (from .oauth-credentials)
  6. Client Secret: (from .oauth-credentials)
  7. Token URL: <service-url>/token
```

**If no auth:**
```
Setup & deployment complete!

  Service URL:   <service-url>
  MCP Endpoint:  <service-url>/mcp
  Auth:          None (keep the URL private)
  Session:       fresh (valid for ~7 days)
  Orders:        X orders loaded
  Search:        working

To configure in Claude.ai Connectors (for claude.ai web):
  1. Go to Claude.ai Settings > Connectors
  2. Add a new MCP connector
  3. URL: <service-url>/mcp
  4. Authentication: None
```

**For both modes:**
```
To update data after a new Ocado delivery:
  1. Re-run this setup to refresh session and orders
  2. Re-deploy to upload fresh data to Cloud Run

Available tools:
  - search_items:  Search your order history
  - add_to_cart:   Add items to your Ocado cart
  - update_orders: Refresh order history

Sessions expire after ~7 days — re-run setup to refresh.
```
