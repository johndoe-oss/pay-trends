const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const https = require('https');
const path = require('path');
const bcrypt = require('bcryptjs');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const { sendPasswordResetCode, sendWelcomeEmail } = require('./email');
// Support both Firebase Functions config and local .env
try {
  const functions = require('firebase-functions');
  const config = functions.config();
  // Set process.env from Firebase config
  process.env.SUPABASE_URL = config.supabase?.url || process.env.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = config.supabase?.anon_key || process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = config.supabase?.service_role_key || process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.JWT_SECRET = config.jwt?.secret || process.env.JWT_SECRET;
  process.env.ADMIN_PIN = config.admin?.pin || process.env.ADMIN_PIN;
  process.env.PAYSTACK_PUBLIC_KEY = config.paystack?.public_key || process.env.PAYSTACK_PUBLIC_KEY;
  process.env.PAYSTACK_SECRET_KEY = config.paystack?.secret_key || process.env.PAYSTACK_SECRET_KEY;
  process.env.SMTP_HOST = config.smtp?.host || process.env.SMTP_HOST;
  process.env.SMTP_PORT = config.smtp?.port || process.env.SMTP_PORT;
  process.env.SMTP_SECURE = config.smtp?.secure || process.env.SMTP_SECURE;
  process.env.SMTP_USER = config.smtp?.user || process.env.SMTP_USER;
  process.env.SMTP_PASS = config.smtp?.pass || process.env.SMTP_PASS;
  process.env.SMTP_FROM = config.smtp?.from || process.env.SMTP_FROM;
} catch (e) {
  // Running locally, use .env file
  require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------------------------------------------------------
// MIDDLEWARE
// -------------------------------------------------------------------
app.use(compression());

const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { error: 'Too many requests from this IP. Security rate limit reached.' }
});
app.use(globalRateLimiter);

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://js.paystack.co"],
        scriptSrcAttr: ["'none'"],
        connectSrc: ["'self'", "https://api.paystack.co", "https://checkout.paystack.com"],
        frameSrc: ["'self'", "https://js.paystack.co", "https://checkout.paystack.com"],
        imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://*"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://paystack.com"],
        styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://paystack.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
      },
    },
  })
);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------------
// 🔒 AUTH MIDDLEWARES (Express handles all JWT verification)
// -------------------------------------------------------------------

const authenticateAdmin = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Executive access required. Token missing.' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pj_fallback_secret');
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized administrative scope.' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Executive session expired or invalid.' });
  }
};

const authenticateCustomer = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Customer authentication required.' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pj_fallback_secret');
    if (decoded.role !== 'customer') {
      return res.status(403).json({ error: 'Invalid user session.' });
    }
    req.customer = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired. Please log in.' });
  }
};

// -------------------------------------------------------------------
// 👤 CUSTOMER AUTH ENDPOINTS
// -------------------------------------------------------------------

// Get customer profile (authenticated)
app.get('/pj-customer-auth/profile', authenticateCustomer, async (req, res) => {
  try {
    const customer = await db.findCustomerById(req.customer.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    res.json({
      name: customer.name,
      email: customer.email,
      phone: customer.phone || '',
      address: customer.address || '',
      region: customer.region || ''
    });
  } catch (err) {
    console.error('Get profile error:', err.message);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// Update customer profile (authenticated)
app.put('/pj-customer-auth/update-profile', authenticateCustomer, async (req, res) => {
  try {
    const { name, phone, address, region } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required.' });
    }

    const customer = await db.updateCustomer(req.customer.id, {
      name,
      phone: phone || null,
      address: address || null,
      region: region || null
    });

    res.json({ success: true, customer });
  } catch (err) {
    console.error('Update profile error:', err.message);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});


// SIGN UP
app.post('/pj-customer-auth/sign-up', async (req, res) => {
  try {
    const { name, email, password, region } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Please fill in all signup details.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ error: 'Password must include at least one uppercase letter.' });
    }
    if (!/[a-z]/.test(password)) {
      return res.status(400).json({ error: 'Password must include at least one lowercase letter.' });
    }
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must include at least one number.' });
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return res.status(400).json({ error: 'Password must include at least one special character.' });
    }

    const existing = await db.findCustomerByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'This email is already registered.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const customer = await db.createCustomer(name, email, hash, region);

    const token = jwt.sign(
      { role: 'customer', id: customer.id, email: customer.email },
      process.env.JWT_SECRET || 'pj_fallback_secret',
      { expiresIn: '7d' }
    );

    // Non-blocking welcome email
    sendWelcomeEmail(email, name).catch(err => console.warn('Welcome email failed:', err.message));

    res.status(201).json({ token, customer: { name: customer.name, email: customer.email, region: customer.region || '' } });
  } catch (err) {
    console.error('Signup error:', err.message);
    res.status(500).json({ error: 'Customer creation failed.' });
  }
});

