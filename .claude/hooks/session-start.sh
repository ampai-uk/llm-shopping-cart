#!/usr/bin/env bash
# Ocado MCP session status hook
# Prints a status banner when a Claude session starts

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Check setup state
HAS_MODULES=false
HAS_ENV=false
HAS_SESSION=false
HAS_ORDERS=false
SESSION_AGE_DAYS=0
ORDER_COUNT=0

[ -d "$PROJECT_ROOT/node_modules" ] && HAS_MODULES=true
[ -f "$PROJECT_ROOT/.env" ] && HAS_ENV=true
[ -f "$PROJECT_ROOT/session.json" ] && HAS_SESSION=true
[ -f "$PROJECT_ROOT/data/orders.json" ] && HAS_ORDERS=true

# Calculate session age
if [ "$HAS_SESSION" = true ]; then
  SESSION_MTIME=$(stat -c %Y "$PROJECT_ROOT/session.json" 2>/dev/null || stat -f %m "$PROJECT_ROOT/session.json" 2>/dev/null)
  if [ -n "$SESSION_MTIME" ]; then
    NOW=$(date +%s)
    SESSION_AGE_DAYS=$(( (NOW - SESSION_MTIME) / 86400 ))
  fi
fi

# Count orders
if [ "$HAS_ORDERS" = true ]; then
  ORDER_COUNT=$(node -e "try{const d=require('$PROJECT_ROOT/data/orders.json');console.log(Array.isArray(d)?d.length:Object.keys(d).length)}catch(e){console.log(0)}" 2>/dev/null || echo "0")
fi

# Print status
if [ "$HAS_MODULES" = true ] && [ "$HAS_ENV" = true ] && [ "$HAS_SESSION" = true ] && [ "$HAS_ORDERS" = true ]; then
  if [ "$SESSION_AGE_DAYS" -ge 5 ]; then
    echo "Ocado MCP: Session may be expired (${SESSION_AGE_DAYS}d old) — run /setup to refresh"
  else
    echo "Ocado MCP: Ready (session: ${SESSION_AGE_DAYS}d old, ${ORDER_COUNT} orders loaded)"
  fi
else
  MISSING=""
  [ "$HAS_MODULES" = false ] && MISSING="$MISSING dependencies,"
  [ "$HAS_ENV" = false ] && MISSING="$MISSING credentials,"
  [ "$HAS_SESSION" = false ] && MISSING="$MISSING session,"
  [ "$HAS_ORDERS" = false ] && MISSING="$MISSING orders,"
  MISSING="${MISSING%,}"  # trim trailing comma
  echo "Ocado MCP: Setup incomplete (missing:$MISSING) — run /setup to get started"
fi
