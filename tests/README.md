# Playwright Tests

This directory contains end-to-end tests for the Payjay Trends e-commerce application.

## Test Files

- `authentication.spec.js` - Customer sign in, sign up, and forgot password flows
- `products.spec.js` - Product browsing, filtering, and detail pages
- `cart-checkout.spec.js` - Shopping cart, checkout, and payment flow
- `order-tracking.spec.js` - Order tracking functionality
- `admin-dashboard.spec.js` - Admin dashboard operations

## Running Tests

```bash
# Run all tests
npx playwright test

# Run tests in debug mode
npx playwright test --debug

# Run specific test file
npx playwright test tests/authentication.spec.js

# Run specific test
npx playwright test -g "should successfully sign in"

# Run with UI mode
npx playwright test --ui
```

## Test Setup

The Playwright configuration (`playwright.config.js`) automatically:
1. Starts the Express server on port 3000
2. Runs tests sequentially (`workers: 1`)
3. Saves screenshots and videos on failures
4. Uses the base URL `http://localhost:3000`

## Test Data

- Admin passcode: `1234` (from `.env`)
- Test user credentials should be configured in the database
- Products should exist in the database for product tests

## Viewing Test Results

```bash
# View HTML report
npx playwright show-report