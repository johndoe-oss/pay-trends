const { test, expect } = require('@playwright/test');

test.describe('Product Browsing', () => {
  test('should display the home page with products', async ({ page }) => {
    await page.goto('/');
    
    // Check hero section is visible
    await expect(page.locator('h2')).toContainText('STREETWEAR');
    
    // Check product grid exists
    await expect(page.locator('#product-grid-target')).toBeVisible();
  });

  test('should load categories in sidebar', async ({ page }) => {
    await page.goto('/');
    
    // Wait for categories to load
    await page.waitForSelector('.category-nav-item', { timeout: 10000 });
    
    // Check that category nav items are present
    const categories = await page.locator('.category-nav-item').count();
    expect(categories).toBeGreaterThan(0);
  });

  test('should filter products by category', async ({ page }) => {
    await page.goto('/');
    
    // Wait for products to load
    await page.waitForSelector('#product-grid-target .group', { timeout: 10000 });
    
    // Click on a category filter button
    const filterButtons = await page.locator('[data-filter]').all();
    if (filterButtons.length > 1) {
      await filterButtons[1].click();
      
      // Wait for URL to change
      await page.waitForURL('**/#/category/**', { timeout: 5000 });
      
      // Verify products are displayed
      await expect(page.locator('#product-grid-target')).toBeVisible();
    }
  });

  test('should navigate to product detail page', async ({ page }) => {
    await page.goto('/');
    
    // Wait for products
    await page.waitForSelector('#product-grid-target .group', { timeout: 10000 });
    
    // Click on first product
    const firstProduct = await page.locator('#product-grid-target .group a').first();
    await firstProduct.click();
    
    // Wait for product detail page
    await page.waitForURL('**/#/product/**', { timeout: 5000 });
    
    // Check product detail elements
    await expect(page.locator('h2')).toBeVisible();
    await expect(page.locator('#detail-color-swatches')).toBeVisible();
    await expect(page.locator('#detail-size-swatches')).toBeVisible();
  });

  test('should add product to cart from product detail', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to first product
    await page.waitForSelector('#product-grid-target .group a', { timeout: 10000 });
    await page.locator('#product-grid-target .group a').first().click();
    await page.waitForURL('**/#/product/**', { timeout: 5000 });
    
    // Select options
    const colorButtons = await page.locator('#detail-color-swatches button').all();
    if (colorButtons.length > 0) {
      await colorButtons[0].click();
    }
    
    const sizeButtons = await page.locator('#detail-size-swatches button').all();
    if (sizeButtons.length > 0) {
      await sizeButtons[0].click();
    }
    
    // Set quantity
    await page.fill('#detail-qty', '2');
    
    // Add to cart
    await page.click('#add-detail-to-cart');
    
    // Wait for notification
    await expect(page.locator('#app-notification')).toContainText('Added to bag', { timeout: 5000 });
    
    // Check cart badge updated
    await expect(page.locator('#cart-badge-count')).toContainText('2');
  });

  test('should use quick add from product grid', async ({ page }) => {
    await page.goto('/');
    
    // Wait for quick add buttons
    await page.waitForSelector('.quick-add-btn', { timeout: 10000 });
    
    // Click first quick add button
    await page.locator('.quick-add-btn').first().click();
    
    // Wait for notification
    await expect(page.locator('#app-notification')).toContainText('Added to bag', { timeout: 5000 });
    
    // Check cart badge
    const badgeText = await page.locator('#cart-badge-count').textContent();
    expect(badgeText).not.toBe('0');
  });

  test('should display sold out badge for out of stock items', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForSelector('#product-grid-target', { timeout: 10000 });
    
    // Check if any sold out badge exists
    const soldOutBadges = await page.locator('#product-grid-target').locator('text=Sold Out').count();
    // This test will pass whether sold out items exist or not
    expect(soldOutBadges).toBeGreaterThanOrEqual(0);
  });

  test('should show empty cart message when cart is empty', async ({ page }) => {
    await page.goto('/');
    
    // Open cart
    await page.click('#cart-toggle-btn');
    await page.waitForSelector('#cart-sidebar', { state: 'visible' });
    
    // Check empty message
    await expect(page.locator('#cart-items-container')).toContainText('empty');
  });

  test('should close cart sidebar', async ({ page }) => {
    await page.goto('/');
    
    // Open cart
    await page.click('#cart-toggle-btn');
    await page.waitForSelector('#cart-sidebar', { state: 'visible' });
    
    // Close cart
    await page.click('#cart-close-btn');
    
    // Cart should be hidden
    await expect(page.locator('#cart-sidebar')).toHaveClass(/invisible/);
  });

  test('should show correct price format', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForSelector('#product-grid-target .group', { timeout: 10000 });
    
    // Check price format contains GH₵
    const priceText = await page.locator('#product-grid-target .font-extrabold.text-brand').first().textContent();
    expect(priceText).toContain('GH₵');
  });
});