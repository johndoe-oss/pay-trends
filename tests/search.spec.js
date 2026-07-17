const { test, expect } = require('@playwright/test');

test.describe('Product Search Field', () => {
  test('search icon is positioned inside the search field', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#product-search', { timeout: 10000 });

    const input = page.locator('#product-search');
    const icon = page.locator('div.relative:has(#product-search) > svg');

    await expect(input).toBeVisible();

    const inputBox = await input.boundingBox();
    const iconBox = await icon.first().boundingBox();

    expect(inputBox).not.toBeNull();
    expect(iconBox).not.toBeNull();

    // Icon vertical center should fall within the input's vertical bounds (inside the field)
    const iconCenterY = iconBox.y + iconBox.height / 2;
    expect(iconCenterY).toBeGreaterThan(inputBox.y - 1);
    expect(iconCenterY).toBeLessThan(inputBox.y + inputBox.height + 1);

    // Icon should be horizontally to the left, inside the field (x within field width)
    expect(iconBox.x).toBeGreaterThanOrEqual(inputBox.x - 1);
    expect(iconBox.x + iconBox.width).toBeLessThanOrEqual(inputBox.x + inputBox.width + 1);
  });

  test('typed search text remains visible in the input', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#product-search', { timeout: 10000 });

    const input = page.locator('#product-search');
    await input.fill('shirt');

    // Wait past the search debounce (300ms) so any side-effecting code runs
    await page.waitForTimeout(700);

    // The typed word must still be present in the field (bug: text used to vanish)
    await expect(input).toHaveValue('shirt');
  });
});