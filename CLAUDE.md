# Ocado MCP Server

An MCP (Model Context Protocol) server that lets Claude interact with Ocado, the UK online grocery service. Users can search their order history and add items to their cart via natural language.

## Architecture

- `mcp-server.js` — Stdio-based MCP server (for Claude Code local use)
- `mcp-server-http.js` — HTTP/SSE MCP server with OAuth (for Cloud Run / Claude Connectors)
- `main.js` — CLI for login, order fetching, and cart operations
- `src/ocado-service.js` — Core business logic (search, add-to-cart, update-orders)
- `src/operations/` — Browser automation operations (login, scrape orders, add to cart)
- `src/browser/BrowserManager.js` — Puppeteer/Playwright browser management

## Setup State Machine

Use this to diagnose the current state and determine what action is needed:

```
State            Check                        Fix
─────────────    ──────────────────────────    ────────────────────────────────
FRESH            no node_modules/             npm install
NO_SESSION       no session.json              node main.js --login --head
NO_ORDERS        no data/orders.json          node main.js --update-orders
READY            all files present            MCP server works
```

Run `/setup` to walk through all states interactively.

## Session Management

- Sessions are stored in `session.json` (cookies + CSRF token)
- Sessions expire after ~7 days
- When expired, the user needs to re-login: `node main.js --login --head`
- Login opens a real browser — the user enters credentials manually and may need to handle CAPTCHA or 2FA

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `search_items` | Fuzzy-match items against order history (preview, no cart changes) |
| `add_to_cart` | Fuzzy-match and add items to Ocado cart |
| `update_orders` | Fetch latest order history from Ocado API |

## Key Commands

```bash
node main.js --login --head          # Login (opens browser)
node main.js --update-orders         # Fetch order history
node mcp-server.js                   # Start stdio MCP server
node mcp-server-http.js              # Start HTTP MCP server (for Cloud Run)
```

## Slash Commands

- `/setup` — Guided setup wizard (idempotent, safe to re-run)
- `/deploy` — Deploy to Google Cloud Run

## Files Not in Git

These files contain sensitive data and are gitignored:

- `session.json` — Browser session cookies
- `cookies.json` / `cookies-play.json` — Raw cookie exports
- `data/orders.json` — Order history cache
