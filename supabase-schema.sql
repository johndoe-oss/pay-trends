-- =============================================================
-- PAYJAY TRENDS - Supabase Database Schema
-- Run this in the Supabase SQL Editor to set up your database
-- =============================================================

-- 1. CUSTOMERS TABLE (Auth users)
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  address TEXT,
  region VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. PASSWORD RESET TABLE (6-digit code verification)
CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL REFERENCES customers(email) ON DELETE CASCADE,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. CATEGORIES TABLE (Dynamic categories managed by admin)
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  image_url TEXT,
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  category VARCHAR(100) NOT NULL,
  product_type VARCHAR(100),
  sizes TEXT[] NOT NULL,
  colors TEXT[] NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(100) NOT NULL,
  delivery_address TEXT NOT NULL,
  region VARCHAR(100) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'placed',
  payment_reference VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE CASCADE,
  size VARCHAR(50) NOT NULL,
  color VARCHAR(50) NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10, 2) NOT NULL
);

-- 7. REGIONAL PRICES TABLE (per-product pricing per region)
CREATE TABLE IF NOT EXISTS regional_prices (
  id SERIAL PRIMARY KEY,
  product_id INT REFERENCES products(id) ON DELETE CASCADE,
  region VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, region)
);

-- 8. WISHLISTS TABLE (Per-customer saved favorites)
CREATE TABLE IF NOT EXISTS wishlists (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, product_id)
);

-- 9. LOOKBOOKS TABLE (Editorial "Shop the Look" collections)
CREATE TABLE IF NOT EXISTS lookbooks (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255),
  description TEXT,
  image_url TEXT,
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. LOOKBOOK ITEMS TABLE (Products featured inside a lookbook)
CREATE TABLE IF NOT EXISTS lookbook_items (
  id SERIAL PRIMARY KEY,
  lookbook_id INT REFERENCES lookbooks(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE CASCADE,
  display_order INT DEFAULT 0,
  UNIQUE(lookbook_id, product_id)
);

-- 11. USER LOGS TABLE (Track all user activities and actions)
CREATE TABLE IF NOT EXISTS user_logs (
  id SERIAL PRIMARY KEY,
  user_type VARCHAR(50) NOT NULL, -- 'customer', 'admin', 'system'
  user_id INT, -- customer.id or null for anonymous
  user_email VARCHAR(255), -- customer email or system identifier
  action VARCHAR(100) NOT NULL, -- e.g., 'signup', 'login', 'logout', 'place_order', 'update_profile', 'admin_login', etc.
  description TEXT, -- detailed description of the action
  ip_address VARCHAR(45), -- user IP address
  user_agent TEXT, -- browser/device info
  metadata JSONB, -- additional data (e.g., order_id, product_id, etc.)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_token ON orders(token);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email);
CREATE INDEX IF NOT EXISTS idx_password_resets_code ON password_resets(code);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);
CREATE INDEX IF NOT EXISTS idx_wishlists_customer ON wishlists(customer_id);
CREATE INDEX IF NOT EXISTS idx_lookbook_items_lookbook ON lookbook_items(lookbook_id);
CREATE INDEX IF NOT EXISTS idx_regional_prices_product ON regional_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_regional_prices_region ON regional_prices(region);
CREATE INDEX IF NOT EXISTS idx_regional_prices_active ON regional_prices(is_active);
CREATE INDEX IF NOT EXISTS idx_regional_prices_unique ON regional_prices(product_id, region);

-- =============================================================
-- MIGRATION: Add phone and address columns to customers (if not exist)
-- =============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'phone') THEN
    ALTER TABLE customers ADD COLUMN phone VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'address') THEN
    ALTER TABLE customers ADD COLUMN address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'region') THEN
    ALTER TABLE customers ADD COLUMN region VARCHAR(100);
  END IF;
END $$;

