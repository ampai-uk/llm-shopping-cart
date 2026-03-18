require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');
const Operation = require('../modules/Operation');

/**
 * Prepare Items to Add to Cart operation
 * 
 * This operation takes a list of product names (with optional quantities) and
 * matches them against order history to find the correct product IDs.
 * 
 * Input format (via options):
 * {
 *   items: "milk(2), blueberries(3), soda",
 *   orderHistoryFile: "data/orders.json"
 * }
 * 
 * Output format:
 * {
 *   items: [
 *     { productId: "uuid", quantity: 2, matchedName: "M&S Organic Whole Milk 2 Pints" },
 *     ...
 *   ],
 *   unmatched: ["soda"] // items that couldn't be matched
 * }
 */
class PrepareItemsToAddToCart extends Operation {
  constructor(options = {}) {
    super('PrepareItemsToAddToCart');
    this.options = {
      items: options.items || '',
      orders: options.orders || null, // pre-loaded orders array
      orderHistoryFile: options.orderHistoryFile || 'data/orders.json',
      ...options,
    };
  }

  /**
   * Parse the items string into an array of { name, quantity }
   * Supports:
   * - "milk(2), blueberries(3), soda"
   * - "milk(2)\nblueberries(3)\nsoda"
   * - "eggs (-2), milk (3)" (including negative quantities)
   */
  parseItemsString(itemsString) {
    if (!itemsString || typeof itemsString !== 'string') {
      return [];
    }

    // Replace newlines with commas and split by comma
    const normalized = itemsString.replace(/\n/g, ',');
    const parts = normalized.split(',').filter(p => p.trim().length > 0);

    const parsedItems = [];
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Match pattern: "name(number)" or just "name"
      // Supports negative numbers like "eggs (-2)"
      const match = trimmed.match(/^(.+?)\((-?\d+)\)$/);
      
      if (match) {
        parsedItems.push({
          name: match[1].trim(),
          quantity: parseInt(match[2], 10),
        });
      } else {
        parsedItems.push({
          name: trimmed,
          quantity: 1,
        });
      }
    }

