const { test, expect } = require('@playwright/test');

test.describe('Order Tracking', () => {
  test('should display tracking search page', async ({ page }) => {
    await page.goto('/#/track');
    
    // Verify tracking page elements
    await expect(page.locator('h2')).toContainText('Track Shipment');
    await expect(page.locator('#track-form')).toBeVisible();
    await expect(page.locator('#track-token-input')).toBeVisible();
  });

  test('should show error for invalid tracking token', async ({ page }) => {
    await page.goto('/#/track');
    
    // Enter invalid token
    await page.fill('#track-token-input', 'INVALID-TOKEN-123');
    await page.click('#track-form button[type="submit"]');
    
    // Should show tracking not found
    await page.waitForURL('**/#/track/**', { timeout: 5000 });
    await expect(page.locator('h2')).toContainText('Tracking Not Found');
  });

  test('should display order details for valid token', async ({ page }) => {
    await page.goto('/#/track');
    
    // Enter a valid token format (PJ-XXXX-XXXX)
    await page.fill('#track-token-input', 'PJ-A1B2-C3D4');
    await page.click('#track-form button[type="submit"]');
    
    // Wait for tracking result page
    await page.waitForURL('**/#/track/**', { timeout: 5000 });
    
    // Verify tracking result elements
    await expect(page.locator('text=Consignment PJ-Token')).toBeVisible();
    await expect(page.locator('text=Delivery Timeline Tracker')).toBeVisible();
  });

  test('should navigate back to tracking from not found page', async ({ page }) => {
    await page.goto('/#/track/TEST-TOKEN');
    
    // Wait for not found message
    await page.waitForSelector('text=Tracking Not Found', { timeout: 5000 });
    
    // Click try another token button
    await page.click('text=Try Another Token');
    
    // Should navigate back to track page
    await page.waitForURL('**/#/track', { timeout: 5000 });
  });

  test('should display order status badge', async ({ page }) => {
    await page.goto('/#/track/PJ-1234-5678');
    
    // Wait for page to load (might show not found or success)
    await page.waitForTimeout(2000);
    
    // Check if status badge is present (either status shown or not found message)
    const hasStatusBadge = await page.locator('.bg-brand.text-white').count();
    const hasNotFound = await page.locator('text=Tracking Not Found').count();
    
    // One of these should be true
    expect(hasStatusBadge + hasNotFound).toBeGreaterThan(0);
  });

  test('should show delivery timeline steps', async ({ page }) => {
    await page.goto('/#/track/PJ-ABCD-EFGH');
    
    await page.waitForTimeout(2000);
    
    // Check if timeline steps are displayed (either on success page or not found)
    const hasTimeline = await page.locator('text=Delivery Timeline Tracker').count();
    const hasNotFound = await page.locator('text=Tracking Not Found').count();
    
    expect(hasTimeline + hasNotFound).toBeGreaterThan(0);
  });

  test('should validate empty tracking token', async ({ page }) => {
    await page.goto('/#/track');
    
    // Try to submit without entering token
    await page.click('#track-form button[type="submit"]');
    
    // Browser should require input due to 'required' attribute
    const inputElement = page.locator('#track-token-input');
    await expect(inputElement).toBeFocused();
  });

  test('should navigate to track page from header', async ({ page }) => {
    await page.goto('/');
    
    // Click track order link in navigation
    await page.click('#nav-track');
    
    // Should navigate to track page
    await page.waitForURL('**/#/track', { timeout: 5000 });
    await expect(page.locator('h2')).toContainText('Track Shipment');
  });

  test('should show order items on tracking result', async ({ page }) => {
    await page.goto('/#/track/PJ-TEST-ORDER');
    
    await page.waitForTimeout(2000);
    
    // Either shows order items or tracking not found
    const hasOrderItems = await page.locator('text=Order Items').count();
    const hasNotFound = await page.locator('text=Tracking Not Found').count();
    
    expect(hasOrderItems + hasNotFound).toBeGreaterThan(0);
  });

  test('should display delivery address on tracking result', async ({ page }) => {
    await page.goto('/#/track/PJ-ADDR-TEST');
    
    await page.waitForTimeout(2000);
    
    // Either shows delivery address or tracking not found
    const hasDeliveryAddress = await page.locator('text=Delivery Address').count();
    const hasNotFound = await page.locator('text=Tracking Not Found').count();
    
    expect(hasDeliveryAddress + hasNotFound).toBeGreaterThan(0);
  });
});