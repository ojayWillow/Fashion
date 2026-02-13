/**
 * FASHION. — Writer
 * ==================
 * Saves product data to:
 *   1. data/products/{productId}.json   — catalog (SCHEMA.md format)
 *   2. data/inventory/{store-slug}.json — per-store inventory
 *
 * Also rebuilds data/index.json from all product files.
 */

const fs = require('fs');
const path = require('path');
const { log } = require('./helpers');

const PRODUCTS_DIR = path.join(__dirname, '..', '..', 'data', 'products');
const INVENTORY_DIR = path.join(__dirname, '..', '..', 'data', 'inventory');
const INDEX_PATH = path.join(__dirname, '..', '..', 'data', 'index.json');

// ===== PRODUCT FILES =====

/**
 * Save or update a product file in data/products/{productId}.json
 * Follows SCHEMA.md format.
 */
function saveProduct(product) {
  fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
  const filePath = path.join(PRODUCTS_DIR, `${product.productId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(product, null, 2) + '\n');
  log(`Saved product: ${filePath}`);
}

// ===== INVENTORY FILES =====

/**
 * Save or append a product to data/inventory/{store-slug}.json
 * Each inventory file groups all products from one store.
 */
function saveToInventory(store, product, listing) {
  fs.mkdirSync(INVENTORY_DIR, { recursive: true });
  const filePath = path.join(INVENTORY_DIR, `${store.slug}.json`);

  let inventory;
  if (fs.existsSync(filePath)) {
    inventory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } else {
    inventory = {
      store: store.name,
      slug: store.slug,
      flag: store.flag,
      country: store.country,
      currency: store.currency,
      lastUpdated: '',
      totalProducts: 0,
      products: [],
    };
  }

  // Check if product already exists in this inventory
  const existingIdx = inventory.products.findIndex(p => p.productId === product.productId);

  const inventoryEntry = {
    productId: product.productId,
    name: product.name,
    brand: product.brand,
    category: product.category,
    image: product.image,
    url: listing.url,
    retailPrice: listing.retailPrice,
    salePrice: listing.salePrice,
    discount: listing.discount,
    sizes: listing.sizes,
    addedDate: new Date().toISOString().split('T')[0],
    lastChecked: new Date().toISOString().split('T')[0],
    status: 'active',
  };

  if (existingIdx >= 0) {
    inventory.products[existingIdx] = inventoryEntry;
    log(`Updated in inventory: ${store.slug} → ${product.productId}`);
  } else {
    inventory.products.push(inventoryEntry);
    log(`Added to inventory: ${store.slug} → ${product.productId}`);
  }

  inventory.totalProducts = inventory.products.length;
  inventory.lastUpdated = new Date().toISOString().split('T')[0];

  fs.writeFileSync(filePath, JSON.stringify(inventory, null, 2) + '\n');
}

// ===== INDEX =====

/**
 * Rebuild data/index.json from all product files.
 * The index is a lightweight list used by the frontend for catalog display.
 */
function rebuildIndex() {
  if (!fs.existsSync(PRODUCTS_DIR)) {
    log('No products directory, skipping index rebuild');
    return;
  }

  const files = fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith('.json'));
  const products = [];
  const brandCounts = {};
  const categoryCounts = {};
  const storeCounts = {};

  for (const file of files) {
    try {
      const product = JSON.parse(fs.readFileSync(path.join(PRODUCTS_DIR, file), 'utf-8'));

      // Find best price across all listings
      let bestPrice = null;
      let storeCount = 0;

      for (const listing of (product.listings || [])) {
        if (!listing.available) continue;
        storeCount++;
        const storeSlug = listing.store;
        storeCounts[storeSlug] = (storeCounts[storeSlug] || 0) + 1;

        if (listing.salePrice && (!bestPrice || listing.salePrice.amount < bestPrice.amount)) {
          bestPrice = listing.salePrice;
        }
      }

      products.push({
        productId: product.productId,
        name: product.name,
        brand: product.brand,
        category: product.category,
        image: product.image,
        imageStatus: product.imageStatus,
        bestPrice,
        storeCount,
        tags: product.tags || [],
      });

      // Count brands
      if (product.brand) {
        brandCounts[product.brand] = (brandCounts[product.brand] || 0) + 1;
      }
      // Count categories
      if (product.category) {
        categoryCounts[product.category] = (categoryCounts[product.category] || 0) + 1;
      }
    } catch (e) {
      log(`Warning: could not read ${file}: ${e.message}`);
    }
  }

  // Sort products by brand then name
  products.sort((a, b) => {
    if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
    return a.name.localeCompare(b.name);
  });

  const brands = Object.entries(brandCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const categoryIcons = {
    Sneakers: '👟', Clothing: '👕', Footwear: '🥾', Accessories: '👜',
  };

  const categories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, icon: categoryIcons[name] || '🏷️' }));

  // Build store summaries from inventory files
  const stores = [];
  if (fs.existsSync(INVENTORY_DIR)) {
    const invFiles = fs.readdirSync(INVENTORY_DIR).filter(f => f.endsWith('.json'));
    for (const file of invFiles) {
      try {
        const inv = JSON.parse(fs.readFileSync(path.join(INVENTORY_DIR, file), 'utf-8'));
        const activeCount = inv.products.filter(p => p.status === 'active').length;
        stores.push({
          slug: inv.slug,
          name: inv.store,
          flag: inv.flag,
          count: activeCount,
        });
      } catch (e) {
        log(`Warning: could not read inventory ${file}`);
      }
    }
    stores.sort((a, b) => b.count - a.count);
  }

  const index = {
    generatedAt: new Date().toISOString(),
    totalProducts: products.length,
    products,
    brands,
    categories,
    stores,
  };

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n');
  log(`Index rebuilt: ${products.length} products, ${brands.length} brands, ${stores.length} stores`);
}

module.exports = { saveProduct, saveToInventory, rebuildIndex };