    return parsedItems;
  }

  /**
   * Load order history — uses pre-loaded orders if available, otherwise reads from file
   */
  loadOrderHistory() {
    if (this.options.orders) {
      return this.options.orders;
    }
    try {
      const filePath = path.resolve(this.options.orderHistoryFile);
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.warn(`  Could not load order history: ${err.message}`);
    }
    return [];
  }

  /**
   * Extract all products from order history
   * Returns array of { productId, name, orderDate, quantity }
   */
  extractProductsFromOrders(orders) {
    const products = [];
    
    for (const order of orders) {
      const orderDate = order.date;
      const items = order.items || [];
      
      for (const item of items) {
        if (item.productId && item.name) {
          products.push({
            productId: item.productId,
            name: item.name,
            orderDate: orderDate,
            quantity: item.quantity || 1,
          });
        }
      }
    }
    
    return products;
  }

  /**
   * Filter products to recent orders (last N months)
   */
  filterRecentProducts(products, months = 3) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);
    
    return products.filter(p => {
      if (!p.orderDate) return true;
      try {
        const orderDate = new Date(p.orderDate);
        return orderDate >= cutoffDate;
      } catch {
        return true;
      }
    });
  }

  /**
   * Build a Fuse.js index from products for fuzzy matching.
   * Deduplicates by productId, keeping the most recent entry.
   */
  buildFuseIndex(products, threshold) {
    const uniqueProducts = [...new Map(products.map(p => [p.productId, p])).values()];
    return new Fuse(uniqueProducts, {
      keys: ['name'],
      threshold: threshold ?? this.options.threshold ?? 0.4,
      ignoreLocation: true,
      includeScore: true,
      minMatchCharLength: 2,
    });
  }

  /**
   * Count occurrences of each product in the given product list.
   * Returns map of productId -> total quantity ordered.
   */
  countProductOccurrences(products) {
    const counts = new Map();
    for (const p of products) {
      counts.set(p.productId, (counts.get(p.productId) || 0) + p.quantity);
    }
    return counts;
  }

  /**
   * Find the best match for a search term using the Fuse index.
   * Uses fuse score as primary ranking; order frequency as tiebreaker.
   */
  findBestMatch(fuseIndex, allProducts, searchTerm) {
    const results = fuseIndex.search(searchTerm.trim());

    if (results.length === 0) {
      return null;
    }

    // Best (lowest) score among results
    const bestScore = results[0].score;
    // Consider results within a small margin of the best score as ties
    const scoreTolerance = 0.05;
    const topResults = results.filter(r => r.score <= bestScore + scoreTolerance);

    if (topResults.length === 1) {
      return topResults[0].item;
    }

    // Use order frequency as tiebreaker
    const counts = this.countProductOccurrences(allProducts);
    let bestMatch = topResults[0].item;
    let maxCount = counts.get(bestMatch.productId) || 0;

    for (const r of topResults.slice(1)) {
      const count = counts.get(r.item.productId) || 0;
      if (count > maxCount) {
        maxCount = count;
        bestMatch = r.item;
      }
    }

    return bestMatch;
  }

  /**
   * Execute the operation
   */
  async execute() {
    console.log('\n=== Prepare Items to Add to Cart ===\n');
    
    // Parse the items string
    const parsedItems = this.parseItemsString(this.options.items);
    console.log(`Parsed items: ${JSON.stringify(parsedItems, null, 2)}`);
    
    if (parsedItems.length === 0) {
      return {
        items: [],
        unmatched: [],
        message: 'No items provided',
      };
    }

    // Load order history
    console.log(`\nLoading order history from: ${this.options.orderHistoryFile}`);
    const orders = this.loadOrderHistory();
    console.log(`  Found ${orders.length} orders`);

    // Extract all products from orders
    const allProducts = this.extractProductsFromOrders(orders);
    console.log(`  Found ${allProducts.length} products in orders`);

    // Filter to recent products (last 3 months)
    const recentProducts = this.filterRecentProducts(allProducts, 3);
    console.log(`  Products from last 3 months: ${recentProducts.length}`);

    // Build Fuse indexes once
    const recentFuse = this.buildFuseIndex(recentProducts);
    const allFuse = this.buildFuseIndex(allProducts);

    // Match each item
    const resultItems = [];
    const unmatched = [];

    console.log('\nMatching items:');
    const productIdToItems = new Map();

    for (const item of parsedItems) {
      const bestMatch = this.findBestMatch(recentFuse, recentProducts, item.name);
      let matched = null;
      let isFromOldOrders = false;

      if (bestMatch) {
        matched = bestMatch;
      } else {
        // Try to find any match in all products (not just recent)
        const anyMatch = this.findBestMatch(allFuse, allProducts, item.name);

        if (anyMatch) {
          matched = anyMatch;
          isFromOldOrders = true;
        }
      }
      
      if (matched) {
        const logMsg = `  ✓ "${item.name}" -> "${matched.name}" (ID: ${matched.productId}, Qty: ${item.quantity})${isFromOldOrders ? ' [from older orders]' : ''}`;
        console.log(logMsg);
        resultItems.push({
          productId: matched.productId,
          quantity: item.quantity,
          matchedName: matched.name,
        });
        
        // Track which items map to which productId for duplicate detection
        if (!productIdToItems.has(matched.productId)) {
          productIdToItems.set(matched.productId, []);
        }
        productIdToItems.get(matched.productId).push(item.name);
      } else {
        console.log(`  ✗ "${item.name}" -> NOT FOUND`);
        unmatched.push(item.name);
      }
    }

    // Check for duplicate product IDs and report error
    const duplicates = [];
    for (const [productId, itemNames] of productIdToItems) {
      if (itemNames.length > 1) {
        duplicates.push(`Product ID ${productId} matched by: ${itemNames.join(', ')}`);
      }
    }
    
    if (duplicates.length > 0) {
      const errorMsg = `Ambiguous items detected - multiple input items matched to the same product:\n${duplicates.join('\n')}\n\nPlease use more specific product names to differentiate them.`;
      console.error(`\n  ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    console.log(`\n=== Results ===`);
    console.log(`  Matched: ${resultItems.length} items`);
    console.log(`  Unmatched: ${unmatched.length} items`);

    if (unmatched.length > 0) {
      console.log(`  Unmatched items: ${unmatched.join(', ')}`);
    }

    return {
      items: resultItems,
      unmatched: unmatched,
      message: `Prepared ${resultItems.length} items, ${unmatched.length} unmatched`,
    };
  }
}

module.exports = PrepareItemsToAddToCart;
