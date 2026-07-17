const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function run() {
  const config = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    password: process.env.DB_PASSWORD || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
  };

  const client = new Client({ ...config, database: 'postgres' });
  try {
    await client.connect();
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [process.env.DB_NAME || 'payjay_trends']);
    if (res.rowCount === 0) {
      console.log(`Database '${process.env.DB_NAME || 'payjay_trends'}' does not exist. Creating...`);
      const sanitizedDbName = (process.env.DB_NAME || 'payjay_trends').replace(/[^a-zA-Z0-9_]/g, '');
      await client.query(`CREATE DATABASE ${sanitizedDbName}`);
      console.log(`Database '${sanitizedDbName}' created successfully.`);
    } else {
      console.log(`Database '${process.env.DB_NAME || 'payjay_trends'}' already exists.`);
    }
  } catch (err) {
    console.warn("Could not check/create database from 'postgres' connection. Will try connecting directly to target database.", err.message);
  } finally {
    await client.end();
  }

  // Connect to the target database
  const dbClient = new Client({ ...config, database: process.env.DB_NAME || 'payjay_trends' });
  try {
    await dbClient.connect();
    console.log("Connected to target database. Creating schema & index structures...");

    // 1. Create CUSTOMERS table (Strict SQL-injection-free definitions)
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Create PRODUCTS table
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        stock INT NOT NULL DEFAULT 0,
        category VARCHAR(100) NOT NULL,
        sizes TEXT[] NOT NULL,
        colors TEXT[] NOT NULL,
        image_url TEXT
      );
    `);

    // 3. Create ORDERS table linked to customers
    await dbClient.query(`
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
    `);

    // 4. Create ORDER ITEMS table
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INT REFERENCES orders(id) ON DELETE CASCADE,
        product_id INT REFERENCES products(id) ON DELETE CASCADE,
        size VARCHAR(50) NOT NULL,
        color VARCHAR(50) NOT NULL,
        quantity INT NOT NULL,
        price DECIMAL(10, 2) NOT NULL
      );
    `);

    console.log("Tables created successfully.");

    // ⚡ 5. ADD SQL INDEXES FOR HIGH-SPEED PERFORMANCE
    console.log("Adding SQL indexing optimizations...");
    await dbClient.query(`CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);`);
    await dbClient.query(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);`);
    await dbClient.query(`CREATE INDEX IF NOT EXISTS idx_orders_token ON orders(token);`);
    await dbClient.query(`CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);`);
    await dbClient.query(`CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);`);
    console.log("SQL indexing applied successfully.");

    // 👤 6. Seed default customer account (daniel@payjay.com / password123)
    const seedEmail = 'daniel@payjay.com';
    const checkCust = await dbClient.query("SELECT 1 FROM customers WHERE email = $1", [seedEmail]);
    if (checkCust.rowCount === 0) {
      const hash = await bcrypt.hash('password123', 10);
      await dbClient.query(
        "INSERT INTO customers (name, email, password_hash) VALUES ($1, $2, $3)",
        ['Daniel Mensah', seedEmail, hash]
      );
      console.log(`Seeded default customer account: ${seedEmail} (password: password123)`);
    }

    // 🛍️ 7. Seed products catalog with high-fidelity, online clothing images
    const seedProducts = [
      {
        slug: "mens-oversized-linen-shirt",
        name: "Men's Oversized Linen Shirt",
        description: "Experience premium comfort with our 100% pure linen shirt. Features a relaxed fit, breathable design, and classic button-up front. Perfect for Ghana's tropical climate.",
        price: 180.00,
        stock: 25,
        category: "Men",
        sizes: ["S", "M", "L", "XL"],
        colors: ["White", "Beige", "Navy Blue"],
        image_url: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&q=80&w=600"
      },
      {
        slug: "womens-floral-summer-dress",
        name: "Women's Floral Summer Dress",
        description: "An elegant, lightweight summer dress with an all-over floral print, side slit, and adjustable straps. Offers a premium fluid movement with every step.",
        price: 220.00,
        stock: 15,
        category: "Women",
        sizes: ["XS", "S", "M", "L"],
        colors: ["Floral Red", "Floral Yellow", "Midnight Black"],
        image_url: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&q=80&w=600"
      },
      {
        slug: "mens-slim-fit-blazer",
        name: "Men's Slim Fit Tailored Blazer",
        description: "Elevate your evening and formal attire with this slim-fit blazer. Crafted with structural shoulders, notch lapels, and double vents.",
        price: 450.00,
        stock: 10,
        category: "Men",
        sizes: ["M", "L", "XL"],
        colors: ["Obsidian Black", "Charcoal Grey"],
        image_url: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=600"
      },
      {
        slug: "womens-ribbed-knit-skirt",
        name: "Women's Ribbed Knit Midi Skirt",
        description: "A premium ribbed midi skirt that adapts beautifully to your outline. Form-fitting waist, stretch knit fabric, and a sophisticated side slit.",
        price: 160.00,
        stock: 30,
        category: "Women",
        sizes: ["S", "M", "L"],
        colors: ["Beige", "Emerald Green", "Warm Cocoa"],
        image_url: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&q=80&w=600"
      },
      {
        slug: "mens-relaxed-cargo-pants",
        name: "Men's Relaxed Fit Utility Cargo",
        description: "Durable cotton cargo pants with six pocket storage, adjustable drawstring cuffs, and reinforced stitching for style and daily utility.",
        price: 195.00,
        stock: 20,
        category: "Men",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Olive Green", "Desert Sand", "Matte Black"],
        image_url: "https://images.unsplash.com/photo-1517462964-21fdcec3f25b?auto=format&fit=crop&q=80&w=600"
      },
      {
        slug: "womens-satin-slip-dress",
        name: "Women's Luxury Satin Slip Dress",
        description: "Slip into pure luxury with this fluid satin dress. Emits a rich sheen under warm lighting. Drape cowl neckline and delicate crisscross back straps.",
        price: 290.00,
        stock: 12,
        category: "Women",
        sizes: ["S", "M", "L"],
        colors: ["Champagne Gold", "Emerald", "Classic Black"],
        image_url: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&q=80&w=600"
      }
    ];

    for (const prod of seedProducts) {
      const checkRes = await dbClient.query("SELECT 1 FROM products WHERE slug = $1", [prod.slug]);
      if (checkRes.rowCount === 0) {
        await dbClient.query(
          "INSERT INTO products (slug, name, description, price, stock, category, sizes, colors, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
          [prod.slug, prod.name, prod.description, prod.price, prod.stock, prod.category, prod.sizes, prod.colors, prod.image_url]
        );
        console.log(`Seeded product: ${prod.name}`);
      }
    }

    console.log("Database initialized and seeded successfully!");
  } catch (err) {
    console.error("Database initialization failed:", err.stack);
  } finally {
    await dbClient.end();
  }
}

run();
