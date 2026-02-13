#!/usr/bin/env node
/**
 * Migration Script: picks.json → Product-centric data model
 * 
 * Transforms the flat picks.json array into individual product files
 * under data/products/, merging duplicates across stores.
 * 
 * Usage: node scripts/migrate-picks.js
 * 
 * Part of #5 - Data Architecture overhaul
 */

const fs = require('fs');
const path = require('path');

// --- Config ---
const PICKS_PATH = path.join(__dirname, '..', 'data', 'picks.json');
const PRODUCTS_DIR = path.join(__dirname, '..', 'data', 'products');
const INDEX_PATH = path.join(__dirname, '..', 'data', 'index.json');

// --- Helpers ---
function slugify(text) {
  return text.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-$/, '');
}

function parsePrice(priceStr) {
  if (!priceStr || !priceStr.trim()) return null;
  const str = priceStr.trim();
  if (str.startsWith('€')) {
    return { amount: parseFloat(str.slice(1).replace(',', '.')), currency: 'EUR' };
  } else if (str.startsWith('£')) {
    return { amount: parseFloat(str.slice(1).replace(',', '.')), currency: 'GBP' };
  } else if (str.startsWith('$')) {
    return { amount: parseFloat(str.slice(1).replace(',', '.')), currency: 'USD' };
  }
  return null;
}

function extractStyleCode(name) {
  const match = name.match(/\s*-\s*([A-Za-z0-9][\w-]+)$/);
  if (match && match[1].length >= 5 && /\d/.test(match[1])) {
    return match[1].trim();
  }
  return null;
}

function cleanDescription(desc) {
  if (!desc) return '';
  let clean = desc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  // Filter out SNS placeholder descriptions
  if (clean.startsWith('Find your new favourite pair')) return '';
  return clean.length > 300 ? clean.slice(0, 297) + '...' : clean;
}

function cleanName(name) {
  let n = name.replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  // Remove style code suffix
  n = n.replace(/\s*-\s*[A-Za-z0-9][\w-]+$/, '').trim();
  // Remove duplicate brand prefix
  n = n.replace(/^(Jordan|Nike|adidas|Puma|New Balance)\s+\1\s+/i, '$1 ');
  // Remove sub-brand prefixes
  n = n.replace(/^(adidas|Nike)\s+(Originals|Sportswear|Basketball|Running)\s+/i, '$1 ');
  // Remove Wmns prefix
  n = n.replace(/\bWmns\s+/g, '');
  return n;
}

function storeSlug(storeName) {
  const map = {
    'END. Clothing': 'end-clothing',
    'Foot Locker': 'foot-locker',
    'SNS (Sneakersnstuff)': 'sns',
    'MR PORTER': 'mr-porter'
  };
  return map[storeName] || slugify(storeName);
}

function determineCategory(item) {
  const name = (item.name || '').toLowerCase();
  const tags = (item.tags || []).join(' ').toLowerCase();
  if (tags.includes('clothing') || /jacket|hoodie|pant|short|tee|hood|top|jeans/i.test(name)) return 'Clothing';
  if (/cap|hat/i.test(name)) return 'Accessories';
  if (/sandal|slipper|loafer|clog|boot|mule|boat shoe/i.test(name)) return 'Footwear';
  return 'Sneakers';
}

function upgradeImageUrl(url) {
  if (!url) return '';
  // Add standardized transforms if not present
  if (url.includes('res.cloudinary.com') && !url.includes('c_pad')) {
    return url.replace('/f_auto,q_auto/', '/f_auto,q_auto,w_800,h_800,c_pad,b_white/');
  }
  return url;
}

