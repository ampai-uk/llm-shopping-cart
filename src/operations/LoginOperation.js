require('dotenv').config();
const fs = require('fs');
const Operation = require('../modules/Operation');

const EMAIL = process.env.OCADO_EMAIL;
const PASSWORD = process.env.OCADO_PASSWORD;
const SESSION_FILE = './session.json';

/**
 * Login operation - handles user authentication
 * Always performs a fresh login and saves session to session.json
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
    if (!EMAIL || !PASSWORD) {
      throw new Error('Please set OCADO_EMAIL and OCADO_PASSWORD in .env file');
    }

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

    // Wait for SSO page to fully render after redirect
    await this.sleep(5000);

    // 4. Fill in email (SSO page uses name="usernamelogin", type="email")
    console.log('Filling in email...');
    try {
      await page.waitForSelector('input[name="usernamelogin"]', { timeout: 10000 });
      await page.click('input[name="usernamelogin"]');
      await page.type('input[name="usernamelogin"]', EMAIL, { delay: 50 });
      console.log(`  Email entered: ${EMAIL}`);
    } catch (e) {
      console.log(`  Could not find email input: ${e.message}`);
    }

    await this.sleep(500);

    // 5. Fill in password (SSO page uses name="passwordlogin", type="password")
    console.log('Filling in password...');
    try {
      await page.waitForSelector('input[name="passwordlogin"]', { timeout: 10000 });
      await page.click('input[name="passwordlogin"]');
      await page.type('input[name="passwordlogin"]', PASSWORD, { delay: 50 });
      console.log('  Password entered');
    } catch (e) {
      console.log(`  Could not find password input: ${e.message}`);
    }

    await this.sleep(500);

    // 6. Submit login by pressing Enter
    console.log('Submitting login form...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}),
      page.keyboard.press('Enter'),
    ]);

    // 7. Wait for login to complete
    console.log('\nWaiting for login to complete...');
    await this.sleep(3000);

    const finalUrl = page.url();
    console.log(`  Current URL: ${finalUrl}`);

    // Check if login was successful
    if (!finalUrl.includes('accounts.ocado.com') && !finalUrl.includes('sso.ocado.com') && !finalUrl.toLowerCase().includes('login')) {
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
      console.log('  ✗ Login may have failed, still on login page');
      return { success: false, message: 'Login may have failed' };
    }
  }
}

module.exports = LoginOperation;
