# Ocado MCP Server

An MCP (Model Context Protocol) server that lets Claude interact with [Ocado](https://www.ocado.com), the UK online grocery service. Search your order history and add items to your cart via natural language.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with your Ocado credentials:
   ```
   OCADO_EMAIL=your@email.com
   OCADO_PASSWORD=your-password
   ```

3. Log in to Ocado (opens a browser — you may need to handle CAPTCHA/2FA manually):
   ```bash
   node main.js --login --head
   ```

4. Fetch your order history:
   ```bash
   node main.js --update-orders
   ```

## CLI Usage

```
node main.js <operation> [modifiers]
```

At least one operation flag is required.

### Operations

| Flag | Description |
|------|-------------|
| `--login` | Open a browser to log in to Ocado. Saves session to `session.json`. |
| `--add-to-cart <items>` | Fuzzy-match items against order history and add them to your cart. |
| `--get-cart` | Display current cart contents. |
| `--update-orders` | Fetch and cache order history from Ocado. |

`--add-to-cart` and `--update-orders` are mutually exclusive.

### Modifiers

| Flag | Description | Default |
|------|-------------|---------|
| `--head` | Run browser in headed (visible) mode | headless |
| `--use-browser` | Use browser for cart/order operations instead of API | API mode |
| `--stealth` | Use puppeteer-extra stealth plugin | off |
| `--pre-prep-items-only` | Only fuzzy-match items, don't add to cart (requires `--add-to-cart`) | off |
| `--order-history-months=N` | How many months of order history to fetch | 3 |
| `--order-history-file=PATH` | Path to order history JSON file | `data/orders.json` |
| `--threshold=N` | Fuzzy match threshold (0–1, lower = stricter) | 0.4 |

## MCP Server

**Stdio server** (for Claude Code local use):
```bash
node mcp-server.js
```

**HTTP/SSE server** (for Cloud Run / Claude Connectors):
```bash
node mcp-server-http.js
```

### Available Tools

| Tool | Description |
|------|-------------|
| `search_items` | Fuzzy-match items against order history (preview only, no cart changes) |
| `add_to_cart` | Fuzzy-match and add items to Ocado cart |
| `update_orders` | Fetch latest order history from Ocado |