-- =============================================================
-- TRIGGER: Auto-update updated_at on regional_prices
-- =============================================================
CREATE OR REPLACE FUNCTION update_regional_prices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_regional_prices_updated_at ON regional_prices;
CREATE TRIGGER trg_regional_prices_updated_at
  BEFORE UPDATE ON regional_prices
  FOR EACH ROW
  EXECUTE FUNCTION update_regional_prices_updated_at();

-- =============================================================
-- SEED DATA: Categories
-- =============================================================
INSERT INTO categories (name, slug, description, image_url, display_order, is_active)
VALUES
  ('Men', 'men', 'Premium menswear collection featuring suits, jeans, short sleeves, and more', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=600', 1, TRUE),
  ('Women', 'women', 'Elegant womenswear collection with dresses, skirts, and contemporary styles', 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&q=80&w=600', 2, TRUE),
  ('Kids', 'kids', 'Adorable and comfortable clothing for children of all ages', 'https://images.unsplash.com/photo-1503944583220-79d8926ad5e2?auto=format&fit=crop&q=80&w=600', 3, TRUE),
  ('Accessories', 'accessories', 'Complete your look with our premium accessories collection', 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&q=80&w=600', 4, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- =============================================================
-- SEED DATA: Sample Products
-- =============================================================
INSERT INTO products (slug, name, description, price, stock, category, product_type, sizes, colors, image_url)
VALUES
  ('mens-oversized-linen-shirt', 'Men''s Oversized Linen Shirt', 'Experience premium comfort with our 100% pure linen shirt. Features a relaxed fit, breathable design, and classic button-up front. Perfect for Ghana''s tropical climate.', 180.00, 25, 'Men', 'Shirts', ARRAY['S','M','L','XL'], ARRAY['White','Beige','Navy Blue'], 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&q=80&w=600'),
  ('mens-slim-fit-blazer', 'Men''s Slim Fit Tailored Blazer', 'Elevate your evening and formal attire with this slim-fit blazer. Crafted with structural shoulders, notch lapels, and double vents.', 450.00, 10, 'Men', 'Blazers', ARRAY['M','L','XL'], ARRAY['Obsidian Black','Charcoal Grey'], 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=600'),
  ('mens-relaxed-cargo-pants', 'Men''s Relaxed Fit Utility Cargo', 'Durable cotton cargo pants with six pocket storage, adjustable drawstring cuffs, and reinforced stitching for style and daily utility.', 195.00, 20, 'Men', 'Pants', ARRAY['S','M','L','XL'], ARRAY['Olive Green','Desert Sand','Matte Black'], 'https://images.unsplash.com/photo-1517462964-21fdcec3f25b?auto=format&fit=crop&q=80&w=600'),
  ('womens-floral-summer-dress', 'Women''s Floral Summer Dress', 'An elegant, lightweight summer dress with an all-over floral print, side slit, and adjustable straps. Offers a premium fluid movement with every step.', 220.00, 15, 'Women', 'Dresses', ARRAY['XS','S','M','L'], ARRAY['Floral Red','Floral Yellow','Midnight Black'], 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&q=80&w=600'),
  ('womens-ribbed-knit-skirt', 'Women''s Ribbed Knit Midi Skirt', 'A premium ribbed midi skirt that adapts beautifully to your outline. Form-fitting waist, stretch knit fabric, and a sophisticated side slit.', 160.00, 30, 'Women', 'Skirts', ARRAY['S','M','L'], ARRAY['Beige','Emerald Green','Warm Cocoa'], 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&q=80&w=600'),
  ('womens-satin-slip-dress', 'Women''s Luxury Satin Slip Dress', 'Slip into pure luxury with this fluid satin dress. Emits a rich sheen under warm lighting. Drape cowl neckline and delicate crisscross back straps.', 290.00, 12, 'Women', 'Dresses', ARRAY['S','M','L'], ARRAY['Champagne Gold','Emerald','Classic Black'], 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&q=80&w=600'),
  ('kids-casual-t-shirt', 'Kids'' Colorful Casual T-Shirt', 'Soft cotton t-shirt for kids with fun prints. Comfortable fit perfect for playtime and everyday adventures.', 45.00, 50, 'Kids', 'T-Shirts', ARRAY['4Y','5Y','6Y','7Y','8Y'], ARRAY['Red','Blue','Yellow','Green'], 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&q=80&w=600'),
  ('kids-denim-overall', 'Kids'' Denim Overall', 'Durable denim overalls for active kids. Adjustable straps and reinforced knees for all-day play.', 75.00, 30, 'Kids', 'Overalls', ARRAY['3Y','4Y','5Y','6Y','7Y'], ARRAY['Light Blue','Dark Blue'], 'https://images.unsplash.com/photo-1522771930-78848d9293e8?auto=format&fit=crop&q=80&w=600')
ON CONFLICT (slug) DO NOTHING;

-- Seed default customer (for testing)
-- Password: password123
INSERT INTO customers (name, email, password_hash)
VALUES ('Daniel Mensah', 'daniel@payjay.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy')
ON CONFLICT (email) DO NOTHING;

-- =============================================================
-- SEED DATA: Lookbooks (Shop-the-Look editorial) — placed AFTER products
-- =============================================================
INSERT INTO lookbooks (slug, title, subtitle, description, image_url, display_order, is_active)
VALUES
  ('summer-luxe', 'Summer Luxe', 'Warm-weather essentials', 'Curated warm-weather styling featuring breathable linens and fluid silhouettes for the modern trendsetter.', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=1000', 1, TRUE),
  ('after-dark', 'After Dark', 'Evening & occasion wear', 'Elevate your evening with tailored structure and luxe satin fluidity, photographed under warm lights.', 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&q=80&w=1000', 2, TRUE),
  ('mini-trendsetters', 'Mini Trendsetters', 'Playful kids styling', 'Comfortable, durable and fun styling for the little ones, ready for every adventure.', 'https://images.unsplash.com/photo-1503944583220-79d8926ad5e2?auto=format&fit=crop&q=80&w=1000', 3, TRUE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO lookbook_items (lookbook_id, product_id, display_order)
SELECT lb.id, p.id, 1
FROM lookbooks lb, products p
WHERE lb.slug = 'summer-luxe' AND p.slug = 'mens-oversized-linen-shirt'
ON CONFLICT DO NOTHING;

INSERT INTO lookbook_items (lookbook_id, product_id, display_order)
SELECT lb.id, p.id, 2
FROM lookbooks lb, products p
WHERE lb.slug = 'summer-luxe' AND p.slug = 'womens-floral-summer-dress'
ON CONFLICT DO NOTHING;

INSERT INTO lookbook_items (lookbook_id, product_id, display_order)
SELECT lb.id, p.id, 1
FROM lookbooks lb, products p
WHERE lb.slug = 'after-dark' AND p.slug = 'mens-slim-fit-blazer'
ON CONFLICT DO NOTHING;

INSERT INTO lookbook_items (lookbook_id, product_id, display_order)
SELECT lb.id, p.id, 2
FROM lookbooks lb, products p
WHERE lb.slug = 'after-dark' AND p.slug = 'womens-satin-slip-dress'
ON CONFLICT DO NOTHING;

INSERT INTO lookbook_items (lookbook_id, product_id, display_order)
SELECT lb.id, p.id, 1
FROM lookbooks lb, products p
WHERE lb.slug = 'mini-trendsetters' AND p.slug = 'kids-casual-t-shirt'
ON CONFLICT DO NOTHING;

INSERT INTO lookbook_items (lookbook_id, product_id, display_order)
SELECT lb.id, p.id, 2
FROM lookbooks lb, products p
WHERE lb.slug = 'mini-trendsetters' AND p.slug = 'kids-denim-overall'
ON CONFLICT DO NOTHING;