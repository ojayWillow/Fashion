#!/usr/bin/env node
/**
 * FASHION. — Process Queue
 * =========================
 * One command to rule them all.
 *
 * Scrapes product URLs from data/queue.txt, saves to:
 *   1. data/inventory/{store-slug}.json  (new inventory system)
 *   2. data/picks.json                   (backward compatible)
 *
 * Usage:
 *   node scripts/process-queue.js
 *   node scripts/process-queue.js --verbose
 *   node scripts/process-queue.js --dry-run
 *   node scripts/process-queue.js --requeue-denied
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { execSync } = require('child_process');

// ===== PATHS =====
const QUEUE_PATH = path.join(__dirname, '..', 'data', 'queue.txt');
const DONE_PATH = path.join(__dirname, '..', 'data', 'queue-done.txt');
const PICKS_PATH = path.join(__dirname, '..', 'data', 'picks.json');
const STORES_PATH = path.join(__dirname, '..', 'data', 'stores.json');
const CONFIGS_PATH = path.join(__dirname, '..', 'data', 'store-configs.json');
const IMAGES_DIR = path.join(__dirname, '..', 'images', 'picks');
const INVENTORY_DIR = path.join(__dirname, '..', 'data', 'inventory');

// ===== CLI =====
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const DRY_RUN = args.includes('--dry-run') || args.includes('--dry');
const REQUEUE_DENIED = args.includes('--requeue-denied');

function log(msg) { if (VERBOSE) console.log(`    [v] ${msg}`); }

// ===== CLOUDINARY =====
let cloudinary = null;
let CLOUD_ENABLED = false;
let CLOUD_NAME = '';

function initCloudinary() {
  const url = process.env.CLOUDINARY_URL;
  if (!url || url.includes('your_')) return;
  const m = url.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/);
  if (!m) return;
  try {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({ cloud_name: m[3], api_key: m[1], api_secret: m[2], secure: true });
    CLOUD_NAME = m[3]; CLOUD_ENABLED = true;
  } catch (e) {}
}

async function uploadToCloudinary(source, publicId) {
  if (!CLOUD_ENABLED) return null;
  try {
    let result;
    if (Buffer.isBuffer(source)) {
      result = await new Promise((resolve, reject) => {
        const s = cloudinary.uploader.upload_stream(
          { public_id: publicId, overwrite: true, resource_type: 'image' },
          (e, r) => e ? reject(e) : resolve(r)
        );
        s.end(source);
      });
    } else {
      result = await cloudinary.uploader.upload(source, {
        public_id: publicId, overwrite: true, resource_type: 'image'
      });
    }
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${publicId}`;
  } catch (e) { log(`Cloudinary upload failed: ${e.message}`); return null; }
}

// ===== HELPERS =====
function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
}

function storeSlug(storeName) {
  return storeName.toLowerCase().replace(/\./g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.toString().replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function formatPrice(num, currency) {
  if (!num) return '';
  const sym = currency === 'GBP' ? '\u00a3' : currency === 'USD' ? '$' : '\u20ac';
  return `${sym}${num.toFixed(num % 1 === 0 ? 0 : 2)}`;
}

function detectCurrency(domain) {
  if (domain.endsWith('.co.uk') || domain.endsWith('.uk')) return 'GBP';
  if (domain.endsWith('.com') && !domain.includes('.co')) return 'USD';
  return 'EUR';
}

function isValidSize(text) {
  if (!text || text.length > 15) return false;
  const t = text.trim();
  // EU sizes (bare or prefixed)
  if (/^(EU\s?)?\d{2}(\.5)?$/i.test(t)) {
    const n = parseFloat(t.replace(/^EU\s?/i, ''));
    if (n >= 16 && n <= 52) return true;
  }
  // US/UK sizes (bare or prefixed)
  if (/^(US|UK)?\s?\d{1,2}(\.5)?$/i.test(t)) return true;
  // Letter sizes
  if (/^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|XXXL)$/i.test(t)) return true;
  // Waist sizes
  if (/^W\d{2,3}$/i.test(t)) return true;
  // One-size
  if (/^OS$/i.test(t)) return true;
  // Kids sizes (2C, 5C, 1.5Y, etc.)
  if (/^\d{1,2}(\.5)?(C|Y)$/i.test(t)) return true;
  // Women's sizes (W12, etc.)
  if (/^W\d{1,2}(\.5)?$/i.test(t)) return true;
  // Bare numbers (24-52 range)
  if (/^\d{2}$/.test(t)) {
    const n = parseInt(t);
    if (n >= 24 && n <= 52) return true;
  }
  return false;
}

// ================================================================
// SIZE NORMALIZATION — converts all sizes to unified EU format
// ================================================================

const US_M_TO_EU = {
  3.5: 35.5, 4: 36, 4.5: 36.5, 5: 37.5, 5.5: 38,
  6: 38.5, 6.5: 39, 7: 40, 7.5: 40.5, 8: 41,
  8.5: 42, 9: 42.5, 9.5: 43, 10: 44, 10.5: 44.5,
  11: 45, 11.5: 45.5, 12: 46, 12.5: 47, 13: 47.5,
  14: 48.5, 15: 49.5
};

const UK_M_TO_EU = {
  3: 35.5, 3.5: 36, 4: 36.5, 4.5: 37.5, 5: 38,
  5.5: 38.5, 6: 39, 6.5: 40, 7: 40.5, 7.5: 41,
  8: 42, 8.5: 42.5, 9: 43, 9.5: 44, 10: 44.5,
  10.5: 45, 11: 45.5, 11.5: 46, 12: 47, 12.5: 47.5,
  13: 48.5, 14: 49.5
};

const US_W_TO_EU = {
  5: 35.5, 5.5: 36, 6: 36.5, 6.5: 37.5, 7: 38,
  7.5: 38.5, 8: 39, 8.5: 40, 9: 40.5, 9.5: 41,
  10: 42, 10.5: 42.5, 11: 43, 11.5: 44, 12: 44.5
};

const US_KIDS_TO_EU = {
  '1C': 16, '1.5C': 16.5, '2C': 17, '2.5C': 18, '3C': 18.5,
  '3.5C': 19, '4C': 19.5, '4.5C': 20, '5C': 21, '5.5C': 21.5,
  '6C': 22, '6.5C': 22.5, '7C': 23.5, '7.5C': 24, '8C': 25,
  '8.5C': 25.5, '9C': 26, '9.5C': 26.5, '10C': 27, '10.5C': 27.5,
  '11C': 28, '11.5C': 28.5, '12C': 29.5, '12.5C': 30, '13C': 31,
  '13.5C': 31.5,
  '1Y': 32, '1.5Y': 33, '2Y': 33.5, '2.5Y': 34, '3Y': 35,
  '3.5Y': 35.5, '4Y': 36, '4.5Y': 36.5, '5Y': 37.5, '5.5Y': 38,
  '6Y': 38.5, '6.5Y': 39, '7Y': 40
};

const SIZE_PASSTHROUGH = new Set([
  'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', 'OS'
]);

function isWomensProduct(name) {
  const n = (name || '').toLowerCase();
  return n.includes('wmns') || n.includes('women') || n.includes('wmn');
}

function isKidsProduct(name, tags) {
  const n = (name || '').toLowerCase();
  const tagsLower = (tags || []).map(t => t.toLowerCase());
  return n.includes('(td)') || n.includes('(ps)') || n.includes('(gs)') ||
         n.includes('baby') || n.includes('toddler') || n.includes('kids') ||
         tagsLower.includes('kids');
}

function getSizeSystem(storeName) {
  const s = (storeName || '').toLowerCase();
  if (s.includes('end'))        return 'END';   // UK or EU prefix
  if (s.includes('foot locker')) return 'FL';    // bare EU
  if (s.includes('sns') || s.includes('sneakersnstuff')) return 'SNS'; // bare US
  return 'UNKNOWN';
}

function normalizeSize(raw, storeName, productName, tags) {
  const s = raw.trim();
  const upper = s.toUpperCase();

  // Pass-through: letter sizes, one-size
  if (SIZE_PASSTHROUGH.has(upper)) return s;

  // Waist sizes (W28, W30, W32)
  if (/^W\d+/i.test(s)) return s;

  const system = getSizeSystem(storeName);
  const womens = isWomensProduct(productName);
  const kids = isKidsProduct(productName, tags);

  // Kids sizes with C/Y suffix
  const kidsMatch = s.match(/^(\d+\.?\d*)(C|Y)$/i);
  if (kidsMatch) {
    const key = kidsMatch[1] + kidsMatch[2].toUpperCase();
    const eu = US_KIDS_TO_EU[key];
    return eu ? 'EU ' + eu : s;
  }

  // Already has "EU" prefix
  const euMatch = s.match(/^EU\s+(\d+\.?\d*)$/i);
  if (euMatch) return 'EU ' + parseFloat(euMatch[1]);

  // Has "UK" prefix
  const ukMatch = s.match(/^UK\s+(\d+\.?\d*)(C|Y)?$/i);
  if (ukMatch) {
    const num = parseFloat(ukMatch[1]);
    const suffix = ukMatch[2] ? ukMatch[2].toUpperCase() : '';
    if (suffix) {
      const key = ukMatch[1] + suffix;
      const eu = US_KIDS_TO_EU[key];
      return eu ? 'EU ' + eu : s;
    }
    const eu = UK_M_TO_EU[num];
    if (eu) return 'EU ' + eu;
    return 'EU ' + (Math.round((num + 33.5) * 2) / 2);
  }

  // Bare number
  const num = parseFloat(s);
  if (!isNaN(num)) {
    // Foot Locker -> already EU
    if (system === 'FL') return 'EU ' + num;

    // SNS -> US sizes
    if (system === 'SNS') {
      if (womens) {
        const eu = US_W_TO_EU[num];
        return eu ? 'EU ' + eu : 'EU ' + (Math.round((num + 31) * 2) / 2);
      }
      if (kids) {
        const key = num + 'Y';
        const eu = US_KIDS_TO_EU[key];
        if (eu) return 'EU ' + eu;
      }
      const eu = US_M_TO_EU[num];
      return eu ? 'EU ' + eu : 'EU ' + (Math.round((num + 33) * 2) / 2);
    }

    // END bare number (rare) — assume EU if >= 35
    if (num >= 35) return 'EU ' + num;
  }

  // Unrecognized — keep as-is
  return s;
}

function normalizeSizes(sizes, storeName, productName, tags) {
  return sizes.map(s => normalizeSize(s, storeName, productName, tags));
}

// ===== CATEGORY DETECTION =====
function detectCategory(name, tags) {
  const lower = name.toLowerCase();
  const tagsLower = (tags || []).map(t => t.toLowerCase());

  const jacketWords = ['jacket', 'coat', 'parka', 'waxed'];
  const hoodieWords = ['hoodie', 'pullover fleece hoodie', 'sweatshirt'];
  const bootsWords = ['boot', '6 inch'];

  if (jacketWords.some(w => lower.includes(w))) return 'jackets';
  if (hoodieWords.some(w => lower.includes(w))) return 'hoodies';
  if (bootsWords.some(w => lower.includes(w))) return 'boots';

  if (tagsLower.includes('sneakers')) return 'sneakers';

  const sneakerIndicators = ['retro', 'sneaker', 'air jordan', 'air max', 'dunk', 'air force',
    'spizike', 'aj1', '1906r', '1906', '1000', 'gel-quantum', 'xt-6',
    'superstar', 'lafrance', 'mb.04', 'mb04', 'air tn', 'low', 'mid', 'high'];
  if (sneakerIndicators.some(w => lower.includes(w))) return 'sneakers';

  const shortsClothing = ['fleece short', 'jogger short', 'sweat short'];
  if (shortsClothing.some(w => lower.includes(w))) return 'shorts';

  const tagStr = tagsLower.join(' ');
  if (tagStr.includes('hoodie')) return 'hoodies';
  if (tagStr.includes('jacket')) return 'jackets';
  if (tagStr.includes('shorts')) return 'shorts';
  if (tagStr.includes('clothing')) return 'clothing';

  return 'sneakers';
}

// ===== INVENTORY HELPERS =====
function loadInventoryFile(slug) {
  const filePath = path.join(INVENTORY_DIR, `${slug}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return null;
}

function saveInventoryFile(slug, data) {
  fs.mkdirSync(INVENTORY_DIR, { recursive: true });
  const filePath = path.join(INVENTORY_DIR, `${slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function getAllInventoryProducts() {
  const allProducts = [];
  if (!fs.existsSync(INVENTORY_DIR)) return allProducts;
  const files = fs.readdirSync(INVENTORY_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(INVENTORY_DIR, file), 'utf-8'));
      if (data.products) {
        allProducts.push(...data.products);
      }
    } catch (e) { log(`Warning: could not read ${file}`); }
  }
  return allProducts;
}

function getNextInventoryNumber() {
  const allProducts = getAllInventoryProducts();
  let maxNum = 0;
  for (const p of allProducts) {
    const match = p.id.match(/(\d+)$/);
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxNum) maxNum = num;
    }
  }
  return maxNum + 1;
}

function addToInventory(storeName, storeFlag, product) {
  const slug = storeSlug(storeName);
  let inventoryData = loadInventoryFile(slug);

  if (!inventoryData) {
    inventoryData = {
      store: storeName,
      storeFlag: storeFlag,
      lastUpdated: new Date().toISOString().split('T')[0],
      totalProducts: 0,
      products: []
    };
    log(`Creating new inventory file: ${slug}.json`);
  }

  inventoryData.products.push(product);
  inventoryData.totalProducts = inventoryData.products.length;
  inventoryData.lastUpdated = new Date().toISOString().split('T')[0];

  saveInventoryFile(slug, inventoryData);
  log(`Saved to inventory: ${slug}.json (${inventoryData.totalProducts} products)`);
}

// ===== DUPLICATE DETECTION =====
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.href.replace(/\/+$/, '').toLowerCase();
  } catch { return url.toLowerCase().replace(/\/+$/, ''); }
}

function extractSkuFromUrl(url) {
  const m1 = url.match(/(\d{10,15})\.html/);
  if (m1) return m1[1];
  const m2 = url.match(/[\/\-](\d{10,15})(?:\?|$)/);
  if (m2) return m2[1];
  const m3 = url.match(/([a-zA-Z0-9]+-[a-zA-Z0-9]+)\.html/);
  if (m3) return m3[1].toLowerCase();
  return null;
}

function findDuplicate(url, existingPicks, inventoryProducts) {
  const normalizedNew = normalizeUrl(url);
  const skuNew = extractSkuFromUrl(url);

  for (const pick of existingPicks) {
    if (normalizeUrl(pick.url) === normalizedNew) return { source: 'picks', item: pick };
    if (skuNew && pick.url) {
      const skuExisting = extractSkuFromUrl(pick.url);
      if (skuExisting && skuExisting === skuNew) return { source: 'picks', item: pick };
    }
    if (skuNew && pick.styleCode && pick.styleCode === skuNew) return { source: 'picks', item: pick };
  }

  for (const product of inventoryProducts) {
    if (normalizeUrl(product.url) === normalizedNew) return { source: 'inventory', item: product };
    if (skuNew && product.url) {
      const skuExisting = extractSkuFromUrl(product.url);
      if (skuExisting && skuExisting === skuNew) return { source: 'inventory', item: product };
    }
    if (skuNew && product.styleCode && product.styleCode === skuNew) return { source: 'inventory', item: product };
  }

  return null;
}

// ===== STORE CONFIG =====
function loadStoreConfig(domain) {
  const configs = JSON.parse(fs.readFileSync(CONFIGS_PATH, 'utf-8'));
  const stores = configs.stores;
  if (stores[domain]) {
    let config = stores[domain];
    if (config._inherit) { config = { ...stores[config._inherit], ...config }; delete config._inherit; }
    return config;
  }
  const baseDomain = domain.split('.').slice(-2, -1)[0];
  for (const [key, config] of Object.entries(stores)) {
    if (key === '_default') continue;
    if (key.startsWith(baseDomain + '.')) {
      let resolved = config;
      if (resolved._inherit) { resolved = { ...stores[resolved._inherit], ...resolved }; delete resolved._inherit; }
      return resolved;
    }
  }
  return stores._default;
}

function matchStore(domain) {
  const storesData = JSON.parse(fs.readFileSync(STORES_PATH, 'utf-8'));
  const domainLower = domain.toLowerCase();
  for (const category of storesData.categories) {
    for (const store of category.stores) {
      const storeDomain = extractDomain(store.url);
      const storeBase = storeDomain.split('.').slice(-2, -1)[0];
      const inputBase = domainLower.split('.').slice(-2, -1)[0];
      if (storeDomain === domainLower || storeBase === inputBase) {
        return { name: store.name, country: store.country, flag: store.flag, category: category.name, categoryIcon: category.icon };
      }
    }
  }
  return { name: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1), country: 'Unknown', flag: '\ud83c\udf10', category: 'Other', categoryIcon: '\ud83d\uded2' };
}

// ===== BRAND DETECTION =====
function detectBrand(name) {
  const brandMap = [
    { keywords: ['jordan', 'air jordan'], brand: 'Jordan' },
    { keywords: ['nike', 'air max', 'air force', 'dunk', 'blazer', 'vapormax', 'air tn'], brand: 'Nike' },
    { keywords: ['adidas', 'yeezy', 'ultraboost', 'nmd', 'stan smith', 'superstar', 'samba', 'gazelle'], brand: 'adidas' },
    { keywords: ['new balance', 'nb ', '990', '991', '992', '993', '550', '2002r', '1906r', '9060', '1906'], brand: 'New Balance' },
    { keywords: ['asics', 'gel-', 'gel lyte'], brand: 'ASICS' },
    { keywords: ['puma', 'suede', 'rs-x'], brand: 'Puma' },
    { keywords: ['converse', 'chuck taylor'], brand: 'Converse' },
    { keywords: ['vans', 'old skool'], brand: 'Vans' },
    { keywords: ['reebok', 'club c'], brand: 'Reebok' },
    { keywords: ['salomon', 'xt-6', 'xt-4', 'speedcross'], brand: 'Salomon' },
    { keywords: ['on running', 'on cloud', 'cloudmonster'], brand: 'On' },
    { keywords: ['hoka', 'bondi', 'clifton'], brand: 'HOKA' },
    { keywords: ['timberland'], brand: 'Timberland' },
    { keywords: ['dr. martens', 'dr martens'], brand: 'Dr. Martens' },
    { keywords: ['north face'], brand: 'The North Face' },
    { keywords: ['carhartt'], brand: 'Carhartt WIP' },
    { keywords: ['stussy', 'st\u00fcssy'], brand: 'St\u00fcssy' },
    { keywords: ['hugo boss', 'boss '], brand: 'Hugo Boss' },
    { keywords: ['stone island'], brand: 'Stone Island' },
    { keywords: ['c.p. company', 'cp company'], brand: 'C.P. Company' },
    { keywords: ['moncler'], brand: 'Moncler' },
    { keywords: ['balenciaga'], brand: 'Balenciaga' },
    { keywords: ['gucci'], brand: 'Gucci' },
    { keywords: ['prada'], brand: 'Prada' },
    { keywords: ['off-white', 'off white'], brand: 'Off-White' },
    { keywords: ['fear of god', 'essentials'], brand: 'Fear of God' },
    { keywords: ['acne studios'], brand: 'Acne Studios' },
    { keywords: ['our legacy'], brand: 'Our Legacy' },
    { keywords: ['arc\'teryx', 'arcteryx'], brand: 'Arc\'teryx' },
  ];
  const lower = name.toLowerCase();
  if (lower.includes('jordan') && (lower.includes('air jordan') || lower.includes('jordan '))) return 'Jordan';
  for (const entry of brandMap) {
    for (const kw of entry.keywords) { if (lower.includes(kw)) return entry.brand; }
  }
  return '';
}

function detectTags(name, brand) {
  const tags = [];
  const lower = name.toLowerCase();
  const sneakerWords = ['shoe', 'sneaker', 'trainer', 'schoen', 'runner', 'air max', 'air jordan', 'dunk', '990', '991', '550', '2002r', '1906r', '1906', 'ultraboost', 'samba', 'gazelle', 'gel-', 'air tn'];
  const clothingWords = ['hoodie', 'jacket', 'shirt', 't-shirt', 'pants', 'trousers', 'shorts', 'jogger', 'sweatshirt', 'coat', 'fleece', 'sweater', 'parka'];
  if (sneakerWords.some(w => lower.includes(w))) tags.push('Sneakers');
  else if (clothingWords.some(w => lower.includes(w))) tags.push('Clothing');
  if (brand) tags.push(brand);
  tags.push('Sale');
  return [...new Set(tags)];
}

// =====================================================================
// PATCHRIGHT BROWSER — for Cloudflare/Kasada-protected stores
// =====================================================================

const PATCHRIGHT_DOMAINS = ['footlocker', 'sneakersnstuff'];

function needsPatchright(domain) {
  return PATCHRIGHT_DOMAINS.some(d => domain.includes(d));
}

function isFootLocker(domain) { return domain.includes('footlocker'); }

function getFlCurrency(domain) {
  if (domain.endsWith('.co.uk') || domain.endsWith('.uk')) return 'GBP';
  if (domain.endsWith('.com') && !domain.includes('.co')) return 'USD';
  return 'EUR';
}

function extractFlSku(url) {
  const m1 = url.match(/(\d{10,15})\.html/);
  if (m1) return m1[1];
  const m2 = url.match(/[\/\-](\d{10,15})(?:\?|$)/);
  if (m2) return m2[1];
  return null;
}

let _patchrightBrowser = null;

async function getPatchrightBrowser() {
  if (_patchrightBrowser) return _patchrightBrowser;
  const { chromium } = require('patchright');
  _patchrightBrowser = await chromium.launch({ headless: false });
  return _patchrightBrowser;
}

async function scrapeFootLocker(url) {
  const domain = extractDomain(url);
  const sku = extractFlSku(url);
  if (!sku) throw new Error(`Could not extract SKU from FL URL: ${url}`);

  log(`FL SKU: ${sku}`);
  log(`Using Patchright (Kasada bypass)...`);

  const browser = await getPatchrightBrowser();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
  catch (e) { log('Page load timeout, continuing...'); }

  await page.waitForTimeout(8000);

  try {
    const cookieBtn = await page.$('#onetrust-accept-btn-handler');
    if (cookieBtn) { await cookieBtn.click(); await page.waitForTimeout(1500); }
  } catch (e) {}

  const scraped = await page.evaluate(() => {
    const data = {
      name: '', image: '', salePrice: '', retailPrice: '',
      sizes: [], totalSizes: 0, soldOutSizes: 0,
      description: '', colorway: '', brand: '',
    };

    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const ld = JSON.parse(script.textContent);
        if (ld['@type'] !== 'Product') continue;
        if (ld.name) data.name = ld.name;
        if (ld.brand) data.brand = typeof ld.brand === 'string' ? ld.brand : (ld.brand.name || '');
        if (ld.image) data.image = ld.image;
        if (ld.offers && Array.isArray(ld.offers)) {
          data.totalSizes = ld.offers.length;
          const inStock = [];
          const soldOut = [];
          for (const offer of ld.offers) {
            const skuParts = (offer.sku || '').split('-');
            const size = skuParts[skuParts.length - 1];
            if (!size) continue;
            if (offer.availability && offer.availability.includes('InStock')) {
              inStock.push(size);
            } else {
              soldOut.push(size);
            }
          }
          data.sizes = inStock;
          data.soldOutSizes = soldOut.length;
          if (ld.offers[0] && ld.offers[0].price) {
            data.salePrice = String(ld.offers[0].price);
          }
        }
        break;
      }
    } catch (e) {}

    if (!data.name) {
      const h1 = document.querySelector('h1');
      if (h1) data.name = h1.textContent.trim();
    }

    if (!data.salePrice) {
      const saleEl = document.querySelector('.text-sale_red') ||
                     document.querySelector('[class*="ProductPrice"] [class*="sale"]');
      if (saleEl) {
        const text = saleEl.textContent.trim();
        if (/\d/.test(text)) data.salePrice = text;
      }
    }

    const priceArea = document.querySelector('.ProductDetails-form__price') ||
                      document.querySelector('[class*="ProductPrice"]');
    if (priceArea) {
      const allSpans = priceArea.querySelectorAll('span');
      for (const span of allSpans) {
        const style = window.getComputedStyle(span);
        const text = span.textContent.trim();
        if (!text || !/[\d]/.test(text)) continue;
        if (style.textDecorationLine === 'line-through' ||
            style.textDecoration.includes('line-through')) {
          data.retailPrice = text;
          break;
        }
      }
      if (!data.retailPrice) {
        const crossed = priceArea.querySelector('s, del, [class*="LineThrough"]');
        if (crossed) {
          const text = crossed.textContent.trim();
          if (/\d/.test(text)) data.retailPrice = text;
        }
      }
    }

    if (!data.retailPrice) {
      const metaPrice = document.querySelector('meta[property="product:price:amount"]');
      if (metaPrice) data.retailPrice = metaPrice.getAttribute('content') || '';
    }

    if (data.sizes.length === 0) {
      const sizeArea = document.querySelector('[class*="SizeSelector"]');
      if (sizeArea) {
        const buttons = sizeArea.querySelectorAll('button[class*="SizeSelector-button"]');
        const available = [];
        const total = [];
        buttons.forEach(btn => {
          const text = btn.textContent.trim();
          if (!text || text.length > 10) return;
          if (!/^\d{2}(\.5)?$/.test(text) && !/^(US|UK)?\s?\d{1,2}(\.5)?$/i.test(text)) return;
          total.push(text);
          const cls = (btn.className || '').toString();
          if (cls.includes('--d')) return;
          const style = window.getComputedStyle(btn);
          const color = style.color;
          if (color === 'rgb(117, 117, 117)') return;
          available.push(text);
        });
        data.sizes = available;
        data.totalSizes = total.length;
        data.soldOutSizes = total.length - available.length;
      }
    }

    if (!data.image) {
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg) data.image = ogImg.getAttribute('content') || '';
    }

    if (!data.description) {
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) data.description = (metaDesc.getAttribute('content') || '').substring(0, 200);
    }

    const colorSels = ['[class*="color-name"]', '[class*="ColorName"]', '[class*="colorway"]', '[class*="Colorway"]'];
    for (const sel of colorSels) {
      const el = document.querySelector(sel);
      if (el) { data.colorway = el.textContent.trim(); break; }
    }

    return data;
  });

  await page.close();

  let image = scraped.image || '';
  if (image && !image.includes('wid=')) {
    image = image.split('?')[0] + '?wid=763&hei=538&fmt=png-alpha';
  }
  if (!image) {
    image = `https://images.footlocker.com/is/image/FLEU/${sku}?wid=763&hei=538&fmt=png-alpha`;
  }

  log(`FL result: name="${scraped.name}", sale="${scraped.salePrice}", retail="${scraped.retailPrice}"`);
  log(`FL sizes: ${scraped.sizes.length} available, ${scraped._soldOut || 0} sold out, ${scraped._totalSizes || 0} total`);
  log(`FL image: ${image}`);

  return {
    name: scraped.name || '', image,
    salePrice: scraped.salePrice || '', retailPrice: scraped.retailPrice || '',
    sizes: scraped.sizes || [],
    allSizeData: [],
    description: scraped.description || '', colorway: scraped.colorway || '',
    styleCode: sku, brand: scraped.brand || '',
    _totalSizes: scraped.totalSizes, _soldOut: scraped.soldOutSizes,
  };
}

// ===== GENERIC SCRAPER =====
let _browser = null;

async function getBrowser() {
  if (_browser) return _browser;
  const { chromium } = require('playwright');
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

async function scrapeGeneric(url, config, usePatchright) {
  let browser;
  if (usePatchright) {
    log('\u2192 Using Patchright (Cloudflare bypass)');
    browser = await getPatchrightBrowser();
  } else {
    browser = await getBrowser();
  }
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  if (!usePatchright) {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8' });
  }

  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
  catch (e) { log(`Page load timeout for ${url}, continuing...`); }

  const waitTime = usePatchright ? Math.max(config.waitTime || 5000, 7000) : (config.waitTime || 4000);
  await page.waitForTimeout(waitTime);

  try {
    const cookieSelectors = [
      '#onetrust-accept-btn-handler', 'button[id*="accept"]', 'button[id*="cookie"]',
      'button[class*="accept"]', 'button[class*="consent"]', '[data-testid*="accept"]',
    ];
    for (const sel of cookieSelectors) {
      const btn = await page.$(sel);
      if (btn) { await btn.click(); await page.waitForTimeout(1000); break; }
    }
  } catch (e) {}

  const data = await page.evaluate((config) => {
    const result = { name: '', image: '', salePrice: '', retailPrice: '', sizes: [], description: '', colorway: '', styleCode: '', brand: '' };

    function trySelectors(selectors) {
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (!el) continue;
          if (el.tagName === 'META') { const c = el.getAttribute('content'); if (c && c.trim()) return c.trim(); continue; }
          const text = el.textContent.trim();
          if (text) return text;
        } catch (e) {}
      }
      return '';
    }

    result.name = trySelectors(config.nameSelectors);

    const ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg) { const c = ogImg.getAttribute('content'); if (c && c.startsWith('http')) result.image = c; }
    if (!result.image) {
      for (const sel of config.imageSelectors) {
        try {
          const el = document.querySelector(sel);
          if (!el) continue;
          if (el.tagName === 'META') { const c = el.getAttribute('content'); if (c && c.startsWith('http')) { result.image = c; break; } }
          else { const src = el.src || el.getAttribute('data-src'); if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('svg')) { result.image = src; break; } }
        } catch (e) {}
      }
    }

    result.salePrice = trySelectors(config.priceSelectors);
    result.retailPrice = trySelectors(config.retailPriceSelectors);

    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        let d;
        try { d = JSON.parse(script.textContent); } catch(e) { continue; }

        if (d['@type'] === 'ProductGroup' && d.hasVariant) {
          if (!result.name || result.name === document.location.hostname) {
            const vName = d.hasVariant[0] && d.hasVariant[0].name ? d.hasVariant[0].name : '';
            result.name = vName.replace(/\s*-\s*(XXS|XS|S|M|L|XL|XXL|2XL|3XL|XXXL|\d{1,2}(\.5)?)\s*$/i, '').trim();
          }
          if (!result.name && d.name) result.name = d.name;
          if (d.brand && d.brand.name) result.brand = d.brand.name;
          if (!result.image && d.hasVariant[0] && d.hasVariant[0].image) result.image = d.hasVariant[0].image;

          const variants = d.hasVariant;
          const inStock = variants.filter(v =>
            v.offers && v.offers.availability && v.offers.availability.includes('InStock')
          );
          const allV = variants.filter(v => v.offers);

          const getSize = (v) => {
            if (v.sku) {
              const parts = v.sku.split('-');
              if (parts.length > 1) return parts[parts.length - 1];
            }
            if (v.name) {
              const m = v.name.match(/\s-\s(.+)$/);
              if (m) return m[1].trim();
            }
            return '';
          };

          if (result.sizes.length === 0) {
            result.sizes = inStock.map(getSize).filter(s => s);
          }

          const pv = inStock[0] || allV[0];
          if (pv && pv.offers) {
            if (!result.salePrice && pv.offers.price) {
              result.salePrice = String(pv.offers.price);
            }
          }
          if (!result.retailPrice) {
            const origEl = document.querySelector('.product-view__price .price__original') ||
                           document.querySelector('.price__original') ||
                           document.querySelector('[class*="price"] s');
            if (origEl) {
              const t = origEl.textContent.trim().replace(/[^\d.,]/g, '').replace(',', '.');
              if (t) result.retailPrice = t;
            }
          }
          continue;
        }

        if (d['@type'] === 'Product') {
          if (!result.name && d.name) result.name = d.name;
          if (d.brand) result.brand = typeof d.brand === 'string' ? d.brand : (d.brand.name || '');
          const offers = d.offers;
          if (offers) {
            const offer = Array.isArray(offers) ? offers[0] : offers;
            if (!result.salePrice && offer.price) result.salePrice = String(offer.price);
            if (!result.retailPrice && offer.highPrice) result.retailPrice = String(offer.highPrice);
          }
        }

        if (d['@graph']) {
          for (const node of d['@graph']) {
            if (node['@type'] === 'Product' || node['@type'] === 'ProductGroup') {
              if (node.offers) {
                const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                if (!result.salePrice && offer.price) result.salePrice = String(offer.price);
                if (!result.retailPrice && offer.highPrice) result.retailPrice = String(offer.highPrice);
              }
            }
          }
        }
      }
    } catch (e) {}

    const unavailablePatterns = /crossed|disabled|unavailable|sold.?out|oos|inactive|out.?of.?stock/i;
    const productArea = document.querySelector('main') || document.querySelector('[class*="pdp"]') || document;

    for (const sel of config.sizeSelectors) {
      try {
        const els = productArea.querySelectorAll(sel);
        if (els.length === 0) continue;
        const values = [];
        els.forEach(el => {
          const text = el.textContent.trim();
          if (!text || text.length > 12) return;
          const isSize = /^\d{2}(\.5)?$/.test(text) || /^(US|UK)?\s?\d{1,2}(\.5)?$/i.test(text) || /^(XXS|XS|S|M|L|XL|XXL|2XL|3XL)$/i.test(text);
          if (!isSize) return;
          if (el.getAttribute('aria-disabled') === 'true') return;
          if (el.disabled) return;
          const classes = (el.className || '').toString();
          if (unavailablePatterns.test(classes)) return;
          values.push(text);
        });
        if (values.length > 0) { result.sizes = values; break; }
      } catch (e) {}
    }

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) result.description = metaDesc.getAttribute('content') || '';

    return result;
  }, config);

  await page.close();
  return data;
}

// ===== ROUTER =====
async function scrapePage(url, config) {
  const domain = extractDomain(url);
  if (isFootLocker(domain)) {
    log('\u2192 Foot Locker (Patchright + Kasada bypass)');
    return await scrapeFootLocker(url);
  }
  if (needsPatchright(domain)) {
    log('\u2192 Patchright (Cloudflare bypass)');
    return await scrapeGeneric(url, config, true);
  }
  log('\u2192 Generic Playwright scraping');
  return await scrapeGeneric(url, config, false);
}

// ===== READ QUEUE =====
function readQueue() {
  if (!fs.existsSync(QUEUE_PATH)) {
    console.log('  \u274c No queue file found.');
    return [];
  }
  const content = fs.readFileSync(QUEUE_PATH, 'utf-8');
  return content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.startsWith('http'));
}

function loadPicks() {
  return JSON.parse(fs.readFileSync(PICKS_PATH, 'utf-8'));
}

function savePicks(picksData) {
  fs.writeFileSync(PICKS_PATH, JSON.stringify(picksData, null, 2) + '\n');
}

function removeFromInventoryByPicksId(picksId) {
  if (!fs.existsSync(INVENTORY_DIR)) return 0;
  let removed = 0;
  const files = fs.readdirSync(INVENTORY_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const filePath = path.join(INVENTORY_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (!Array.isArray(data.products)) continue;
      const before = data.products.length;
      data.products = data.products.filter(p => p.picksId !== picksId);
      const after = data.products.length;
      if (after !== before) {
        removed += (before - after);
        data.totalProducts = after;
        data.lastUpdated = new Date().toISOString().split('T')[0];
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
      }
    } catch (e) {
      log(`Warning: could not edit inventory file ${file}`);
    }
  }
  return removed;
}

function requeueDeniedPicks(picksData) {
  const denied = picksData.picks.filter(p => p.name === 'Access Denied');
  const ids = denied.map(p => p.id);
  if (denied.length === 0) {
    console.log('  \n  \u2139\ufe0f  No "Access Denied" picks found.');
    return { added: 0, removedPicks: 0, removedInventory: 0 };
  }

  // Write queue from denied URLs
  const urls = denied.map(p => p.url).filter(Boolean);
  fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
  fs.writeFileSync(QUEUE_PATH, urls.join('\n') + '\n');

  // Remove from picks
  picksData.picks = picksData.picks.filter(p => p.name !== 'Access Denied');

  // Remove from inventory via picksId
  let removedInventory = 0;
  for (const id of ids) {
    removedInventory += removeFromInventoryByPicksId(id);
  }

  savePicks(picksData);

  console.log(`\n  \ud83d\udd01 Re-queued ${urls.length} denied URL${urls.length > 1 ? 's' : ''} into data/queue.txt`);
  console.log(`  \ud83e\uddf9 Removed ${ids.length} picks entries (Access Denied)`);
  console.log(`  \ud83e\uddf9 Removed ${removedInventory} inventory products (matched by picksId)`);

  return { added: urls.length, removedPicks: ids.length, removedInventory };
}

// ===== MAIN =====
async function main() {
  console.log(`\n\ud83d\udd25 FASHION. \u2014 Process Queue`);
  console.log('='.repeat(50));
  if (DRY_RUN) console.log('  \ud83e\uddea DRY RUN');

  initCloudinary();
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.mkdirSync(INVENTORY_DIR, { recursive: true });

  let picksData = loadPicks();
  if (REQUEUE_DENIED) {
    requeueDeniedPicks(picksData);
    picksData = loadPicks();
  }

  const urls = readQueue();
  if (urls.length === 0) {
    console.log('\n  \ud83d\udcea Queue is empty! Paste URLs into data/queue.txt\n');
    return;
  }

  console.log(`\n  \ud83d\udce6 ${urls.length} product${urls.length > 1 ? 's' : ''} in queue\n`);

  const inventoryProducts = getAllInventoryProducts();
  log(`Loaded ${picksData.picks.length} picks + ${inventoryProducts.length} inventory products for dupe check`);

  const results = { success: 0, failed: 0, skipped: 0, items: [] };
  const processedUrls = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const domain = extractDomain(url);
    const storeInfo = matchStore(domain);
    const config = loadStoreConfig(domain);
    const currency = isFootLocker(domain) ? getFlCurrency(domain) : detectCurrency(domain);

    console.log(`\n  [${i + 1}/${urls.length}] ${storeInfo.flag} ${storeInfo.name}`);
    console.log(`  ${url}`);

    const existing = findDuplicate(url, picksData.picks, inventoryProducts);
    if (existing) {
      const dupId = existing.item.id;
      const dupName = existing.item.name;
      console.log(`  \u23ed\ufe0f  SKIPPED \u2014 already exists in ${existing.source} as ${dupId}: ${dupName}`);
      results.skipped++;
      results.items.push({ url, name: dupName, status: 'duplicate', id: dupId });
      processedUrls.push(url);
      continue;
    }

    try {
      const scraped = await scrapePage(url, config);

      const name = scraped.name || 'Unknown Product';
      const brand = scraped.brand || detectBrand(name);
      const salePrice = parsePrice(scraped.salePrice);
      const retailPrice = parsePrice(scraped.retailPrice);
      const discount = (salePrice && retailPrice && retailPrice > salePrice)
        ? `-${Math.round((1 - salePrice / retailPrice) * 100)}%` : '0%';

      const nextPicksId = Math.max(...picksData.picks.map(p => p.id), 0) + 1;
      const nextInvNum = getNextInventoryNumber();
      const filename = `${nextPicksId}-${slugify(name)}`;
      const invSlug = storeSlug(storeInfo.name);
      const invId = `${invSlug}-${String(nextInvNum).padStart(3, '0')}`;

      let imageUrl = scraped.image || '';
      if (imageUrl && CLOUD_ENABLED) {
        const cdnUrl = await uploadToCloudinary(imageUrl, `picks/${filename}`);
        if (cdnUrl) imageUrl = cdnUrl;
      }

      const validSizes = (scraped.sizes || []).filter(s => isValidSize(s));
      const tags = detectTags(name, brand);
      const category = detectCategory(name, tags);
      const today = new Date().toISOString().split('T')[0];

      // ===== NORMALIZE SIZES TO EU =====
      const normalizedSizes = normalizeSizes(validSizes, storeInfo.name, name, tags);

      const newPick = {
        id: nextPicksId, name, brand,
        styleCode: scraped.styleCode || '', colorway: scraped.colorway || '',
        retailPrice: retailPrice ? formatPrice(retailPrice, currency) : '',
        salePrice: salePrice ? formatPrice(salePrice, currency) : '',
        discount, store: storeInfo.name, storeFlag: storeInfo.flag,
        image: imageUrl, url,
        description: (scraped.description || '').substring(0, 200),
        tags,
        sizes: normalizedSizes,
      };

      const newInventoryProduct = {
        id: invId,
        picksId: nextPicksId,
        name, brand, category,
        styleCode: scraped.styleCode || '',
        colorway: scraped.colorway || '',
        retailPrice: retailPrice ? formatPrice(retailPrice, currency) : '',
        salePrice: salePrice ? formatPrice(salePrice, currency) : '',
        discount,
        image: imageUrl, url,
        description: (scraped.description || '').substring(0, 200),
        tags,
        sizes: normalizedSizes,
        addedDate: today,
        lastChecked: today,
        status: 'active'
      };

      if (!DRY_RUN) {
        picksData.picks.push(newPick);
        addToInventory(storeInfo.name, storeInfo.flag, newInventoryProduct);
        inventoryProducts.push(newInventoryProduct);
      }

      const priceStr = newPick.salePrice
        ? `${newPick.retailPrice || '?'} \u2192 ${newPick.salePrice} (${newPick.discount})`
        : '\u26a0\ufe0f  price not found';

      console.log(`  \u2705 ${name}`);
      console.log(`     ${brand} | ${priceStr}`);
      console.log(`     Category: ${category} | Sizes: ${normalizedSizes.length > 0 ? normalizedSizes.join(', ') : 'none found'}`);
      if (scraped._totalSizes) {
        console.log(`     Stock: ${normalizedSizes.length} available, ${scraped._soldOut || 0} sold out of ${scraped._totalSizes} total`);
      }
      console.log(`     Image: ${newPick.image ? '\u2705' : '\u274c'}`);
      console.log(`     Color: ${newPick.colorway || '-'}`);
      console.log(`     \u2192 picks.json #${nextPicksId} + inventory ${invId}`);

      results.success++;
      results.items.push({ url, name, status: 'success', picksId: nextPicksId, invId });
      processedUrls.push(url);

    } catch (e) {
      console.log(`  \u274c Failed: ${e.message}`);
      if (VERBOSE) console.error(e);
      results.failed++;
      results.items.push({ url, name: '', status: 'failed', error: e.message });
      processedUrls.push(url);
    }
  }

  if (_browser) { await _browser.close(); _browser = null; }
  if (_patchrightBrowser) { await _patchrightBrowser.close(); _patchrightBrowser = null; }

  const missingImages = picksData.picks.filter(p => !p.image);
  if (missingImages.length > 0 && !DRY_RUN) {
    console.log(`\n  \ud83d\udcf8 ${missingImages.length} picks need images, running fetch-images.js...`);
    try { execSync('node scripts/fetch-images.js', { cwd: path.join(__dirname, '..'), stdio: 'inherit' }); }
    catch (e) { console.log('  \u26a0\ufe0f  Image fetcher had issues'); }
  }

  if (!DRY_RUN) {
    savePicks(picksData);
    console.log('\n  \ud83d\udcbe Saved picks.json');
  }

  if (!DRY_RUN && results.success > 0) {
    console.log('  \ud83d\udcca Rebuilding catalog index...');
    try {
      execSync('node scripts/build-index.js', { cwd: path.join(__dirname, '..'), stdio: VERBOSE ? 'inherit' : 'pipe' });
      console.log('  \ud83d\udcbe Saved catalog-index.json');
    } catch (e) {
      console.log('  \u26a0\ufe0f  Index rebuild had issues (run manually: node scripts/build-index.js)');
    }
  }

  if (!DRY_RUN && processedUrls.length > 0) {
    const timestamp = new Date().toISOString().split('T')[0];
    fs.appendFileSync(DONE_PATH, `\n# Processed ${timestamp}\n${processedUrls.join('\n')}\n`);
    const header = fs.readFileSync(QUEUE_PATH, 'utf-8').split('\n').filter(l => l.startsWith('#') || l.trim() === '').join('\n');
    fs.writeFileSync(QUEUE_PATH, header + '\n');
    console.log('  \ud83d\udcea Queue cleared');
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  \u2705 Added: ${results.success}  |  \u23ed\ufe0f Skipped: ${results.skipped}  |  \u274c Failed: ${results.failed}`);
  console.log('='.repeat(50));
  for (const item of results.items) {
    const icon = item.status === 'success' ? '\u2705' : item.status === 'duplicate' ? '\u23ed\ufe0f' : '\u274c';
    const idStr = item.picksId ? `picks:#${item.picksId} inv:${item.invId}` : (item.id || '?');
    console.log(`  ${icon} ${idStr} ${item.name || item.url}`);
  }
  console.log('\n\u2728 Done!\n');
}

main().catch(e => {
  console.error('\n\u274c Fatal error:', e.message);
  if (VERBOSE) console.error(e);
  if (_browser) _browser.close();
  if (_patchrightBrowser) _patchrightBrowser.close();
  process.exit(1);
});