// SIGN IN
app.post('/pj-customer-auth/sign-in', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const customer = await db.findCustomerByEmail(email);
    if (!customer) {
      return res.status(401).json({ error: 'This account does not exist. Please create an account.' });
    }

    const isMatch = await bcrypt.compare(password, customer.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    const token = jwt.sign(
      { role: 'customer', id: customer.id, email: customer.email },
      process.env.JWT_SECRET || 'pj_fallback_secret',
      { expiresIn: '7d' }
    );

    res.json({ token, customer: { name: customer.name, email: customer.email } });
  } catch (err) {
    console.error('Signin error:', err.message);
    res.status(500).json({ error: 'Authentication failed.' });
  }
});

// -------------------------------------------------------------------
// 🔐 FORGOT PASSWORD FLOW (6-digit code via SMTP)
// -------------------------------------------------------------------

// Step 1: Request 6-digit code
app.post('/pj-customer-auth/forgot-password', authRateLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const customer = await db.findCustomerByEmail(email);
    
    // Always return success (prevents email enumeration)
    if (!customer) {
      return res.json({ success: true, message: 'If this email is registered, a code has been sent.' });
    }

    // Generate 6-digit code, expires in 15 minutes
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.createPasswordReset(email, code, expiresAt);

    // Send via SMTP
    const emailSent = await sendPasswordResetCode(email, code);
    if (!emailSent) {
      console.warn(`Password reset email failed for ${email}. Dev code: ${code}`);
    } else {
      console.log(`✅ Reset code sent to ${email}: ${code}`);
    }

    res.json({
      success: true,
      message: emailSent ? 'Verification code sent to your email.' : 'Email delivery failed. Check console for dev code.',
      code_for_dev_testing: code,
      email_sent: emailSent
    });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ error: 'Password reset request failed.' });
  }
});

// Step 2: Verify the 6-digit code
app.post('/pj-customer-auth/verify-reset-code', authRateLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required.' });
    }

    const validCode = await db.findValidResetCode(email, code);
    if (!validCode) {
      return res.status(400).json({ error: 'Invalid or expired verification code.' });
    }

    // Issue temporary reset token (10 minute expiry)
    const resetToken = jwt.sign(
      { email, purpose: 'password_reset', codeId: validCode.id },
      process.env.JWT_SECRET || 'pj_fallback_secret',
      { expiresIn: '10m' }
    );

    res.json({ success: true, reset_token: resetToken, message: 'Code verified. Set your new password.' });
  } catch (err) {
    console.error('Verify code error:', err.message);
    res.status(500).json({ error: 'Code verification failed.' });
  }
});

