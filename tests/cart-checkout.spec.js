const { test, expect } = require('@playwright/test');

test.describe('Cart and Checkout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for products to load
    await page.waitForSelector('#product-grid-target .group', { timeout: 10000 });
  });

  test('should add item to cart and show in cart drawer', async ({ page }) => {
    // Add first product to cart using quick add
    await page.locator('.quick-add-btn').first().click();
    
    // Wait for notification
    await expect(page.locator('#app-notification')).toContainText('Added to bag', { timeout: 5000 });
    
    // Open cart
    await page.click('#cart-toggle-btn');
    await page.waitForSelector('#cart-sidebar', { state: 'visible' });
    
    // Verify item is in cart
    await expect(page.locator('#cart-items-container')).not.toContainText('empty');
    await expect(page.locator('.remove-cart-item')).toBeVisible();
  });

  test('should remove item from cart', async ({ page }) => {
    // Add item to cart
    await page.locator('.quick-add-btn').first().click();
    await expect(page.locator('#app-notification')).toContainText('Added to bag', { timeout: 5000 });
    
    // Open cart
    await page.click('#cart-toggle-btn');
    await page.waitForSelector('#cart-sidebar', { state: 'visible' });
    
    // Get initial item count
    const initialCount = await page.locator('.remove-cart-item').count();
    expect(initialCount).toBeGreaterThan(0);
    
    // Remove first item
    await page.locator('.remove-cart-item').first().click();
    
    // Verify item removed
    const newCount = await page.locator('.remove-cart-item').count();
    expect(newCount).toBe(initialCount - 1);
  });

  test('should update cart total when items added', async ({ page }) => {
    // Add first item
    await page.locator('.quick-add-btn').first().click();
    await expect(page.locator('#app-notification')).toContainText('Added to bag', { timeout: 5000 });
    
    // Check cart total
    await page.click('#cart-toggle-btn');
    await page.waitForSelector('#cart-sidebar', { state: 'visible' });
    
    const totalText = await page.locator('#cart-total-price').textContent();
    expect(totalText).toContain('GH₵');
    expect(totalText).not.toBe('GH₵ 0.00');
  });

  test('should navigate to checkout page', async ({ page }) => {
    // Add item to cart
    await page.locator('.quick-add-btn').first().click();
    await expect(page.locator('#app-notification')).toContainText('Added to bag', { timeout: 5000 });
    
    // Navigate to checkout
    await page.goto('/#/checkout');
    
    // Verify checkout page loaded
    await expect(page.locator('#checkout-form')).toBeVisible();
    await expect(page.locator('text=Delivery details')).toBeVisible();
  });

  test('should require login for checkout', async ({ page }) => {
    // Make sure we're not logged in
    await page.evaluate(() => {
      sessionStorage.removeItem('pj_customer_token');
      sessionStorage.removeItem('pj_customer_name');
      sessionStorage.removeItem('pj_customer_email');
    });
    
    // Add item to cart
    await page.locator('.quick-add-btn').first().click();
    await expect(page.locator('#app-notification')).toContainText('Added to bag', { timeout: 5000 });
    
    // Try to navigate to checkout
    await page.goto('/#/checkout');
    
    // Should redirect to home and show auth modal
    await page.waitForURL('**/#/', { timeout: 5000 });
    await expect(page.locator('#auth-modal')).toBeVisible();
  });

  test('should validate checkout form fields', async ({ page }) => {
    // Add item to cart
    await page.locator('.quick-add-btn').first().click();
    await expect(page.locator('#app-notification')).toContainText('Added to bag', { timeout: 5000 });
    
    // Navigate to checkout
    await page.goto('/#/checkout');
    
    // Try to submit empty form
    await page.click('#checkout-form button[type="submit"]');
    
    // Should show validation errors (browser's built-in validation)
    const nameInput = page.locator('#c-name');
    await expect(nameInput).toBeFocused();
  });

  test('should display checkout summary with cart items', async ({ page }) => {
    // Add item to cart
    await page.locator('.quick-add-btn').first().click();
    await expect(page.locator('#app-notification')).toContainText('Added to bag', { timeout: 5000 });
    
    // Navigate to checkout
    await page.goto('/#/checkout');
    
    // Verify summary section shows items
    await expect(page.locator('text=Summary')).toBeVisible();
    await expect(page.locator('text=Grand Total')).toBeVisible();
    await expect(page.locator('#cart-total-price')).toContainText('GH₵');
  });

  test('should show sandbox checkout button', async ({ page }) => {
    // Add item to cart
    await page.locator('.quick-add-btn').first().click();
    await expect(page.locator('#app-notification')).toContainText('Added to bag', { timeout: 5000 });
    
    // Navigate to checkout
    await page.goto('/#/checkout');
    
    // Verify sandbox button exists
    await expect(page.locator('#sandbox-checkout-btn')).toBeVisible();
    await expect(page.locator('#sandbox-checkout-btn')).toContainText('Sandbox');
  });

  test('should display correct item count in cart badge', async ({ page }) => {
    // Add item
    await page.locator('.quick-add-btn').first().click();
    await expect(page.locator('#app-notification')).toContainText('Added to bag', { timeout: 5000 });
    
    // Check badge shows 1
    await expect(page.locator('#cart-badge-count')).toContainText('1');
    
    // Add another item by quick add
    const quickAddButtons = await page.locator('.quick-add-btn').all();
    if (quickAddButtons.length > 1) {
      await quickAddButtons[1].click();
      await expect(page.locator('#app-notification')).toContainText('Added to bag', { timeout: 5000 });
      
      // Check badge shows 2
      await expect(page.locator('#cart-badge-count')).toContainText('2');
    }
  });
});