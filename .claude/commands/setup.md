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
> The server will be accessible via a private URL with no login required. Anyone with the URL can search your order history and add items to your cart. This is simpler to set up and suitable if you keep the URL private.
>
> **Option B: OAuth authentication (more secure)**
> The server will require OAuth 2.0 authentication. This adds extra setup steps (creating OAuth secrets) but ensures only authorized users can access your server.
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
> - At **Step 3**, a browser will open and you'll need to **enter your Ocado credentials manually**.
> - At **Step 6**, you'll need to **manually link a billing account** to your GCP project if one isn't already linked.
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

# Check orders
test -f data/orders.json && echo "ORDERS: OK" || echo "ORDERS: MISSING"

# Count orders if file exists
if [ -f data/orders.json ]; then
  ORDER_COUNT=$(node -e "const d=require('./data/orders.json'); console.log(Array.isArray(d)?d.length:Object.keys(d).length)" 2>/dev/null || echo "unknown")
  echo "ORDER_COUNT: ${ORDER_COUNT}"
fi
```

Tell the user which steps will be performed and which are already done.

## Step 2: Install dependencies

If `node_modules/` is missing:

```bash
npm install
```

## Step 3: Login to Ocado

If `session.json` is missing OR older than 5 days:

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

Wait for it to complete and verify `session.json` was created.

## Step 4: Fetch order history

If `data/orders.json` is missing:

```bash
node main.js --update-orders
```

Report how many orders were fetched.

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

Now run the `/deploy` command to deploy the MCP server. Pass along the user's authentication choice from the "Before you begin" section.

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
  - Re-run /setup any time to refresh your session or orders
  - Sessions expire after ~7 days — /setup will detect this
```