// Step 3: Reset password
app.post('/pj-customer-auth/reset-password', authRateLimiter, async (req, res) => {
  try {
    const { reset_token, new_password } = req.body;
    if (!reset_token || !new_password) {
      return res.status(400).json({ error: 'Reset token and new password are required.' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (!/[A-Z]/.test(new_password)) {
      return res.status(400).json({ error: 'Password must include at least one uppercase letter.' });
    }
    if (!/[a-z]/.test(new_password)) {
      return res.status(400).json({ error: 'Password must include at least one lowercase letter.' });
    }
    if (!/[0-9]/.test(new_password)) {
      return res.status(400).json({ error: 'Password must include at least one number.' });
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(new_password)) {
      return res.status(400).json({ error: 'Password must include at least one special character.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(reset_token, process.env.JWT_SECRET || 'pj_fallback_secret');
    } catch (err) {
      return res.status(400).json({ error: 'Reset token is invalid or expired.' });
    }

    if (decoded.purpose !== 'password_reset') {
      return res.status(400).json({ error: 'Invalid reset token.' });
    }

    const hash = await bcrypt.hash(new_password, 10);
    await db.updateCustomerPassword(decoded.email, hash);
    await db.invalidateAllResetCodes(decoded.email);

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Password reset failed.' });
  }
});

// -------------------------------------------------------------------
// 🛍️ PRODUCTS (Public)
// -------------------------------------------------------------------

// Get all products (optional category and product_type filter)
app.get('/pj-secure-boutique/get-shelf', async (req, res) => {
  try {
    const category = req.query.category || null;
    const productType = req.query.type || null;
    const products = await db.getAllProducts(category, productType);
    res.json(products);
  } catch (err) {
    console.error('Error fetching catalog:', err.message);
    res.status(500).json({ error: 'Failed to retrieve catalog.' });
  }
});

// Get new arrivals (latest products)
app.get('/pj-secure-boutique/get-new-arrivals', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 8;
    const products = await db.getNewArrivals(limit);
    res.json(products);
  } catch (err) {
    console.error('Error fetching new arrivals:', err.message);
    res.status(500).json({ error: 'Failed to retrieve new arrivals.' });
  }
});

// Search products by query
app.get('/pj-secure-boutique/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    if (!query.trim()) {
      return res.json([]);
    }
    const products = await db.searchProducts(query);
    res.json(products);
  } catch (err) {
    console.error('Error searching products:', err.message);
    res.status(500).json({ error: 'Search failed.' });
  }
});

// Get single product by slug
app.get('/pj-secure-boutique/get-shelf/:slug', async (req, res) => {
  try {
    const product = await db.getProductBySlug(req.params.slug);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json(product);
  } catch (err) {
    console.error('Error fetching product:', err.message);
    res.status(500).json({ error: 'Product lookup failed.' });
  }
});

// Get regional prices for a product (Public - read only)
app.get('/pj-secure-boutique/get-regional-prices/:slug', async (req, res) => {
  try {
    const product = await db.getProductBySlug(req.params.slug);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const prices = await db.getRegionalPrices(product.id);
    res.json({ product_id: product.id, prices });
  } catch (err) {
    console.error('Error fetching regional prices:', err.message);
    res.status(500).json({ error: 'Failed to load regional prices.' });
  }
});

// -------------------------------------------------------------------
// ❤️ WISHLIST (Per-customer saved favorites, requires customer JWT)
// -------------------------------------------------------------------

// Get the current customer's wishlist product ids
app.get('/pj-secure-boutique/get-wishlist', authenticateCustomer, async (req, res) => {
  try {
    const ids = await db.getWishlist(req.customer.id);
    res.json(ids);
  } catch (err) {
    console.error('Get wishlist error:', err.message);
    res.status(500).json({ error: 'Failed to load wishlist.' });
  }
});

// Get full wishlist products
app.get('/pj-secure-boutique/get-wishlist-products', authenticateCustomer, async (req, res) => {
  try {
    const products = await db.getWishlistProducts(req.customer.id);
    res.json(products);
  } catch (err) {
    console.error('Get wishlist products error:', err.message);
    res.status(500).json({ error: 'Failed to load wishlist.' });
  }
});

// Toggle a product in the wishlist (returns { saved: boolean })
app.post('/pj-secure-boutique/toggle-wishlist', authenticateCustomer, async (req, res) => {
  try {
    const { product_id } = req.body;
    if (!product_id) {
      return res.status(400).json({ error: 'Product id is required.' });
    }

    const existing = await db.getWishlist(req.customer.id);
    if (existing.includes(product_id)) {
      await db.removeFromWishlist(req.customer.id, product_id);
      return res.json({ saved: false });
    }

    await db.addToWishlist(req.customer.id, product_id);
    res.json({ saved: true });
  } catch (err) {
    console.error('Toggle wishlist error:', err.message);
    res.status(500).json({ error: 'Failed to update wishlist.' });
  }
});

// -------------------------------------------------------------------
// 📖 LOOKBOOKS (Shop-the-Look editorial, public)
// -------------------------------------------------------------------

