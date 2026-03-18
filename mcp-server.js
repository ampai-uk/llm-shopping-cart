#!/usr/bin/env node
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { searchItems, addToCart, updateOrders } = require('./src/ocado-service');

const server = new McpServer({
  name: 'ocado',
  version: '1.0.0',
});

server.tool(
  'search_items',
  `Fuzzy-match items against Ocado order history without adding to cart.
Use this only if the user wants to preview what products would be matched before committing to add_to_cart.
If user wants to add items to the cart, use add_to_cart instead.
Items are matched against previously ordered products, so only items the user has ordered before will match.

Examples:
  "milk" -> matches "M&S Organic Whole Milk 2 Pints"
  "eggs, bread, cheese" -> matches each against order history
  "milk(2), eggs(6)" -> matches with quantities (useful for add_to_cart later)

The response includes:
  - items: matched products with productId, quantity, matchedName
  - unmatched: items that couldn't be found in order history

If items come back as unmatched, try more specific names or different terms.
Always show the user the matched product names so they can confirm before adding to cart.`,
  {
    items: z.string().describe('Comma-separated list of items, e.g. "milk, eggs, bread". Optional quantities: "milk(2), eggs(6)"'),
    threshold: z.number().min(0).max(1).optional().describe('Fuzzy match threshold (0=exact, 1=loose). Default 0.4'),
  },
  async ({ items, threshold }) => {
    try {
      const result = await searchItems(items, { threshold });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  'add_to_cart',
  `This tool is used to add items to the Ocado online grocery cart. User can provide list of items to add to the cart. 
  Internally the function will perform fuzzy matching against the order history to find the correct products to add to the cart.
  This function requires a valid session — if you get an auth error, tell the user to run "node main.js --login" first.

Pass all items in a single call rather than one at a time.

Examples:
  "milk, eggs, bread" -> adds 1 of each
  "milk(2), eggs(6), blueberries(3)" -> adds with specific quantities
  "milk(-1)" -> removes 1 milk from the cart
  "high protein cheese" -> fuzzy matches to e.g. "Cathedral City High Protein Half Fat Cheddar Cheese"

The response includes:
  - itemsAdded: what was matched and added (with productId, quantity, matchedName)
  - unmatched: items that couldn't be found in order history — tell the user about these
  - cart: full current cart contents after the update, with item names, quantities and prices

Always show the user:
1. What was added (and what was unmatched)
2. The full cart content with item names, quantities, prices, and price
2. The total price of the cart`,
  {
    items: z.string().describe('Comma-separated list of items, e.g. "milk, eggs, bread". Optional quantities: "milk(2), eggs(6)"'),
    threshold: z.number().min(0).max(1).optional().describe('Fuzzy match threshold (0=exact, 1=loose). Default 0.4'),
  },
  async ({ items, threshold }) => {
    try {
      const result = await addToCart(items, { threshold });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  'update_orders',
  `Fetch latest Ocado order history via API and save to local data file.
  The data file is then used to perform fuzzy matching against the order history to find the correct products to add to the cart.
Requires a valid session — if you get an auth error, tell the user to run "node main.js --login" first.

Run this when the user wants to refresh their order history, e.g. after a new delivery.
The order history is what search_items and add_to_cart match against, so it needs to be up to date.

The response includes order details with items, prices, and delivery dates.`,
  {
    months: z.number().optional().describe('How many months of order history to fetch. Default 3'),
  },
  async ({ months }) => {
    try {
      const result = await updateOrders({ months });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
