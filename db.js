const { supabase } = require('./supabase');
require('dotenv').config();

/**
 * Database Abstraction Layer
 * Architecture: Express (JWT Auth) → Supabase PostgreSQL
 * 
 * All authentication is handled by Express server.
 * Supabase service_role key bypasses RLS - Express is the gatekeeper.
 */

// ========================================================
// CUSTOMERS
// ========================================================

async function findCustomerByEmail(email) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('email', email)
    .single();
  
  if (error && error.code !== 'PGRST200') { // PGRST200 = no rows
    throw error;
  }
  return data;
}

async function findCustomerById(id) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data;
}

async function createCustomer(name, email, passwordHash, region = null) {
  const { data, error } = await supabase
    .from('customers')
    .insert({ name, email, password_hash: passwordHash, region })
    .select('id, name, email, region')
    .single();
  
  if (error) throw error;
  return data;
}

async function updateCustomerPassword(email, passwordHash) {
  const { data, error } = await supabase
    .from('customers')
    .update({ password_hash: passwordHash })
    .eq('email', email)
    .select('id')
    .single();
  
  if (error) throw error;
  return data;
}

// ========================================================
// PASSWORD RESETS
// ========================================================

async function createPasswordReset(email, code, expiresAt) {
  // Invalidate old unused codes
  await supabase
    .from('password_resets')
    .update({ used: true })
    .eq('email', email)
    .eq('used', false);

  // Insert new code
  const { data, error } = await supabase
    .from('password_resets')
    .insert({ email, code, expires_at: expiresAt.toISOString() })
    .select('id')
    .single();
  
  if (error) throw error;
  return data;
}