// List all active lookbooks
app.get('/pj-secure-boutique/get-lookbooks', async (req, res) => {
  try {
    const lookbooks = await db.getLookbooks();
    res.json(lookbooks);
  } catch (err) {
    console.error('Get lookbooks error:', err.message);
    res.status(500).json({ error: 'Failed to load lookbooks.' });
  }
});

// Get a single lookbook with its products
app.get('/pj-secure-boutique/get-lookbook/:slug', async (req, res) => {
  try {
    const lookbook = await db.getLookbookBySlug(req.params.slug);
    if (!lookbook) {
      return res.status(404).json({ error: 'Lookbook not found.' });
    }
    const products = await db.getLookbookProducts(lookbook.id);
    res.json({ ...lookbook, products });
  } catch (err) {
    console.error('Get lookbook error:', err.message);
    res.status(500).json({ error: 'Failed to load lookbook.' });
  }
});

// -------------------------------------------------------------------
// 💳 ORDER INTAKE (Requires customer JWT)
// -------------------------------------------------------------------

app.post('/pj-secure-boutique/intake-order', authenticateCustomer, async (req, res) => {
  try {
    const { customer_name, customer_email, customer_phone, delivery_address, region, cart } = req.body;
    const customerId = req.customer.id;

    if (!customer_name || !customer_email || !customer_phone || !delivery_address || !region || !cart || cart.length === 0) {
      return res.status(400).json({ error: 'Missing shipping details or cart is empty.' });
    }

    // Server-side price recalculation (prevents DOM manipulation attacks)
    let totalAmount = 0;
    const orderItemsToInsert = [];

    for (const item of cart) {
      const product = await db.getProductById(item.id);
      if (!product) {
        return res.status(400).json({ error: `Product "${item.name}" no longer exists.` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for "${product.name}". Only ${product.stock} available.` });
      }

      totalAmount += parseFloat(product.price) * item.quantity;
      orderItemsToInsert.push({
        product_id: product.id,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        price: parseFloat(product.price)
      });
    }

    // Generate secure order token
    const t1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const t2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const orderToken = `PJ-${t1}-${t2}`;

    // Create the order
    const order = await db.createOrder({
      customer_id: customerId,
      token: orderToken,
      customer_name,
      customer_email,
      customer_phone,
      delivery_address,
      region,
      total_amount: totalAmount,
      status: 'placed'
    });

    // Add order items with correct product_id references
    for (const item of orderItemsToInsert) {
      await db.supabase.from('order_items').insert({
        order_id: order.id,
        product_id: item.product_id,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        price: item.price
      });
    }

    res.json({ success: true, token: orderToken, total: totalAmount, email: customer_email });
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(400).json({ error: err.message || 'Checkout failed.' });
  }
});

// -------------------------------------------------------------------
// 💳 PAYMENT VERIFICATION
// -------------------------------------------------------------------

app.post('/pj-secure-boutique/audit-transaction', async (req, res) => {
  try {
    const { order_token, paystack_reference } = req.body;
    
    if (!order_token || !paystack_reference) {
      return res.status(400).json({ error: 'Order token and payment reference are required.' });
    }

    const order = await db.getOrderByToken(order_token);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    // Sandbox bypass for testing
    if (paystack_reference === 'pj_sandbox_payment_ref_override') {
      await db.updateOrderStatus(order_token, 'verified', paystack_reference);

      // Deduct stock
      const items = await db.getOrderItemsByOrderId(order.id);
      for (const item of items) {
        await db.decrementProductStock(item.product_id, item.quantity);
      }

      return res.json({ success: true, message: 'Order verified (Sandbox).' });
    }

    // Live Paystack verification
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    
    if (!paystackSecret) {
      console.error('PAYSTACK_SECRET_KEY is not configured');
      return res.status(500).json({ error: 'Payment system not configured. Please contact support.' });
    }

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/transaction/verify/${encodeURIComponent(paystack_reference)}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json'
      }
    };

    const verifyReq = https.request(options, async (verifyRes) => {
      let data = '';
      
      verifyRes.on('data', (chunk) => { 
        data += chunk; 
      });
      
      verifyRes.on('end', async () => {
        // Check if response already sent
        if (res.headersSent) {
          return;
        }

        try {
          const parsed = JSON.parse(data);
          
          if (!parsed.status || !parsed.data) {
            return res.status(400).json({ error: 'Invalid response from payment provider.' });
          }

          if (parsed.data.status === 'success') {
            const paidGHS = parsed.data.amount / 100;
            const expected = parseFloat(order.total_amount);

            if (paidGHS >= expected) {
              await db.updateOrderStatus(order_token, 'verified', paystack_reference);

              const items = await db.getOrderItemsByOrderId(order.id);
              for (const item of items) {
                await db.decrementProductStock(item.product_id, item.quantity);
              }

              return res.json({ success: true, message: 'Transaction verified.' });
            } else {
              return res.status(400).json({ 
                error: `Amount mismatch. Expected GH₵ ${expected.toFixed(2)}, paid GH₵ ${paidGHS.toFixed(2)}` 
              });
            }
          } else {
            return res.status(400).json({ error: 'Payment was not successful.' });
          }
        } catch (err) {
          console.error('Parse error:', err.message);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to verify transaction.' });
          }
        }
      });
    });

    verifyReq.on('error', (err) => {
      console.error('Paystack connection error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Payment verification service unavailable. Please try again.' });
      }
    });
    
    verifyReq.setTimeout(10000, () => {
      verifyReq.destroy();
      if (!res.headersSent) {
        res.status(500).json({ error: 'Payment verification timed out. Please try again.' });
      }
    });
    
    verifyReq.end();
  } catch (err) {
    console.error('Payment verify error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Transaction verification failed.' });
    }
  }
});

// -------------------------------------------------------------------
// 📦 ORDER TRACKING
// -------------------------------------------------------------------

app.get('/pj-secure-boutique/track-consignment/:token', async (req, res) => {
  try {
    const order = await db.getOrderByToken(req.params.token);
    if (!order) {
      return res.status(404).json({ error: 'Order tracking token not recognized.' });
    }

    const items = await db.getOrderItemsByOrderId(order.id);
    
    // Transform items to match the frontend's expected format
    const transformedItems = items.map(item => ({
      size: item.size,
      color: item.color,
      quantity: item.quantity,
      price: item.price,
      name: item.products?.name || 'Product',
      image_url: item.products?.image_url || ''
    }));

    res.json({
      order: {
        token: order.token,
        customer_name: order.customer_name,
        total_amount: order.total_amount,
        status: order.status,
        created_at: order.created_at,
        delivery_address: order.delivery_address,
        region: order.region
      },
      items: transformedItems
    });
  } catch (err) {
    console.error('Tracking error:', err.message);
    res.status(500).json({ error: 'Could not resolve tracking records.' });
  }
});

// -------------------------------------------------------------------
// ⚙️ ADMIN DASHBOARD
// -------------------------------------------------------------------

app.get('/trendsetter-portal', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

// -------------------------------------------------------------------
// 💳 PAYMENT VERIFICATION PAGE
// -------------------------------------------------------------------

app.get('/verify-payment', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'payment-verify.html'));
});

// Admin sign-in
app.post('/pj-ops-hq/sign-in-executive', async (req, res) => {
  try {
    const { passcode } = req.body;
    const requiredPin = process.env.ADMIN_PIN || '1234';

    if (!passcode) {
      return res.status(400).json({ error: 'Passcode is required.' });
    }

    if (passcode.toString() !== requiredPin.toString()) {
      return res.status(401).json({ error: 'Incorrect credentials.' });
    }

    const token = jwt.sign(
      { role: 'admin', session_created: Date.now() },
      process.env.JWT_SECRET || 'pj_fallback_secret',
      { expiresIn: '2h' }
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

// Create product (Admin only)
app.post('/pj-ops-hq/push-inventory', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, price, stock, category, product_type, sizes, colors, image_url } = req.body;
    if (!name || !price || stock === undefined || !category || !product_type || !sizes || !colors) {
      return res.status(400).json({ error: 'Missing mandatory fields.' });
    }

    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const randomHex = crypto.randomBytes(2).toString('hex');
    const slug = `${baseSlug}-${randomHex}`;

    const product = await db.createProduct({
      slug,
      name,
      description: description || '',
      price: parseFloat(price),
      stock: parseInt(stock),
      category,
      product_type,
      sizes, // array
      colors, // array
      image_url: image_url || null
    });

    res.status(201).json(product);
  } catch (err) {
    console.error('Create product error:', err.message);
    res.status(500).json({ error: 'Failed to create product.' });
  }
});

// Update product (Admin only)
app.put('/pj-ops-hq/patch-inventory/:slug', authenticateAdmin, async (req, res) => {
  try {
    const existing = await db.getProductBySlug(req.params.slug);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const { name, description, price, stock, category, product_type, sizes, colors, image_url } = req.body;
    const product = await db.updateProduct(req.params.slug, {
      name,
      description,
      price: parseFloat(price),
      stock: parseInt(stock),
      category,
      product_type,
      sizes,
      colors,
      image_url
    });

    res.json(product);
  } catch (err) {
    console.error('Update product error:', err.message);
    res.status(500).json({ error: 'Failed to update product.' });
  }
});

// Delete product (Admin only)
app.delete('/pj-ops-hq/purge-inventory/:slug', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.deleteProduct(req.params.slug);
    if (!result) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) {
    console.error('Delete product error:', err.message);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

// Get all categories (Public)
app.get('/pj-secure-boutique/get-categories', async (req, res) => {
  try {
    const categories = await db.getCategories();
    res.json(categories);
  } catch (err) {
    console.error('Error fetching categories:', err.message);
    res.status(500).json({ error: 'Failed to retrieve categories.' });
  }
});

// Get product types for a category (Public)
app.get('/pj-secure-boutique/get-product-types', async (req, res) => {
  try {
    const category = req.query.category || '';
    
    // Use raw SQL to get distinct product types for a category
    let query = `
      SELECT DISTINCT product_type 
      FROM products 
      WHERE product_type IS NOT NULL AND product_type != ''
    `;
    const params = [];
    
    if (category) {
      query += ` AND category = $1`;
      params.push(category);
    }
    
    query += ` ORDER BY product_type`;
    
    const { data, error } = await db.supabase.rpc('exec_sql', {
      query_text: query,
      params: JSON.stringify(params)
    });
    
    if (error) {
      // Fallback: fetch all products and extract types manually
      const products = await db.getAllProducts(category || null);
      const types = [...new Set(products.map(p => p.product_type).filter(t => t))];
      return res.json(types.sort());
    }
    
    res.json(data.map(row => row.product_type));
  } catch (err) {
    console.error('Error fetching product types:', err.message);
    res.status(500).json({ error: 'Failed to retrieve product types.' });
  }
});

// Get single category by slug (Public)
app.get('/pj-secure-boutique/get-category/:slug', async (req, res) => {
  try {
    const category = await db.getCategoryBySlug(req.params.slug);
    if (!category) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    res.json(category);
  } catch (err) {
    console.error('Error fetching category:', err.message);
    res.status(500).json({ error: 'Category lookup failed.' });
  }
});

// Create category (Admin only)
app.post('/pj-ops-hq/push-category', authenticateAdmin, async (req, res) => {
  try {
    const { name, slug, description, image_url, display_order } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ error: 'Category name and slug are required.' });
    }

    const category = await db.createCategory({
      name,
      slug: slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
      description: description || '',
      image_url: image_url || '',
      display_order: display_order || 0,
      is_active: true
    });

    res.status(201).json(category);
  } catch (err) {
    console.error('Create category error:', err.message);
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

// Update category (Admin only)
app.put('/pj-ops-hq/patch-category/:slug', authenticateAdmin, async (req, res) => {
  try {
    const existing = await db.getCategoryBySlug(req.params.slug);
    if (!existing) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    const { name, description, image_url, display_order, is_active } = req.body;
    const category = await db.updateCategory(req.params.slug, {
      name,
      description,
      image_url,
      display_order,
      is_active
    });

    res.json(category);
  } catch (err) {
    console.error('Update category error:', err.message);
    res.status(500).json({ error: 'Failed to update category.' });
  }
});

// Delete category (Admin only)
app.delete('/pj-ops-hq/purge-category/:slug', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.deleteCategory(req.params.slug);
    if (!result) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    res.json({ success: true, message: 'Category deleted.' });
  } catch (err) {
    console.error('Delete category error:', err.message);
    res.status(500).json({ error: 'Failed to delete category.' });
  }
});

// Get all customers (Admin only)
app.get('/pj-ops-hq/get-customers', authenticateAdmin, async (req, res) => {
  try {
    const customers = await db.getAllCustomers();
    res.json(customers);
  } catch (err) {
    console.error('Get customers error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve customers.' });
  }
});

// Get all orders (Admin only)
app.get('/pj-ops-hq/get-order-log', authenticateAdmin, async (req, res) => {
  try {
    const orders = await db.getAllOrders();
    res.json(orders);
  } catch (err) {
    console.error('Get orders error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve orders.' });
  }
});

// Update order status (Admin only)
app.put('/pj-ops-hq/advance-consignment/:token', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['placed', 'verified', 'processing', 'dispatched', 'delivered'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const order = await db.updateOrderStatus(req.params.token, status);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('Update order error:', err.message);
    res.status(500).json({ error: 'Failed to update order.' });
  }
});

// -------------------------------------------------------------------
// 📊 USER LOGS (Admin only)
// -------------------------------------------------------------------

// Create a user log entry
app.post('/pj-ops-hq/create-user-log', async (req, res) => {
  try {
    const { user_type, user_id, user_email, action, description, ip_address, user_agent, metadata } = req.body;
    
    if (!user_type || !action) {
      return res.status(400).json({ error: 'user_type and action are required.' });
    }

    const log = await db.createUserLog({
      user_type,
      user_id: user_id || null,
      user_email: user_email || null,
      action,
      description: description || '',
      ip_address: ip_address || null,
      user_agent: user_agent || null,
      metadata: metadata || {}
    });

    res.status(201).json(log);
  } catch (err) {
    console.error('Create user log error:', err.message);
    res.status(500).json({ error: 'Failed to create user log.' });
  }
});

// Get all user logs (Admin only)
app.get('/pj-ops-hq/get-user-logs', authenticateAdmin, async (req, res) => {
  try {
    const filters = {
      user_type: req.query.user_type || null,
      user_email: req.query.user_email || null,
      action: req.query.action || null,
      start_date: req.query.start_date || null,
      end_date: req.query.end_date || null,
      limit: parseInt(req.query.limit) || 100
    };

    const logs = await db.getUserLogs(filters);
    res.json(logs);
  } catch (err) {
    console.error('Get user logs error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve user logs.' });
  }
});

// -------------------------------------------------------------------
// 📖 LOOKBOOK ADMIN (Admin CRUD — manage lookbooks and their products)
// -------------------------------------------------------------------

// Get all lookbooks including inactive (Admin only)
app.get('/pj-ops-hq/get-lookbooks', authenticateAdmin, async (req, res) => {
  try {
    const lookbooks = await db.getAllLookbooks();
    res.json(lookbooks);
  } catch (err) {
    console.error('Get all lookbooks error:', err.message);
    res.status(500).json({ error: 'Failed to load lookbooks.' });
  }
});

// Create lookbook (Admin only)
app.post('/pj-ops-hq/push-lookbook', authenticateAdmin, async (req, res) => {
  try {
    const { title, subtitle, description, image_url, display_order } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Lookbook title is required.' });
    }

    const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const randomHex = require('crypto').randomBytes(2).toString('hex');
    const slug = `${baseSlug}-${randomHex}`;

    const lookbook = await db.createLookbook({
      slug,
      title,
      subtitle: subtitle || '',
      description: description || '',
      image_url: image_url || null,
      display_order: display_order || 0,
      is_active: true
    });

    res.status(201).json(lookbook);
  } catch (err) {
    console.error('Create lookbook error:', err.message);
    res.status(500).json({ error: 'Failed to create lookbook.' });
  }
});

// Update lookbook (Admin only)
app.put('/pj-ops-hq/patch-lookbook/:slug', authenticateAdmin, async (req, res) => {
  try {
    const existing = await db.getLookbookBySlug(req.params.slug);
    if (!existing) {
      return res.status(404).json({ error: 'Lookbook not found.' });
    }

    const { title, subtitle, description, image_url, display_order, is_active } = req.body;
    const lookbook = await db.updateLookbook(req.params.slug, {
      title,
      subtitle,
      description,
      image_url,
      display_order,
      is_active
    });

    res.json(lookbook);
  } catch (err) {
    console.error('Update lookbook error:', err.message);
    res.status(500).json({ error: 'Failed to update lookbook.' });
  }
});

// Delete lookbook (Admin only)
app.delete('/pj-ops-hq/purge-lookbook/:slug', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.deleteLookbook(req.params.slug);
    if (!result) {
      return res.status(404).json({ error: 'Lookbook not found.' });
    }
    res.json({ success: true, message: 'Lookbook deleted.' });
  } catch (err) {
    console.error('Delete lookbook error:', err.message);
    res.status(500).json({ error: 'Failed to delete lookbook.' });
  }
});

// =============================================================
// 🌍 REGIONAL PRICING (Admin only)
// =============================================================

// Get regional prices for a product
app.get('/pj-ops-hq/get-regional-prices/:slug', authenticateAdmin, async (req, res) => {
  try {
    const product = await db.getProductBySlug(req.params.slug);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const prices = await db.getRegionalPrices(product.id);
    res.json({ product_id: product.id, prices });
  } catch (err) {
    console.error('Get regional prices error:', err.message);
    res.status(500).json({ error: 'Failed to load regional prices.' });
  }
});

// Set/update a regional price
app.post('/pj-ops-hq/set-regional-price', authenticateAdmin, async (req, res) => {
  try {
    const { product_id, region, price } = req.body;
    if (!product_id || !region || price === undefined) {
      return res.status(400).json({ error: 'product_id, region and price are required.' });
    }

    const record = await db.setRegionalPrice(parseInt(product_id), region, parseFloat(price));
    res.status(201).json(record);
  } catch (err) {
    console.error('Set regional price error:', err.message);
    res.status(500).json({ error: 'Failed to set regional price.' });
  }
});

// Remove a regional price override
app.delete('/pj-ops-hq/remove-regional-price', authenticateAdmin, async (req, res) => {
  try {
    const { product_id, region } = req.body;
    if (!product_id || !region) {
      return res.status(400).json({ error: 'product_id and region are required.' });
    }

    await db.removeRegionalPrice(parseInt(product_id), region);
    res.json({ success: true });
  } catch (err) {
    console.error('Remove regional price error:', err.message);
    res.status(500).json({ error: 'Failed to remove regional price.' });
  }
});

// Add a product to a lookbook (Admin only)
app.post('/pj-ops-hq/link-lookbook-product', authenticateAdmin, async (req, res) => {
  try {
    const { lookbook_id, product_id, display_order } = req.body;
    if (!lookbook_id || !product_id) {
      return res.status(400).json({ error: 'lookbook_id and product_id are required.' });
    }

    const item = await db.addLookbookProduct(lookbook_id, product_id, display_order || 0);
    res.status(201).json(item);
  } catch (err) {
    console.error('Add lookbook product error:', err.message);
    res.status(500).json({ error: 'Failed to add product to lookbook.' });
  }
});

// Remove a product from a lookbook (Admin only)
app.delete('/pj-ops-hq/unlink-lookbook-product/:itemId', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.removeLookbookProduct(parseInt(req.params.itemId));
    if (!result) {
      return res.status(404).json({ error: 'Lookbook item not found.' });
    }
    res.json({ success: true, message: 'Product removed from lookbook.' });
  } catch (err) {
    console.error('Remove lookbook product error:', err.message);
    res.status(500).json({ error: 'Failed to remove product from lookbook.' });
  }
});

// -------------------------------------------------------------------
// SPA FALLBACK
// -------------------------------------------------------------------

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------------------------------------------------------------------
// START SERVER
// -------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`========================================================`);
  console.log(`  🔥 PAYJAY TRENDS - LIVE IN PRODUCTION`);
  console.log(`  🏛️  Architecture: Browser → Express (JWT Auth) → Supabase PostgreSQL`);
  console.log(`  🚀 Server: http://localhost:${PORT}`);
  console.log(`  🎯 Portal: http://localhost:${PORT}/trendsetter-portal`);
  console.log(`  📧 SMTP: ${process.env.SMTP_USER ? 'Configured' : 'Not configured'}`);
  console.log(`========================================================`);
});