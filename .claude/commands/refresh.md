# Refresh Ocado Session & Redeploy

You are running the `/refresh` command. This is a lightweight command for returning users who have already completed `/setup` and just need to renew their expired session and push it to Cloud Run.

> **Important:** Execute all steps directly — do NOT tell the user to run other slash commands.

---

## Step 1: Check current session

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
    if (!hasCookies || !hasCsrf || age > 5) console.log('SESSION_STATUS: EXPIRED — refresh needed');
    else console.log('SESSION_STATUS: OK');
  "
else
  echo "SESSION: MISSING — refresh needed"
fi
```

**If session is still fresh** (< 5 days old and has valid cookies + CSRF), tell the user:
> "Your session is only X days old and still valid. Would you like to refresh it anyway?"

If they say no, skip to Step 4 (orders check).

---

## Step 2: Login to Ocado

Tell the user:
> "I'm going to open a browser for you to log in to Ocado. Enter your credentials, complete any CAPTCHA or 2FA, and the browser will close automatically."

```bash
node main.js --login --head
```

---

## Step 3: Validate session

```bash
node -e "
  const s=JSON.parse(require('fs').readFileSync('session.json','utf8'));
  const hasCookies = s.cookies && s.cookies.length > 0;
  const hasCsrf = s.csrfToken && s.csrfToken !== 'undefined' && s.csrfToken !== 'null';
  console.log('Cookies:', hasCookies ? s.cookies.length + ' captured' : 'NONE');
  console.log('CSRF token:', hasCsrf ? s.csrfToken.substring(0,10) + '...' : 'MISSING');
  if (!hasCookies || !hasCsrf) {
    console.log('⚠ Session capture incomplete — login needs to be repeated.');
    process.exit(1);
  }
  console.log('✓ Session captured successfully.');
"
```

If validation fails, tell the user and repeat Step 2. Do not proceed until the session is validated.

---

## Step 4: Fetch order history

```bash
node main.js --update-orders
```

Verify orders were returned:
```bash
node -e "const o=require('./data/orders.json'); console.log('Orders:', o.length, o.length===0 ? '⚠ WARNING: 0 orders — session may not be authenticated' : '✓')"
```

If 0 orders, warn the user that the session may be invalid and suggest re-logging in (Step 2).

---

## Step 5: Auto-detect GCP project and region

Detect the project and region from the existing deployment — the user should not need to remember these:

```bash
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
echo "Project: $PROJECT_ID"
```

```bash
REGION=$(gcloud run services list --filter="metadata.name=ocado-mcp" --format="value(metadata.labels.cloud_googleapis_com_location)" 2>/dev/null | head -1)
if [ -z "$REGION" ]; then
  REGION=$(gcloud run services list --format="csv[no-heading](metadata.name,region)" 2>/dev/null | grep ocado-mcp | cut -d',' -f2 | head -1)
fi
echo "Region: $REGION"
```

If either is empty, ask the user to provide them. Otherwise, confirm:
> "I'll redeploy to project **<project-id>** in region **<region>**. OK?"

---

## Step 6: Redeploy to Cloud Run

Check if the original deployment used OAuth or not:

```bash
gcloud run services describe ocado-mcp --project="$PROJECT_ID" --region="$REGION" --format="value(spec.template.spec.containers[0].env)" 2>/dev/null | grep -q "OAUTH_ENABLED" && echo "AUTH: OAuth" || echo "AUTH: No OAuth"
```

Run the deployment script (it's idempotent — skips already-created resources):

**If no OAuth:**
```bash
bash scripts/gcp-setup.sh --no-oauth "$PROJECT_ID" "$REGION"
```

**If OAuth:**
```bash
bash scripts/gcp-setup.sh "$PROJECT_ID" "$REGION"
```

---

## Step 7: Verify deployment

Get the service URL and test it:

```bash
SERVICE_URL=$(gcloud run services describe ocado-mcp --project="$PROJECT_ID" --region="$REGION" --format="value(status.url)")
echo "Service URL: $SERVICE_URL"
curl -s "$SERVICE_URL/" | head -5
```

Print a summary:
```
Session refreshed and redeployed!

  Service URL:  <service-url>
  MCP Endpoint: <service-url>/mcp
  Session:      fresh (valid for ~7 days)
  Orders:       X orders loaded

No changes needed in Claude — your existing connection will use the refreshed session automatically.
```
