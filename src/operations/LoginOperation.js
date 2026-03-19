const fs = require('fs');
const Operation = require('../modules/Operation');

const SESSION_FILE = './session.json';

/**
 * Login operation - opens browser for user to log in manually
 * Waits for the user to complete login, then saves session to session.json
 */
class LoginOperation extends Operation {
  constructor(options = {}) {
    super('Login');
    this.options = { ...options };
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute the login operation
   */
  async execute() {
    const page = this.page;

    // 1. Navigate to ocado.com
    console.log('Navigating to ocado.com...');
    await page.goto('https://www.ocado.com/', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    console.log(`  Loaded: ${page.url()}`);
    await this.sleep(2000);

    // 2. Accept cookies
    console.log('Looking for cookie accept button...');
    try {
      await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 });
      await page.click('#onetrust-accept-btn-handler');
      console.log('  Cookies accepted');
    } catch (e) {
      console.log('  No cookie banner found or already accepted');
    }

    await this.sleep(1000);

    // 3. Navigate to Login page (redirects to sso.ocado.com)
    console.log('Navigating to Login page...');
    await page.goto('https://www.ocado.com/login', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    console.log(`  Loaded: ${page.url()}`);

    // 4. Wait for user to log in manually
    console.log('\n  Please log in manually in the browser window.');
    console.log('  Enter your email and password, complete any CAPTCHA or 2FA, then wait.\n');

    // Poll until we leave the login/SSO pages (max 5 minutes)
    const loginTimeout = 5 * 60 * 1000;
    const startTime = Date.now();
    let loggedIn = false;

    while (Date.now() - startTime < loginTimeout) {
      await this.sleep(2000);
      const currentUrl = page.url();
      if (
        !currentUrl.includes('accounts.ocado.com') &&
        !currentUrl.includes('sso.ocado.com') &&
        !currentUrl.toLowerCase().includes('login')
      ) {
        loggedIn = true;
        break;
      }
    }

    const finalUrl = page.url();
    console.log(`  Current URL: ${finalUrl}`);

    if (loggedIn) {
      console.log('  ✓ Login successful!');

      // Extract CSRF token from window.__INITIAL_STATE__
      console.log('\nExtracting CSRF token...');
      let csrfToken = null;
      try {
        csrfToken = await page.evaluate(() => {
          if (window.__INITIAL_STATE__?.session?.csrf?.token) {
            return window.__INITIAL_STATE__.session.csrf.token;
          }
          return null;
        });

        if (csrfToken) {
          console.log(`  CSRF token found: ${csrfToken.substring(0, 10)}...`);
        } else {
          console.log('  CSRF token not found in __INITIAL_STATE__');
        }
      } catch (e) {
        console.log(`  Error extracting CSRF token: ${e.message}`);
      }

      // Always save session
      console.log('\nSaving session to file...');
      const cookies = await page.cookies();
      const session = { cookies, csrfToken };
      fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
      console.log(`  Saved ${cookies.length} cookies + CSRF token to ${SESSION_FILE}`);

      return {
        success: true,
        message: 'Login successful',
        csrfToken: csrfToken,
      };
    } else {
      console.log('  ✗ Login timed out — no login detected within 5 minutes');
      return { success: false, message: 'Login timed out' };
    }
  }
}

module.exports = LoginOperation;
