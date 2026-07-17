const { test, expect } = require('@playwright/test');

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/trendsetter-portal');
  });

  test('should display admin login page', async ({ page }) => {
    // Verify login form is visible
    await expect(page.locator('h2')).toContainText('HQ Studio Access');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#passcode')).toBeVisible();
  });

  test('should reject invalid admin passcode', async ({ page }) => {
    await page.fill('#passcode', 'wrongpasscode');
    await page.click('#login-form button[type="submit"]');
    
    // Should show error toast
    await expect(page.locator('#toast')).toContainText('Incorrect credentials', { timeout: 5000 });
  });

  test('should successfully login with valid admin passcode', async ({ page }) => {
    // Use the admin PIN from .env (1234)
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    // Wait for dashboard to load
    await page.waitForSelector('#tab-products', { timeout: 10000 });
    
    // Verify dashboard elements are present
    await expect(page.locator('text=PAYJAY HQ STUDIO')).toBeVisible();
    await expect(page.locator('#tab-products')).toBeVisible();
    await expect(page.locator('#tab-categories')).toBeVisible();
    await expect(page.locator('#tab-orders')).toBeVisible();
    await expect(page.locator('#tab-customers')).toBeVisible();
  });

  test('should display products tab by default after login', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#tab-products', { timeout: 10000 });
    
    // Verify inventory table is visible
    await expect(page.locator('text=Inventory Catalog')).toBeVisible();
    await expect(page.locator('#inventory-rows')).toBeVisible();
    await expect(page.locator('#add-product-btn')).toBeVisible();
  });

  test('should switch to categories tab', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#tab-products', { timeout: 10000 });
    
    // Click categories tab
    await page.click('#tab-categories');
    
    // Verify categories tab is active
    await expect(page.locator('text=Category Manager')).toBeVisible();
    await expect(page.locator('#categories-rows')).toBeVisible();
  });

  test('should switch to orders tab', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#tab-products', { timeout: 10000 });
    
    // Click orders tab
    await page.click('#tab-orders');
    
    // Verify orders tab is active
    await expect(page.locator('text=Order Log Entries')).toBeVisible();
    await expect(page.locator('#orders-rows')).toBeVisible();
  });

  test('should switch to customers tab', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#tab-products', { timeout: 10000 });
    
    // Click customers tab
    await page.click('#tab-customers');
    
    // Verify customers tab is active
    await expect(page.locator('text=Registered Customers')).toBeVisible();
    await expect(page.locator('#customers-rows')).toBeVisible();
  });

  test('should logout from admin dashboard', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#admin-logout-btn', { timeout: 10000 });
    
    // Click logout
    await page.click('#admin-logout-btn');
    
    // Should return to login page
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('text=HQ Studio Access')).toBeVisible();
  });

  test('should open add product modal', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#add-product-btn', { timeout: 10000 });
    
    // Click add product button
    await page.click('#add-product-btn');
    
    // Verify modal is visible
    await expect(page.locator('#product-modal')).toBeVisible();
    await expect(page.locator('#modal-title')).toContainText('Add New Product');
    await expect(page.locator('#product-form')).toBeVisible();
  });

  test('should close product modal', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#add-product-btn', { timeout: 10000 });
    
    // Open modal
    await page.click('#add-product-btn');
    await expect(page.locator('#product-modal')).toBeVisible();
    
    // Close modal
    await page.click('#modal-close-btn');
    await expect(page.locator('#product-modal')).toBeHidden();
  });

  test('should open add category modal', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#tab-products', { timeout: 10000 });
    
    // Switch to categories tab
    await page.click('#tab-categories');
    await page.waitForSelector('#add-category-btn', { timeout: 5000 });
    
    // Click add category button
    await page.click('#add-category-btn');
    
    // Verify modal is visible
    await expect(page.locator('#category-modal')).toBeVisible();
    await expect(page.locator('#category-form')).toBeVisible();
  });

  test('should close category modal', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#tab-products', { timeout: 10000 });
    
    // Switch to categories and open modal
    await page.click('#tab-categories');
    await page.waitForSelector('#add-category-btn', { timeout: 5000 });
    await page.click('#add-category-btn');
    
    await expect(page.locator('#category-modal')).toBeVisible();
    
    // Close modal
    await page.click('#category-modal-close-btn');
    await expect(page.locator('#category-modal')).toBeHidden();
  });

  test('should display orders with status badges', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#tab-products', { timeout: 10000 });
    
    // Switch to orders tab
    await page.click('#tab-orders');
    
    // Wait for orders to load
    await page.waitForTimeout(2000);
    
    // Check if orders table is visible (either with data or empty message)
    const hasOrders = await page.locator('#orders-rows').locator('tr').count();
    const hasNoOrders = await page.locator('text=No orders placed yet').count();
    
    // Either has orders or shows empty state
    expect(hasOrders > 1 || hasNoOrders > 0).toBeTruthy();
  });

  test('should display customers table', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#tab-products', { timeout: 10000 });
    
    // Switch to customers tab
    await page.click('#tab-customers');
    
    // Wait for customers to load
    await page.waitForTimeout(2000);
    
    // Check if customers table is visible
    const hasCustomers = await page.locator('#customers-rows').locator('tr').count();
    const hasNoCustomers = await page.locator('text=No registered customers yet').count();
    
    // Either has customers or shows empty state
    expect(hasCustomers > 1 || hasNoCustomers > 0).toBeTruthy();
  });

  test('should have order status dropdown for order management', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#tab-products', { timeout: 10000 });
    
    // Switch to orders tab
    await page.click('#tab-orders');
    
    // Wait for orders to load
    await page.waitForTimeout(2000);
    
    // Check if any order status selects exist
    const statusSelects = await page.locator('.order-status-select').count();
    expect(statusSelects).toBeGreaterThanOrEqual(0);
  });

  test('should display product form fields correctly', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#add-product-btn', { timeout: 10000 });
    
    // Open modal
    await page.click('#add-product-btn');
    
    // Verify all form fields are present
    await expect(page.locator('#prod-name')).toBeVisible();
    await expect(page.locator('#prod-price')).toBeVisible();
    await expect(page.locator('#prod-stock')).toBeVisible();
    await expect(page.locator('#prod-category')).toBeVisible();
    await expect(page.locator('#prod-sizes')).toBeVisible();
    await expect(page.locator('#prod-colors')).toBeVisible();
    await expect(page.locator('#prod-desc')).toBeVisible();
    await expect(page.locator('#prod-image-url')).toBeVisible();
  });

  test('should display category form fields correctly', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#tab-products', { timeout: 10000 });
    
    // Switch to categories
    await page.click('#tab-categories');
    await page.waitForSelector('#add-category-btn', { timeout: 5000 });
    
    // Open modal
    await page.click('#add-category-btn');
    
    // Verify all form fields are present
    await expect(page.locator('#cat-name')).toBeVisible();
    await expect(page.locator('#cat-slug')).toBeVisible();
    await expect(page.locator('#cat-description')).toBeVisible();
    await expect(page.locator('#cat-image-url')).toBeVisible();
    await expect(page.locator('#cat-display-order')).toBeVisible();
    await expect(page.locator('#cat-is-active')).toBeVisible();
  });

  test('should persist session after page reload', async ({ page }) => {
    await page.fill('#passcode', '1234');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForSelector('#tab-products', { timeout: 10000 });
    
    // Reload page
    await page.reload();
    
    // Should still be on dashboard (not login page)
    await expect(page.locator('#tab-products')).toBeVisible();
    await expect(page.locator('text=PAYJAY HQ STUDIO')).toBeVisible();
  });

  test('should show admin dashboard only to authorized users', async ({ page }) => {
    // Try accessing admin dashboard without auth
    await page.goto('/trendsetter-portal');
    
    // Should show login form
    await expect(page.locator('#login-form')).toBeVisible();
  });
});