async function findValidResetCode(email, code) {
  const { data, error } = await supabase
    .from('password_resets')
    .select('*')
    .eq('email', email)
    .eq('code', code)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function invalidateAllResetCodes(email) {
  const { error } = await supabase
    .from('password_resets')
    .update({ used: true })
    .eq('email', email);
  
  if (error) throw error;
}


// ========================================================
// PRODUCTS
// ========================================================

async function getAllProducts(category = null, productType = null) {
  let query = supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  if (productType) {
    query = query.eq('product_type', productType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getNewArrivals(limit = 8) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data || [];
}

async function getProductBySlug(slug) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('slug', slug)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function getProductById(id) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data;
}

async function createProduct(product) {
  const { data, error } = await supabase
    .from('products')
    .insert(product)
    .select('*')
    .single();
  
  if (error) throw error;
  return data;
}

async function updateProduct(slug, updates) {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('slug', slug)
    .select('*')
    .single();
  
  if (error) throw error;
  return data;
}

async function deleteProduct(slug) {
  const { data, error } = await supabase
    .from('products')
    .delete()
    .eq('slug', slug)
    .select('id')
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function decrementProductStock(productId, quantity) {
  // First get current stock
  const product = await getProductById(productId);
  if (!product) throw new Error('Product not found');

  const newStock = Math.max(0, product.stock - quantity);
  
  const { data, error } = await supabase
    .from('products')
    .update({ stock: newStock })
    .eq('id', productId)
    .select('*')
    .single();
  
  if (error) throw error;
  return data;
}

// ========================================================
// CUSTOMERS
// ========================================================

async function updateCustomer(id, updates) {
  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select('id, name, email, phone, address, region')
    .single();
  
  if (error) throw error;
  return data;
}

async function getAllCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, email, region, created_at')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

// ========================================================
// ORDERS
// ========================================================

async function createOrder(order) {
  const { data, error } = await supabase
    .from('orders')
    .insert(order)
    .select('*')
    .single();
  
  if (error) throw error;
  return data;
}

async function getOrderByToken(token) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('token', token)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function getAllOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('id', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

async function updateOrderStatus(token, status, paymentReference = null) {
  const updates = { status };
  if (paymentReference) {
    updates.payment_reference = paymentReference;
  }

  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('token', token)
    .select('*')
    .single();
  
  if (error) throw error;
  return data;
}

async function updateOrderById(id, updates) {
  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  
  if (error) throw error;
  return data;
}

// ========================================================
// ORDER ITEMS
// ========================================================

async function createOrderItems(items) {
  const { data, error } = await supabase
    .from('order_items')
    .insert(items)
    .select('*');
  
  if (error) throw error;
  return data;
}

async function getOrderItemsByOrderId(orderId) {
  const { data, error } = await supabase
    .from('order_items')
    .select('*, products:product_id(name, image_url)')
    .eq('order_id', orderId);
  
  if (error) throw error;
  return data || [];
}

// ========================================================
// CATEGORIES
// ========================================================

async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  
  if (error) throw error;
  return data || [];
}

async function createCategory(category) {
  const { data, error } = await supabase
    .from('categories')
    .insert(category)
    .select('*')
    .single();
  
  if (error) throw error;
  return data;
}

async function updateCategory(slug, updates) {
  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('slug', slug)
    .select('*')
    .single();
  
  if (error) throw error;
  return data;
}

async function searchProducts(query) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

async function getCategoryBySlug(slug) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function deleteCategory(slug) {
  const { data, error } = await supabase
    .from('categories')
    .delete()
    .eq('slug', slug)
    .select('id')
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ========================================================
// WISHLISTS (Per-customer saved favorites)
// ========================================================

async function getWishlist(customerId) {
  const { data, error } = await supabase
    .from('wishlists')
    .select('product_id')
    .eq('customer_id', customerId);

  if (error) throw error;
  return (data || []).map(w => w.product_id);
}

async function addToWishlist(customerId, productId) {
  const { error } = await supabase
    .from('wishlists')
    .insert({ customer_id: customerId, product_id: productId })
    .select('id')
    .single();

  // 23505 = unique violation (already saved) — treat as success
  if (error && error.code !== '23505') throw error;
  return true;
}

async function removeFromWishlist(customerId, productId) {
  const { error } = await supabase
    .from('wishlists')
    .delete()
    .eq('customer_id', customerId)
    .eq('product_id', productId);

  if (error) throw error;
  return true;
}

async function getWishlistProducts(customerId) {
  const { data, error } = await supabase
    .from('wishlists')
    .select('product_id, products:product_id(*)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(w => w.products).filter(Boolean);
}

// ========================================================
// LOOKBOOKS (Shop-the-Look editorial)
// ========================================================

async function getLookbooks() {
  const { data, error } = await supabase
    .from('lookbooks')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Get all lookbooks including inactive (for admin)
async function getAllLookbooks() {
  const { data, error } = await supabase
    .from('lookbooks')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getLookbookBySlug(slug) {
  const { data, error } = await supabase
    .from('lookbooks')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function getLookbookProducts(lookbookId) {
  const { data, error } = await supabase
    .from('lookbook_items')
    .select('id, display_order, product_id, products:product_id(*)')
    .eq('lookbook_id', lookbookId)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return (data || []).map(i => ({
    id: i.id,
    product_id: i.product_id,
    display_order: i.display_order,
    ...i.products
  })).filter(Boolean);
}

async function createLookbook(lookbook) {
  const { data, error } = await supabase
    .from('lookbooks')
    .insert(lookbook)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function updateLookbook(slug, updates) {
  const { data, error } = await supabase
    .from('lookbooks')
    .update(updates)
    .eq('slug', slug)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function deleteLookbook(slug) {
  const { data, error } = await supabase
    .from('lookbooks')
    .delete()
    .eq('slug', slug)
    .select('id')
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function addLookbookProduct(lookbookId, productId, displayOrder = 0) {
  const { data, error } = await supabase
    .from('lookbook_items')
    .insert({ lookbook_id: lookbookId, product_id: productId, display_order: displayOrder })
    .select('*')
    .single();

  // 23505 = already exists — return existing
  if (error && error.code !== '23505') throw error;
  if (!data) {
    const { data: existing } = await supabase
      .from('lookbook_items')
      .select('*')
      .eq('lookbook_id', lookbookId)
      .eq('product_id', productId)
      .single();
    return existing;
  }
  return data;
}

async function removeLookbookProduct(lookbookItemId) {
  const { data, error } = await supabase
    .from('lookbook_items')
    .delete()
    .eq('id', lookbookItemId)
    .select('id')
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ========================================================
// REGIONAL PRICES (per-product pricing per region)
// ========================================================

async function getRegionalPrices(productId) {
  const { data, error } = await supabase
    .from('regional_prices')
    .select('*')
    .eq('product_id', productId)
    .eq('is_active', true)
    .order('region', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function setRegionalPrice(productId, region, price) {
  const { data, error } = await supabase
    .from('regional_prices')
    .upsert({ product_id: productId, region, price, is_active: true })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function removeRegionalPrice(productId, region) {
  const { error } = await supabase
    .from('regional_prices')
    .delete()
    .eq('product_id', productId)
    .eq('region', region);

  if (error) throw error;
  return true;
}

// ========================================================
// USER LOGS
// ========================================================

async function createUserLog(log) {
  const { data, error } = await supabase
    .from('user_logs')
    .insert(log)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function getUserLogs(filters = {}) {
  let query = supabase
    .from('user_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit || 100);

  if (filters.user_type) {
    query = query.eq('user_type', filters.user_type);
  }

  if (filters.user_email) {
    query = query.eq('user_email', filters.user_email);
  }

  if (filters.action) {
    query = query.eq('action', filters.action);
  }

  if (filters.start_date) {
    query = query.gte('created_at', filters.start_date);
  }

  if (filters.end_date) {
    query = query.lte('created_at', filters.end_date);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ========================================================
// RAW QUERY FALLBACK (for complex operations)
// ========================================================

async function executeRawQuery(query, params = []) {
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      query_text: query,
      params: JSON.stringify(params)
    });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Raw SQL query error:', err.message);
    throw err;
  }
}

module.exports = {
  // Customers
  findCustomerByEmail,
  findCustomerById,
  createCustomer,
  updateCustomerPassword,
  updateCustomer,
  getAllCustomers,
  
  // Password Resets
  createPasswordReset,
  findValidResetCode,
  invalidateAllResetCodes,
  
  // Products
  getAllProducts,
  getProductBySlug,
  getProductById,
  getNewArrivals,
  searchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  decrementProductStock,
  
  // Orders
  createOrder,
  getOrderByToken,
  getAllOrders,
  updateOrderStatus,
  updateOrderById,
  
  // Order Items
  createOrderItems,
  getOrderItemsByOrderId,
  
  // Raw query
  executeRawQuery,
  
  // Supabase client (for advanced use)
  supabase,
  
  // Categories
  getCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,

  // Wishlists
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  getWishlistProducts,

  // User Logs
  createUserLog,
  getUserLogs,

  // Lookbooks
  getLookbooks,
  getAllLookbooks,
  getLookbookBySlug,
  getLookbookProducts,
  createLookbook,
  updateLookbook,
  deleteLookbook,
  addLookbookProduct,
  removeLookbookProduct,

  // Regional Prices
  getRegionalPrices,
  setRegionalPrice,
  removeRegionalPrice
};