// --- Main Migration ---
function migrate() {
  console.log('Reading picks.json...');
  const data = JSON.parse(fs.readFileSync(PICKS_PATH, 'utf8'));
  const picks = data.picks;
  console.log(`Found ${picks.length} items`);

  // Step 1: Filter out Access Denied items
  const validPicks = picks.filter(p => p.name !== 'Access Denied');
  console.log(`After removing Access Denied: ${validPicks.length} items`);

  // Step 2: Resolve product IDs and group duplicates
  const productMap = new Map(); // productId -> [items]

  for (const pick of validPicks) {
    // Determine product ID
    let productId = pick.styleCode || '';
    if (!productId) {
      productId = extractStyleCode(pick.name) || '';
    }
    if (!productId) {
      productId = slugify(pick.name);
    }

    if (!productMap.has(productId)) {
      productMap.set(productId, []);
    }
    productMap.get(productId).push(pick);
  }

  console.log(`Grouped into ${productMap.size} unique products`);

  // Step 3: Create products directory
  if (!fs.existsSync(PRODUCTS_DIR)) {
    fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
  }

  // Step 4: Transform and write each product
  const indexEntries = [];

  for (const [productId, items] of productMap) {
    // Use the item with the most data as base
    const base = items.reduce((a, b) => 
      (cleanDescription(a.description) || '').length >= (cleanDescription(b.description) || '').length ? a : b
    );

    // Build listings
    const listings = items.map(item => {
      let retail = parsePrice(item.retailPrice);
      let sale = parsePrice(item.salePrice);

      // Fix pricing anomalies: if retail < sale, swap them
      if (retail && sale && retail.amount < sale.amount) {
        [retail, sale] = [sale, retail];
      }

      const discount = (retail && sale && retail.amount > 0)
        ? Math.round((retail.amount - sale.amount) / retail.amount * 100)
        : 0;

      return {
        store: storeSlug(item.store),
        url: item.url || '',
        retailPrice: retail || { amount: 0, currency: 'EUR' },
        salePrice: sale || { amount: 0, currency: 'EUR' },
        discount: Math.max(0, discount),
        sizes: item.sizes || [],
        lastScraped: '2026-02-12T00:00:00Z',
        available: (item.sizes || []).length > 0
      };
    });

    // Deduplicate listings by store+url
    const seenListings = new Set();
    const uniqueListings = listings.filter(l => {
      const key = `${l.store}|${l.url}`;
      if (seenListings.has(key)) return false;
      seenListings.add(key);
      return true;
    });

    const image = upgradeImageUrl(base.image || '');
    const colorway = (base.colorway && base.colorway !== 'Kies een model*') ? base.colorway : '';

    const product = {
      productId,
      name: cleanName(base.name),
      brand: base.brand || '',
      colorway: colorway || 'TBD',
      category: determineCategory(base),
      tags: [...new Set(items.flatMap(i => i.tags || []))],
      image,
      originalImage: base._originalImage || '',
      imageStatus: image ? 'ok' : 'missing',
      description: cleanDescription(base.description),
      listings: uniqueListings
    };

    // Write product file
    const filename = `${productId}.json`;
    const filepath = path.join(PRODUCTS_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(product, null, 2));

    // Build index entry
    const allSalePrices = uniqueListings
      .map(l => l.salePrice)
      .filter(p => p && p.amount > 0);
    
    const bestPrice = allSalePrices.length > 0
      ? allSalePrices.reduce((min, p) => p.amount < min.amount ? p : min)
      : { amount: 0, currency: 'EUR' };

    indexEntries.push({
      productId,
      name: product.name,
      brand: product.brand,
      category: product.category,
      image: product.image,
      bestPrice,
      storeCount: uniqueListings.length,
      tags: product.tags
    });
  }

  // Step 5: Write index.json
  const index = {
    products: indexEntries.sort((a, b) => a.name.localeCompare(b.name)),
    generatedAt: new Date().toISOString(),
    totalProducts: indexEntries.length
  };
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));

  console.log(`\nMigration complete!`);
  console.log(`  Product files: ${productMap.size}`);
  console.log(`  Index entries: ${indexEntries.length}`);
  console.log(`  Merged duplicates: ${validPicks.length - productMap.size}`);
  console.log(`  Removed Access Denied: ${picks.length - validPicks.length}`);
}

migrate();
