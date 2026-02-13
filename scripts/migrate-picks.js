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

// --- Category Overrides ---
// Manual overrides for products where name-based detection fails.
// Keyed by productId (styleCode or slug). Checked FIRST.
const CATEGORY_OVERRIDES = {
  'CT8532-101': 'Sneakers',   // Air Jordan 3 Retro "Lucky Shorts" — colorway name, not clothing
  'JW1110':     'Clothing',   // adidas Satin Hood x Wales Bonner — it's a hood/top garment
  'DZ5474-010': 'Clothing',   // Air Jordan x Travis Scott Waxed Jacket
};

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
  if (clean.startsWith('Find your new favourite pair')) return '';
  return clean.length > 300 ? clean.slice(0, 297) + '...' : clean;
}

function cleanName(name) {
  let n = name.replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  n = n.replace(/\s*-\s*[A-Za-z0-9][\w-]+$/, '').trim();
  n = n.replace(/^(Jordan|Nike|adidas|Puma|New Balance)\s+\1\s+/i, '$1 ');
  n = n.replace(/^(adidas|Nike)\s+(Originals|Sportswear|Basketball|Running)\s+/i, '$1 ');
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

/**
 * Determine product category from ALL items in a merged group.
 *
 * Priority:
 *   0. Manual override by productId (CATEGORY_OVERRIDES)
 *   1. Name contains "sneaker(s)" → Sneakers
 *   2. Accessories keywords → Accessories
 *   3. Explicit clothing keywords (jacket, hoodie, hood, etc.) → Clothing
 *   4. "top" (excluding "high-top") → Clothing
 *   5. "short(s)" without sneaker context → Clothing
 *   6. Tag fallback "clothing" without sneaker context → Clothing
 *   7. Default → Sneakers
 *
 * Categories: Sneakers | Clothing | Accessories
 */
function determineCategory(productId, items) {
  // 0. Manual override — bulletproof for known edge cases
  if (CATEGORY_OVERRIDES[productId]) {
    return CATEGORY_OVERRIDES[productId];
  }

  const allNames = items.map(i => (i.name || '').toLowerCase()).join(' ');
  const allTags  = items.flatMap(i => i.tags || []).map(t => t.toLowerCase()).join(' ');

  const sneakerContext = /\b(air jordan|jordan \d|retro|dunk|air force|air max|yeezy|spizike)\b/i.test(allNames);

  // 1. Explicit sneaker in name
  if (/\bsneakers?\b/i.test(allNames)) {
    return 'Sneakers';
  }

  // 2. Accessories
  const accessoriesPattern = /\b(cap|hat|beanie|bag|backpack|wallet|scarf|belt|watch|sunglasses|keychain|socks|gloves|headband|wristband|lanyard|pouch|tote|holder)\b/i;
  if (accessoriesPattern.test(allNames) || allTags.includes('accessories')) {
    return 'Accessories';
  }

  // 3. Explicit clothing keywords — always Clothing
  const explicitClothing = /\b(jacket|puffer|hoodie|hoody|hood|pants?|tee(?!\s+holder)|t-shirt|jeans|shirt|polo|vest|fleece|jogger|tracksuit|sweater|sweatshirt|coat|dress|crew\s*neck|pullover|cardigan|anorak|parka|windbreaker|overshirt)\b/i;
  if (explicitClothing.test(allNames)) {
    return 'Clothing';
  }

  // 4. "top" excluding "high-top"
  if (/(?<![-])\btop\b/i.test(allNames)) {
    return 'Clothing';
  }

  // 5. "short(s)" — only Clothing without sneaker context
  if (/\bshorts?\b/i.test(allNames) && !sneakerContext) {
    return 'Clothing';
  }

  // 6. Tag fallback — only without sneaker context
  if (allTags.includes('clothing') && !sneakerContext) {
    return 'Clothing';
  }

  // 7. Default
  return 'Sneakers';
}

function upgradeImageUrl(url) {
  if (!url) return '';
  if (url.includes('res.cloudinary.com') && !url.includes('c_pad')) {
    return url.replace('/f_auto,q_auto/', '/f_auto,q_auto,w_800,h_800,c_pad,b_white/');
  }
  return url;
}

function metadataScore(item) {
  let score = 0;
  const desc = cleanDescription(item.description);
  if (desc.length > 0) score += 3;
  if (desc.length > 100) score += 2;
  const cw = item.colorway || '';
  if (cw && cw !== 'TBD' && cw !== 'Kies een model*') score += 3;
  if (item._originalImage) score += 2;
  if ((item.name || '').length > 30) score += 1;
  if ((item.tags || []).length > 2) score += 1;
  return score;
}

function cleanTags(items, category) {
  const raw = items.flatMap(i => i.tags || []);
  const cleaned = new Set();
  const skipPatterns = /^(shoes and accessories|shoes|footwear|menswear|womenswear|new arrivals|new in)$/i;

  for (const tag of raw) {
    const t = tag.trim();
    if (!t) continue;
    if (skipPatterns.test(t)) continue;
    cleaned.add(t);
  }

  cleaned.add(category);
  return [...cleaned];
}

// --- Main Migration ---
function migrate() {
  console.log('Reading picks.json...');
  const data = JSON.parse(fs.readFileSync(PICKS_PATH, 'utf8'));
  const picks = data.picks;
  console.log(`Found ${picks.length} items`);

  const validPicks = picks.filter(p => p.name !== 'Access Denied');
  console.log(`After removing Access Denied: ${validPicks.length} items`);

  const productMap = new Map();

  for (const pick of validPicks) {
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

  if (!fs.existsSync(PRODUCTS_DIR)) {
    fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
  }

  const indexEntries = [];
  const categoryStats = {};

  for (const [productId, items] of productMap) {
    const base = items.reduce((a, b) => metadataScore(a) >= metadataScore(b) ? a : b);

    const bestColorway = items
      .map(i => i.colorway || '')
      .find(c => c && c !== 'TBD' && c !== 'Kies een model*') || '';

    const bestOriginalImage = items
      .map(i => i._originalImage || '')
      .find(img => img) || '';

    const bestName = items
      .map(i => cleanName(i.name))
      .reduce((a, b) => b.length > a.length ? b : a);

    const category = determineCategory(productId, items);
    categoryStats[category] = (categoryStats[category] || 0) + 1;

    const listings = items.map(item => {
      let retail = parsePrice(item.retailPrice);
      let sale = parsePrice(item.salePrice);

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

    const seenListings = new Set();
    const uniqueListings = listings.filter(l => {
      const key = `${l.store}|${l.url}`;
      if (seenListings.has(key)) return false;
      seenListings.add(key);
      return true;
    });

    const image = upgradeImageUrl(base.image || '');
    const tags = cleanTags(items, category);

    const product = {
      productId,
      name: bestName,
      brand: base.brand || '',
      colorway: bestColorway || 'TBD',
      category,
      tags,
      image,
      originalImage: bestOriginalImage,
      imageStatus: image ? 'ok' : 'missing',
      description: cleanDescription(base.description),
      listings: uniqueListings
    };

    const filename = `${productId}.json`;
    const filepath = path.join(PRODUCTS_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(product, null, 2));

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
  console.log(`  Categories: ${JSON.stringify(categoryStats)}`);
}

migrate();
