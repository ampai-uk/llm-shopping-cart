/**
 * Base class for all modular operations
 * Each operation receives a browser context and returns result
 */
class Operation {
  constructor(name) {
    this.name = name;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * Initialize the operation with browser resources
   * @param {Browser} browser - Puppeteer/Playwright browser instance
   * @param {BrowserContext} context - Browser context
   * @param {Page} page - Browser page
   */
  async init(browser, context, page) {
    this.browser = browser;
    this.context = context;
    this.page = page;
  }

  /**
   * Execute the operation - to be implemented by subclasses
   * @returns {Promise<any>} - Operation result
   */
  async execute() {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Clean up resources after operation completes
   */
  async cleanup() {
    // Override in subclass if needed
  }
}

module.exports = Operation;
