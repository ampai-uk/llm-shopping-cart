# Ocado MCP Setup Wizard

You are running the `/setup` command for the Ocado MCP server. This is an idempotent wizard — check the current state and skip steps that are already complete.

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
> The setup has **7 steps**:
> 1. Check current state
> 2. Install dependencies
> 3. Login to Ocado
> 4. Fetch order history
> 5. Verify local setup
> 6. Deploy to Google Cloud Run
> 7. Summary
>
> A few things to be aware of:
> - Several steps will run scripts that require **your approval** before executing.
> - At **Step 2**, `npm install` may show security audit warnings — these are in transitive/dev dependencies and are safe to ignore.
> - At **Step 3**, a browser will open and you'll need to **enter your Ocado credentials manually**.
> - At **Step 6** (deploy), you'll need to **manually link a billing account** to your GCP project if one isn't already linked.
>
> Ready to begin?"

Wait for the user to confirm before proceeding.

## Step 1: Check current state

Run these checks and report which steps are needed:

```bash
# Check node_modules
test -d node_modules && echo "MODULES: OK" || echo "MODULES: MISSING"

# Check session.json
test -f session.json && echo "SESSION: OK" || echo "SESSION: MISSING"

# Check session age (if exists)
if [ -f session.json ]; then
  node -e "const fs=require('fs'); const age=Math.floor((Date.now()-fs.statSync('session.json').mtimeMs)/86400000); console.log('SESSION_AGE:', age, 'days')"
fi

# Check session has cookies and valid CSRF token
if [ -f session.json ]; then
  node -e "
    const s=JSON.parse(require('fs').readFileSync('session.json','utf8'));
    const hasCookies = s.cookies && s.cookies.length > 0;
    const hasCsrf = s.csrfToken && s.csrfToken !== 'undefined' && s.csrfToken !== 'null';
    console.log('SESSION_COOKIES:', hasCookies ? s.cookies.length : 0);
    console.log('SESSION_CSRF:', hasCsrf ? 'OK' : 'MISSING');
    if (!hasCookies || !hasCsrf) console.log('SESSION_QUALITY: BAD — re-login required');
    else console.log('SESSION_QUALITY: OK');
  "
fi

# Check orders
test -f data/orders.json && echo "ORDERS: OK" || echo "ORDERS: MISSING"

# Count orders if file exists
if [ -f data/orders.json ]; then
  ORDER_COUNT=$(node -e "const d=require('./data/orders.json'); console.log(Array.isArray(d)?d.length:Object.keys(d).length)" 2>/dev/null || echo "unknown")
  echo "ORDER_COUNT: ${ORDER_COUNT}"
fi
```

Tell the user which steps will be performed and which are already done.

**If SESSION_CSRF is MISSING or SESSION_QUALITY is BAD**, tell the user:
> "Your session file exists but is missing cookies or a valid CSRF token — this means the login didn't capture properly. We'll need to log in again."

Mark Step 3 as required.

## Step 2: Install dependencies

If `node_modules/` is missing:

```bash
npm install
```

After `npm install` completes, if there are audit warnings, tell the user:
> "The npm audit warnings above are in transitive/dev dependencies and don't affect runtime — safe to ignore."

## Step 3: Login to Ocado

If `session.json` is missing, older than 5 days, or has bad session quality (missing CSRF token):

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

Then repeat the login step. Do not proceed to Step 4 until the session is validated.

## Step 4: Fetch order history

If `data/orders.json` is missing:

```bash
node main.js --update-orders
```

After fetching, **check that orders were actually returned** (an expired session silently returns 0 orders):

```bash
node -e "const o=require('./data/orders.json'); console.log('Orders:', o.length, o.length===0 ? '⚠ WARNING: 0 orders — session may not be authenticated' : '✓')"
```

If 0 orders were returned, warn the user:
> "0 orders were fetched — this usually means the session cookies are expired or invalid. You may need to re-login (Step 3) and then re-fetch orders."

If orders already exist but are older than 7 days, suggest refreshing:
> "Your order history is X days old. Would you like to refresh it?"

## Step 5: Verify

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

## Step 6: Deploy to Google Cloud Run

Now run the `/deploy` command to deploy the MCP server. Pass along the user's authentication choice from the "Before you begin" section:

- **Option A (no auth):** Pass `--no-oauth` to the deploy script
- **Option B (OAuth):** Deploy with OAuth (the default)

**Windows (Git Bash / MSYS2) note:** If `gcloud` was not found during deploy but is installed via the Google Cloud SDK installer, the PATH fix needs to persist across all steps. Run the deploy command like this:

```bash
export PATH="/c/Users/$USERNAME/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"
export PROJECT_ROOT="$(pwd)"
bash scripts/gcp-setup.sh <project-id> <region>
```

## Step 7: Summary

Print a summary:
```
Setup complete!

  Session:  fresh (valid for ~7 days)
  Orders:   X orders loaded
  Search:   working

Available tools:
  - search_items: Search your order history
  - add_to_cart:  Add items to your Ocado cart
  - update_orders: Refresh order history

Tips:
  - Run /refresh to renew your session and redeploy (lightweight, no setup questions)
  - Sessions expire after ~7 days — /refresh will detect this
```
