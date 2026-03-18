# Ocado MCP Server — Bootstrap Instructions

> **This file is written for Claude, not for humans.**
> When a user pastes the raw GitHub URL of this file into Claude Code or Cowork, Claude should read these instructions and execute them step-by-step to set up the Ocado MCP server from scratch.

---

## Step 1: Check / install git

Check if `git` is available:

```bash
git --version
```

If `git` is not found, detect the OS and offer to install it:
- **macOS**: `xcode-select --install` or `brew install git`
- **Ubuntu/Debian**: `sudo apt update && sudo apt install -y git`
- **Fedora/RHEL**: `sudo dnf install -y git`
- **Windows (WSL)**: `sudo apt install -y git`

**Always ask the user for permission before installing anything.**

---

## Step 2: Check / install Node.js

Check if `node` (v18+) and `npm` are available:

```bash
node --version
npm --version
```

If Node.js is missing or below v18, suggest installation:
- **Recommended**: Install via [nvm](https://github.com/nvm-sh/nvm):
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  source ~/.bashrc   # or ~/.zshrc
  nvm install 20
  ```
- **Alternative**: Download from https://nodejs.org/ (LTS version)

**Always ask the user for permission before installing anything.**

---

## Step 3: Clone the repository

Clone the repo to a sensible default location. Ask the user where they'd like it, defaulting to `~/ocado-mcp`:

```bash
git clone https://github.com/<owner>/ocado.git ~/ocado-mcp
cd ~/ocado-mcp
```

Replace `<owner>` with the actual GitHub username/org from the URL the user originally pasted.

---

## Step 4: Run `/setup`

Now that the repo is cloned and you are inside it, the `.claude/commands/setup.md` slash command is available. Run it:

```
/setup
```

This handles: `npm install`, `.env` configuration, Ocado login, order history fetch, and verification.

---

## Step 5: Configure MCP for Claude

Add the Ocado MCP server to the user's Claude configuration so it's available globally.

For **Claude Code**, add to `~/.claude/.mcp.json` (create if it doesn't exist):

```json
{
  "mcpServers": {
    "ocado": {
      "command": "node",
      "args": ["<full-path-to-cloned-repo>/mcp-server.js"],
      "cwd": "<full-path-to-cloned-repo>"
    }
  }
}
```

Replace `<full-path-to-cloned-repo>` with the absolute path where the repo was cloned (e.g. `/home/username/ocado-mcp`).

Tell the user:
- The Ocado MCP server is now configured and will be available in all future Claude Code sessions
- They can use it to search their order history and add items to their Ocado cart
- Run `/setup` any time to refresh their session or update order history
- Run `/deploy` to deploy to Google Cloud Run for use with Claude.ai Connectors
