require('dotenv').config({ quiet: true });
const fs = require('fs');
const BrowserManager = require('./src/browser/BrowserManager');
const { LoginOperation, ScrapeOrdersOperation, AddToCartOperation, PrepareItemsToAddToCart } = require('./src/operations');

const SESSION_FILE = './session.json';

// -----------------------------------------------------------------------------
// Helper function to parse command line arguments with values
// Supports both --arg=value and --arg "value" formats
// -----------------------------------------------------------------------------
function parseArg(args, argName) {
  // First try --arg=value format
  let arg = args.find(a => a.startsWith(argName + '='));
  if (arg) {
    return arg.split('=')[1];
  }

  // Then try --arg "value" format (arg followed by next item)
  const argIndex = args.findIndex(a => a === argName);
  if (argIndex !== -1 && args[argIndex + 1]) {
    return args[argIndex + 1];
  }

  return null;
}

function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) {
    throw new Error(`Session file not found: ${SESSION_FILE}. Run with --login first.`);
  }
  const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  console.log(`Loaded session: ${session.cookies.length} cookies, CSRF token: ${session.csrfToken?.substring(0, 10)}...`);
  return session;
}

// -----------------------------------------------------------------------------
// Main execution
// -----------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const login = args.includes('--login');
  const itemsArg = parseArg(args, '--add-to-cart');
  const getCart = args.includes('--get-cart');
  const updateOrders = args.includes('--update-orders');
  const useBrowser = args.includes('--use-browser');
  const head = args.includes('--head');
  const useStealth = args.includes('--stealth');
  const prepareOnly = args.includes('--pre-prep-items-only');

  // Parse value arguments
  const orderHistoryArg = args.find(arg => arg.startsWith('--order-history-months='));
  const orderHistoryMonths = orderHistoryArg ? parseInt(orderHistoryArg.split('=')[1], 10) : 3;
  const orderHistoryFile = parseArg(args, '--order-history-file') || 'data/orders.json';
  const thresholdArg = parseArg(args, '--threshold');
  const threshold = thresholdArg != null ? parseFloat(thresholdArg) : 0.4;

  // Validation: --add-to-cart and --update-orders are mutually exclusive
  if (itemsArg && updateOrders) {
    console.error('Error: --add-to-cart and --update-orders are mutually exclusive. Use one at a time.');
    process.exit(1);
  }

  // Validation: --pre-prep-items-only requires --add-to-cart
  if (prepareOnly && !itemsArg) {
    console.error('Error: --pre-prep-items-only requires --add-to-cart.');
    process.exit(1);
  }

  // Validation: must specify at least one operation
  if (!login && !itemsArg && !getCart && !updateOrders) {
    console.error('Error: Specify at least one of --login, --add-to-cart, --get-cart, or --update-orders.');
    process.exit(1);
  }

  // --- (a2) --pre-prep-items-only: run PrepareItemsToAddToCart only, no browser/session ---
  if (prepareOnly) {
    console.log('=== Prepare Items Only Mode ===\n');
    console.log(`Items to prepare: "${itemsArg}"`);
    console.log(`Order history file: ${orderHistoryFile}`);
    const prep = new PrepareItemsToAddToCart({
      items: itemsArg,
      orderHistoryFile: orderHistoryFile,
      threshold: threshold,
    });
    const result = await prep.execute();
    console.log(`\nResult: ${JSON.stringify(result, null, 2)}`);
    return;
  }

  let session = null;

  // --- (b) --login: launch browser, login, save session ---
  if (login) {
    console.log('=== Login ===\n');
    const browserManager = new BrowserManager({
      headless: !head,
      useStealth: useStealth,
    });

    try {
      const { browser, context, page } = await browserManager.launch();
      const loginOp = new LoginOperation();
      await loginOp.init(browser, context, page);
      const result = await loginOp.execute();

      if (!result.success) {
        console.error('Login failed.');
        process.exit(1);
      }

      // Wait for session to stabilize
      console.log('Waiting for session to stabilize...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } finally {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await browserManager.close();
    }

    // Load the freshly saved session
    session = loadSession();
  }

  // --- (c) Load session from file if --login was not used ---
  if (!login && (itemsArg || getCart || updateOrders)) {
    session = loadSession();
  }

  // --- (d) --add-to-cart ---
  if (itemsArg) {
    console.log('\n=== Add To Cart ===\n');
    console.log(`Items to prepare: "${itemsArg}"`);
    console.log(`Order history file: ${orderHistoryFile}`);

    // Prepare items (fuzzy match against order history)
    const prep = new PrepareItemsToAddToCart({
      items: itemsArg,
      orderHistoryFile: orderHistoryFile,
      threshold: threshold,
    });
    const prepResult = await prep.execute();

    if (!prepResult.items || prepResult.items.length === 0) {
      console.log('\nNo items to add to cart.');
      return;
    }

    if (useBrowser) {
      // Browser mode
      const browserManager = new BrowserManager({
        headless: !head,
        useStealth: useStealth,
      });
      try {
        const { browser, context, page } = await browserManager.launch();

        // Load session into browser
        if (session.cookies) {
          await page.setCookie(...session.cookies);
        }
        await page.goto('https://www.ocado.com/', { waitUntil: 'networkidle0', timeout: 30000 });

        const addToCart = new AddToCartOperation({
          items: prepResult.items,
          csrfToken: session.csrfToken,
        });
        await addToCart.init(browser, context, page);
        await addToCart.execute();
      } finally {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await browserManager.close();
      }
    } else {
      // Browserless mode (default)
      const addToCart = new AddToCartOperation({
        items: prepResult.items,
        csrfToken: session.csrfToken,
        cookies: session.cookies,
      });
      await addToCart.execute();
    }

    console.log('\n=== Add To Cart Completed ===');
  }

  // --- (d2) --get-cart ---
  if (getCart) {
    console.log('\n=== Get Cart ===\n');
    const { getCart: getCartFn } = require('./src/ocado-service');
    const cartData = await getCartFn();
    console.log(JSON.stringify(cartData, null, 2));
    console.log('\n=== Get Cart Completed ===');
  }

  // --- (e) --update-orders ---
  if (updateOrders) {
    console.log('\n=== Update Orders ===\n');

    if (useBrowser) {
      // Browser mode
      const browserManager = new BrowserManager({
        headless: !head,
        useStealth: useStealth,
      });
      try {
        const { browser, context, page } = await browserManager.launch();

        // Load session into browser
        if (session.cookies) {
          await page.setCookie(...session.cookies);
        }
        await page.goto('https://www.ocado.com/', { waitUntil: 'networkidle0', timeout: 30000 });

        const scrapeOrders = new ScrapeOrdersOperation({
          orderHistoryMonths: orderHistoryMonths,
          csrfToken: session.csrfToken,
        });
        await scrapeOrders.init(browser, context, page);
        await scrapeOrders.execute();
      } finally {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await browserManager.close();
      }
    } else {
      // Browserless mode (default)
      const scrapeOrders = new ScrapeOrdersOperation({
        orderHistoryMonths: orderHistoryMonths,
        csrfToken: session.csrfToken,
        cookies: session.cookies,
      });
      await scrapeOrders.execute();
    }

    console.log('\n=== Update Orders Completed ===');
  }

  console.log('\n=== All Operations Completed ===');
}

// Export for programmatic use
module.exports = { LoginOperation, ScrapeOrdersOperation, PrepareItemsToAddToCart, AddToCartOperation };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
