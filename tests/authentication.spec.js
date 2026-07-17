const { test, expect } = require('@playwright/test');

test.describe('Customer Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Open auth modal
    await page.click('#auth-login-btn');
    await page.waitForSelector('#auth-modal', { state: 'visible' });
  });

  test('should display sign in form by default', async ({ page }) => {
    await expect(page.locator('#auth-view-signin')).toBeVisible();
    await expect(page.locator('#signin-form')).toBeVisible();
    await expect(page.locator('#auth-view-signup')).toBeHidden();
    await expect(page.locator('#auth-view-forgot')).toBeHidden();
  });

  test('should switch to sign up view', async ({ page }) => {
    await page.click('#switch-to-signup');
    await expect(page.locator('#auth-view-signup')).toBeVisible();
    await expect(page.locator('#auth-view-signin')).toBeHidden();
  });

  test('should switch to forgot password view', async ({ page }) => {
    await page.click('#forgot-password-btn');
    await expect(page.locator('#auth-view-forgot')).toBeVisible();
    await expect(page.locator('#forgot-step-1')).toBeVisible();
  });

  test('should close auth modal', async ({ page }) => {
    await page.click('#auth-modal-close');
    await expect(page.locator('#auth-modal')).toBeHidden();
  });

  test('should show error on empty sign in', async ({ page }) => {
    await page.click('#signin-form button[type="submit"]');
    await expect(page.locator('#auth-modal-error')).toContainText('required');
  });

  test('should show error on invalid credentials', async ({ page }) => {
    await page.fill('#signin-email', 'invalid@example.com');
    await page.fill('#signin-password', 'wrongpassword');
    await page.click('#signin-form button[type="submit"]');
    
    await expect(page.locator('#auth-modal-error')).toContainText('does not exist');
  });

  test('should successfully sign in with valid credentials', async ({ page }) => {
    // Note: This test assumes a test user exists or you mock the API
    await page.fill('#signin-email', 'test@payjay.com');
    await page.fill('#signin-password', 'TestPass123!');
    await page.click('#signin-form button[type="submit"]');
    
    // Wait for success notification
    await expect(page.locator('#app-notification')).toContainText('Welcome back', { timeout: 10000 });
    await expect(page.locator('#auth-modal')).toBeHidden();
  });

  test('should successfully sign up new customer', async ({ page }) => {
    // Switch to signup view
    await page.click('#switch-to-signup');
    
    // Fill signup form
    const timestamp = Date.now();
    await page.fill('#signup-name', `Test User ${timestamp}`);
    await page.fill('#signup-email', `test${timestamp}@example.com`);
    await page.fill('#signup-password', 'SecurePass123!');
    await page.selectOption('#signup-region', 'Greater Accra');
    
    // Submit form
    await page.click('#signup-form button[type="submit"]');
    
    // Wait for success
    await expect(page.locator('#app-notification')).toContainText('Welcome', { timeout: 10000 });
    await expect(page.locator('#auth-modal')).toBeHidden();
  });

  test('should enforce password requirements on signup', async ({ page }) => {
    await page.click('#switch-to-signup');
    
    // Try weak password
    await page.fill('#signup-name', 'Test User');
    await page.fill('#signup-email', 'test@example.com');
    await page.fill('#signup-password', 'weak');
    await page.selectOption('#signup-region', 'Greater Accra');
    await page.click('#signup-form button[type="submit"]');
    
    await expect(page.locator('#auth-modal-error')).toContainText('8 characters');
  });

  test('should request password reset code', async ({ page }) => {
    await page.click('#forgot-password-btn');
    
    await page.fill('#forgot-email', 'test@payjay.com');
    await page.click('#forgot-send-btn');
    
    // Should show step 2 (enter code)
    await expect(page.locator('#forgot-step-2')).toBeVisible({ timeout: 10000 });
  });

  test('should allow resending reset code', async ({ page }) => {
    await page.click('#forgot-password-btn');
    await page.fill('#forgot-email', 'test@payjay.com');
    await page.click('#forgot-send-btn');
    
    await expect(page.locator('#forgot-step-2')).toBeVisible({ timeout: 10000 });
    
    await page.click('#resend-code-btn');
    await expect(page.locator('#app-notification')).toContainText('sent', { timeout: 5000 });
  });

  test('should return to signin from forgot password', async ({ page }) => {
    await page.click('#forgot-password-btn');
    await expect(page.locator('#auth-view-forgot')).toBeVisible();
    
    await page.click('#back-to-signin');
    await expect(page.locator('#auth-view-signin')).toBeVisible();
  });

  test('should log out when logged in', async ({ page }) => {
    // First sign in
    await page.fill('#signin-email', 'test@payjay.com');
    await page.fill('#signin-password', 'TestPass123!');
    await page.click('#signin-form button[type="submit"]');
    await expect(page.locator('#auth-modal')).toBeHidden({ timeout: 10000 });
    
    // Click logout
    await page.click('#logout-btn');
    
    // Should show login button again
    await expect(page.locator('#auth-login-btn')).toBeVisible();
  });
});