#!/usr/bin/env node
/**
 * FASHION. — Process Queue
 * =========================
 * One command to rule them all.
 *
 * Usage:
 *   node scripts/process-queue.js
 *   node scripts/process-queue.js --verbose
 *   node scripts/process-queue.js --dry-run
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

// ===== CLI =====
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const DRY_RUN = args.includes('--dry-run') || args.includes('--dry');

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
  if (!text || text.length > 12) return false;
  const t = text.trim();
  if (/^\d{2}(\.5)?$/.test(t)) {
    const n = parseFloat(t);
    if (n >= 35 && n <= 52) return true;
  }
  if (/^(US|UK)?\s?\d{1,2}(\.5)?$/i.test(t)) return true;
  if (/^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|XXXL)$/i.test(t)) return true;
  if (/^\d{2}$/.test(t)) {
    const n = parseInt(t);
    if (n >= 24 && n <= 52) return true;
  }
  return false;
}

// ===== HTTP FETCH =====
function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { ...headers, 'Connection': 'keep-alive' },
      timeout: 15000,
    };
    const req = lib.request(options, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
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
// FOOT LOCKER — API-first scraping (3 layers)
// =====================================================================

const FL_REGIONS = {
  'footlocker.nl':    { base: 'https://www.footlocker.nl',    intershop: 'INTERSHOP/web/FLE/Footlocker-Footlocker_NL-Site/en_GB/-/EUR',  currency: 'EUR', locale: 'nl-NL' },
  'footlocker.de':    { base: 'https://www.footlocker.de',    intershop: 'INTERSHOP/web/FLE/Footlocker-Footlocker_DE-Site/en_GB/-/EUR',  currency: 'EUR', locale: 'de-DE' },
  'footlocker.fr':    { base: 'https://www.footlocker.fr',    intershop: 'INTERSHOP/web/FLE/Footlocker-Footlocker_FR-Site/en_GB/-/EUR',  currency: 'EUR', locale: 'fr-FR' },
  'footlocker.es':    { base: 'https://www.footlocker.es',    intershop: 'INTERSHOP/web/FLE/Footlocker-Footlocker_ES-Site/en_GB/-/EUR',  currency: 'EUR', locale: 'es-ES' },
  'footlocker.it':    { base: 'https://www.footlocker.it',    intershop: 'INTERSHOP/web/FLE/Footlocker-Footlocker_IT-Site/en_GB/-/EUR',  currency: 'EUR', locale: 'it-IT' },
  'footlocker.co.uk': { base: 'https://www.footlocker.co.uk', intershop: 'INTERSHOP/web/FLE/Footlocker-Footlocker_GB-Site/en_GB/-/GBP',  currency: 'GBP', locale: 'en-GB' },
  'footlocker.com':   { base: 'https://www.footlocker.com',   intershop: 'INTERSHOP/web/FLE/Footlocker-Footlocker_US-Site/en_US/-/USD',  currency: 'USD', locale: 'en-US' },
  'footlocker.eu':    { base: 'https://www.footlocker.eu',    intershop: 'INTERSHOP/web/FLE/Footlocker-Footlocker_EU-Site/en_GB/-/EUR',  currency: 'EUR', locale: 'en-GB' },
};

function isFootLocker(domain) { return domain.includes('footlocker'); }

function getFlRegion(domain) {
  if (FL_REGIONS[domain]) return FL_REGIONS[domain];
  for (const [key, val] of Object.entries(FL_REGIONS)) {
    if (domain.includes(key.split('.')[0]) && domain.endsWith(key.split('.').slice(1).join('.'))) return val;
  }
  return FL_REGIONS['footlocker.nl'];
}

function extractFlSku(url) {
  const m1 = url.match(/(\d{10,15})\.html/);
  if (m1) return m1[1];
  const m2 = url.match(/[\/-](\d{10,15})(?:\?|$)/);
  if (m2) return m2[1];
  const m3 = url.match(/[?&]v=(\d{10,15})/);
  if (m3) return m3[1];
  return null;
}

const FL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8',
  'X-Requested-With': 'XMLHttpRequest',
};

async function scrapeFootLocker(url) {
  const domain = extractDomain(url);
  const region = getFlRegion(domain);
  const sku = extractFlSku(url);

  if (!sku) throw new Error(`Could not extract SKU from FL URL: ${url}`);

  log(`FL SKU: ${sku}`);
  log(`FL Region: ${region.base}`);

  const result = {
    name: '', image: '', salePrice: '', retailPrice: '',
    sizes: [], allSizeData: [],
    description: '', colorway: '', styleCode: sku,
  };

  // ===== IMAGE: Known CDN pattern (always works) =====
  result.image = `https://images.footlocker.com/is/image/FLEU/${sku}_01?wid=763&hei=538&fmt=png-alpha`;
  log(`FL Image (CDN): ${result.image}`);

  // ===== LAYER 1: v3 REST API =====
  log('Trying FL v3 REST API...');
  try {
    // First get a session + CSRF token
    const sessionResp = await fetchUrl(`${region.base}/api/v3/session`, {
      ...FL_HEADERS, 'Referer': url,
    });
    log(`FL v3 session: status ${sessionResp.status}`);

    let csrfToken = '';
    if (sessionResp.status === 200) {
      try {
        const sessionData = JSON.parse(sessionResp.body);
        csrfToken = sessionData.data?.csrfToken || '';
        log(`FL v3 CSRF: ${csrfToken ? 'got it' : 'not found'}`);
      } catch (e) {}
    }

    // Fetch product data from v3 API
    const productResp = await fetchUrl(`${region.base}/api/products/pdp/${sku}`, {
      ...FL_HEADERS,
      'Referer': url,
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    });
    log(`FL v3 product API: status ${productResp.status}`);

    if (productResp.status === 200) {
      try {
        const product = JSON.parse(productResp.body);

        // Name
        if (product.name) result.name = product.name;
        if (product.model) result.name = `${product.model} ${product.name || ''}`;

        // Prices
        if (product.price) {
          if (product.price.formattedOriginalPrice) result.retailPrice = product.price.formattedOriginalPrice;
          else if (product.price.originalPrice) result.retailPrice = String(product.price.originalPrice);

          if (product.price.formattedValue) result.salePrice = product.price.formattedValue;
          else if (product.price.value) result.salePrice = String(product.price.value);
        }

        // Sizes from sellableUnits
        if (product.sellableUnits && Array.isArray(product.sellableUnits)) {
          for (const unit of product.sellableUnits) {
            const sizeLabel = unit.attributes?.find(a => a.type === 'size')?.value || '';
            const stockStatus = (unit.stockLevelStatus || '').toLowerCase();
            const available = stockStatus === 'instock' || stockStatus === 'lowstock';
            result.allSizeData.push({ size: sizeLabel, sku: unit.code || '', stock: stockStatus, available });
            if (available && sizeLabel) result.sizes.push(sizeLabel);
          }
          log(`FL v3 API: ${result.sizes.length} in-stock / ${result.allSizeData.length} total sizes`);
        }

        // Variants for sizes
        if (result.sizes.length === 0 && product.variantAttributes) {
          for (const variant of product.variantAttributes) {
            if (variant.sku) {
              const sizeAttr = variant.attributes?.find(a => a.type === 'size');
              if (sizeAttr) {
                const available = variant.stockLevelStatus !== 'outOfStock';
                result.allSizeData.push({ size: sizeAttr.value, sku: variant.sku, stock: variant.stockLevelStatus, available });
                if (available) result.sizes.push(sizeAttr.value);
              }
            }
          }
          log(`FL v3 variants: ${result.sizes.length} in-stock sizes`);
        }

        // Color
        if (product.color) result.colorway = product.color;

        // Description
        if (product.description) result.description = product.description.replace(/<[^>]+>/g, '').substring(0, 200);

        log(`FL v3 result: name="${result.name}", sale="${result.salePrice}", retail="${result.retailPrice}", sizes=${result.sizes.length}`);
      } catch (e) {
        log(`FL v3 product parse error: ${e.message}`);
      }
    }
  } catch (e) {
    log(`FL v3 API failed: ${e.message}`);
  }

  // ===== LAYER 2: INTERSHOP API (classic endpoint) =====
  if (result.sizes.length === 0) {
    log('Trying FL INTERSHOP API...');
    try {
      const apiUrl = `${region.base}/${region.intershop}/ViewProduct-ProductVariationSelect?BaseSKU=${sku}&InventoryServerity=ProductDetail`;
      const apiResp = await fetchUrl(apiUrl, { ...FL_HEADERS, 'Referer': url });
      log(`FL INTERSHOP API: status ${apiResp.status}`);

      if (apiResp.status === 200) {
        let content = apiResp.body;

        // Try parsing as JSON first (API returns {content: "<html>..."})
        try {
          const jsonResp = JSON.parse(content);
          if (jsonResp.content) content = jsonResp.content;
        } catch (e) {
          // Already HTML, that's fine
        }

        // Extract variation JSON
        const varPatterns = [
          /data-product-variation-info-json='({[^']+})'/,
          /data-product-variation-info-json="({[^"]+})"/,
          /data-product-variation-info-json=(?:&quot;|")?({.*?})(?:&quot;|")/,
        ];

        for (const pattern of varPatterns) {
          const match = content.match(pattern);
          if (match) {
            try {
              const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
              const variations = JSON.parse(decoded);

              for (const [varSku, info] of Object.entries(variations)) {
                const available = info.inventoryLevel !== 'RED';
                result.allSizeData.push({
                  size: info.sizeValue || '', sku: varSku,
                  stock: info.inventoryLevel || 'RED', available,
                });
                if (available && info.sizeValue) {
                  result.sizes.push(info.sizeValue);
                }
              }
              log(`FL INTERSHOP: ${result.sizes.length} in-stock / ${result.allSizeData.length} total`);
              break;
            } catch (e) {
              log(`FL INTERSHOP parse error: ${e.message}`);
            }
          }
        }
      }
    } catch (e) {
      log(`FL INTERSHOP API failed: ${e.message}`);
    }
  }

  // ===== LAYER 3: Playwright DOM (last resort) =====
  // Also used to get name/prices if APIs didn't return them
  const needsPlaywright = !result.name || !result.salePrice || result.sizes.length === 0;

  if (needsPlaywright) {
    log('Using Playwright for remaining data...');
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8' });

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) { log(`Page load timeout, continuing...`); }

    await page.waitForTimeout(5000);

    // Dismiss cookies
    try {
      const cookieBtn = await page.$('#onetrust-accept-btn-handler');
      if (cookieBtn) { await cookieBtn.click(); await page.waitForTimeout(1000); }
    } catch (e) {}

    const pageData = await page.evaluate(() => {
      const data = { name: '', salePrice: '', retailPrice: '', colorway: '', description: '', sizes: [] };

      // NAME
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) data.name = (ogTitle.getAttribute('content') || '').trim();
      if (!data.name) {
        const h1 = document.querySelector('h1');
        if (h1) data.name = h1.textContent.trim();
      }

      // PRICES from JSON-LD
      try {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
          const d = JSON.parse(script.textContent);
          const product = d['@type'] === 'Product' ? d : (d['@graph'] || []).find(g => g['@type'] === 'Product');
          if (product && product.offers) {
            const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
            for (const offer of offers) {
              if (offer.price && !data.salePrice) data.salePrice = String(offer.price);
              if (offer.highPrice && !data.retailPrice) data.retailPrice = String(offer.highPrice);
            }
          }
        }
      } catch (e) {}

      // PRICES from meta tags
      if (!data.salePrice) {
        const metaSale = document.querySelector('meta[property="product:sale_price:amount"]');
        if (metaSale) data.salePrice = metaSale.getAttribute('content') || '';
      }
      if (!data.retailPrice) {
        const metaPrice = document.querySelector('meta[property="product:price:amount"]');
        if (metaPrice) data.retailPrice = metaPrice.getAttribute('content') || '';
      }

      // PRICES from DOM — look for crossed-out (original) and current (sale)
      if (!data.retailPrice) {
        // The original price is typically in a <s>, <del>, or element with class containing 'crossed', 'original', 'was'
        const crossedSelectors = [
          '[class*="ProductPrice"] s', '[class*="ProductPrice"] del',
          '[class*="ProductPrice"] [class*="crossed"]', '[class*="ProductPrice"] [class*="original"]',
          '[class*="price"] s', '[class*="price"] del',
          '[class*="price"] [class*="crossed"]', '[class*="price"] [class*="was"]',
          'span[class*="LineThrough"]', '[style*="line-through"]',
        ];
        for (const sel of crossedSelectors) {
          try {
            const el = document.querySelector(sel);
            if (el) {
              const text = el.textContent.trim();
              if (text && /\d/.test(text)) { data.retailPrice = text; break; }
            }
          } catch (e) {}
        }
      }
      if (!data.salePrice) {
        const saleSelectors = [
          '[data-testid="ProductPrice-sale"]',
          '[class*="ProductPrice"] [class*="sale"]', '[class*="ProductPrice--sale"]',
          '[class*="price"] [class*="reduced"]', '[class*="price"] [class*="current"]',
          '[class*="FinalPrice"]',
        ];
        for (const sel of saleSelectors) {
          try {
            const el = document.querySelector(sel);
            if (el) {
              const text = el.textContent.trim();
              if (text && /\d/.test(text)) { data.salePrice = text; break; }
            }
          } catch (e) {}
        }
      }

      // SIZES from DOM — with crossed-out / unavailable detection
      // Foot Locker marks unavailable sizes with:
      //   - aria-disabled="true"
      //   - data-out-of-stock / data-sold-out attributes
      //   - class containing: crossed, disabled, unavailable, sold-out, oos, inactive
      //   - parent <s> or <del> elements
      //   - opacity < 0.5 or text-decoration: line-through
      const unavailablePatterns = /crossed|disabled|unavailable|sold.?out|oos|inactive|out.?of.?stock/i;

      function isSizeAvailable(el) {
        // Check aria-disabled
        if (el.getAttribute('aria-disabled') === 'true') return false;
        // Check disabled attribute
        if (el.disabled) return false;
        // Check data attributes
        if (el.getAttribute('data-out-of-stock') === 'true') return false;
        if (el.getAttribute('data-sold-out') === 'true') return false;
        if (el.getAttribute('data-available') === 'false') return false;
        // Check class names
        const classes = (el.className || '').toString();
        if (unavailablePatterns.test(classes)) return false;
        // Check parent class names (2 levels up)
        let parent = el.parentElement;
        for (let i = 0; i < 2 && parent; i++) {
          const parentClasses = (parent.className || '').toString();
          if (unavailablePatterns.test(parentClasses)) return false;
          if (parent.tagName === 'S' || parent.tagName === 'DEL') return false;
          parent = parent.parentElement;
        }
        // Check computed style
        try {
          const style = window.getComputedStyle(el);
          if (style.textDecoration && style.textDecoration.includes('line-through')) return false;
          if (parseFloat(style.opacity) < 0.4) return false;
        } catch (e) {}
        return true;
      }

      // Only search within the product detail area
      const productArea = document.querySelector('main') ||
                          document.querySelector('[class*="pdp"]') ||
                          document.querySelector('#product-detail') ||
                          document.querySelector('article') ||
                          document;

      const sizeSelectors = [
        '[data-testid="SizeSelector"] button',
        '[class*="SizeSelector"] button',
        '[class*="SizeButton"]',
        '[class*="size-selector"] button',
        '[class*="size-list"] button',
        '[class*="size-list"] a',
        '[class*="size-list"] li',
        '[data-testid*="size"] button',
      ];

      for (const sel of sizeSelectors) {
        try {
          const els = productArea.querySelectorAll(sel);
          if (els.length === 0) continue;
          const available = [];
          const all = [];
          els.forEach(el => {
            const text = el.textContent.trim();
            if (!text || text.length > 10) return;
            // Must look like a shoe/clothing size
            if (!/^\d{2}(\.5)?$/.test(text) && !/^(US|UK)?\s?\d{1,2}(\.5)?$/i.test(text) &&
                !/^(XXS|XS|S|M|L|XL|XXL|2XL|3XL)$/i.test(text)) return;
            all.push(text);
            if (isSizeAvailable(el)) {
              available.push(text);
            }
          });
          if (all.length > 0) {
            data.sizes = available;
            data._totalSizes = all.length;
            data._availableSizes = available.length;
            break;
          }
        } catch (e) {}
      }

      // COLOR
      const colorSels = ['[class*="color-name"]', '[class*="ColorName"]', '[class*="colorway"]', '[class*="Colorway"]'];
      for (const sel of colorSels) {
        try {
          const el = document.querySelector(sel);
          if (el) { data.colorway = el.textContent.trim(); break; }
        } catch (e) {}
      }

      // DESCRIPTION
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) data.description = metaDesc.getAttribute('content') || '';

      return data;
    });

    await page.close();

    // Merge: API data takes priority, Playwright fills gaps
    if (!result.name) result.name = pageData.name;
    if (!result.salePrice) result.salePrice = pageData.salePrice;
    if (!result.retailPrice) result.retailPrice = pageData.retailPrice;
    if (!result.colorway) result.colorway = pageData.colorway;
    if (!result.description) result.description = pageData.description;

    // Only use DOM sizes if API gave us nothing
    if (result.sizes.length === 0 && pageData.sizes.length > 0) {
      result.sizes = pageData.sizes;
      log(`Playwright DOM: ${pageData._availableSizes} available / ${pageData._totalSizes} total sizes`);
    }
  }

  log(`FINAL: name="${result.name}", sale="${result.salePrice}", retail="${result.retailPrice}", sizes=${result.sizes.length}, image=${result.image ? 'YES' : 'NO'}`);
  return result;
}

// ===== GENERIC SCRAPER (non-FL stores) =====
let _browser = null;

async function getBrowser() {
  if (_browser) return _browser;
  const { chromium } = require('playwright');
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

async function scrapeGeneric(url, config) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8' });

  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
  catch (e) { log(`Page load timeout for ${url}, continuing...`); }

  await page.waitForTimeout(config.waitTime || 4000);

  // Cookie popup
  try {
    const cookieSelectors = [
      '#onetrust-accept-btn-handler', 'button[id*="accept"]', 'button[id*="cookie"]',
      'button[class*="accept"]', 'button[class*="consent"]', '[data-testid*="accept"]',
      'button:has-text("Accept All")', 'button:has-text("Accept")',
      'button:has-text("Accepteren")', 'button:has-text("Alle akkoord")',
    ];
    for (const sel of cookieSelectors) {
      const btn = await page.$(sel);
      if (btn) { await btn.click(); await page.waitForTimeout(1000); break; }
    }
  } catch (e) {}

  const data = await page.evaluate((config) => {
    const result = { name: '', image: '', salePrice: '', retailPrice: '', sizes: [], description: '', colorway: '', styleCode: '' };

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

    // Image
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

    // Prices
    result.salePrice = trySelectors(config.priceSelectors);
    result.retailPrice = trySelectors(config.retailPriceSelectors);

    // JSON-LD fallback
    if (!result.salePrice || !result.retailPrice) {
      try {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
          const d = JSON.parse(script.textContent);
          const offers = d.offers || (d['@graph'] && d['@graph'].find(g => g.offers))?.offers;
          if (offers) {
            const offer = Array.isArray(offers) ? offers[0] : offers;
            if (!result.salePrice && offer.price) result.salePrice = String(offer.price);
            if (!result.retailPrice && offer.highPrice) result.retailPrice = String(offer.highPrice);
          }
        }
      } catch (e) {}
    }

    // Sizes with availability check
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
          // Availability check
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
    log('\u2192 Foot Locker API-first scraping');
    return await scrapeFootLocker(url);
  }
  log('\u2192 Generic Playwright scraping');
  return await scrapeGeneric(url, config);
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

// ===== MAIN =====
async function main() {
  console.log(`\n\ud83d\udd25 FASHION. \u2014 Process Queue`);
  console.log('='.repeat(50));
  if (DRY_RUN) console.log('  \ud83e\uddea DRY RUN');

  initCloudinary();
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const urls = readQueue();
  if (urls.length === 0) {
    console.log('\n  \ud83d\udcea Queue is empty! Paste URLs into data/queue.txt\n');
    return;
  }

  console.log(`\n  \ud83d\udce6 ${urls.length} product${urls.length > 1 ? 's' : ''} in queue\n`);

  const picksData = JSON.parse(fs.readFileSync(PICKS_PATH, 'utf-8'));
  const results = { success: 0, failed: 0, items: [] };
  const processedUrls = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const domain = extractDomain(url);
    const storeInfo = matchStore(domain);
    const config = loadStoreConfig(domain);
    const currency = isFootLocker(domain) ? getFlRegion(domain).currency : detectCurrency(domain);

    console.log(`\n  [${i + 1}/${urls.length}] ${storeInfo.flag} ${storeInfo.name}`);
    console.log(`  ${url}`);

    try {
      const scraped = await scrapePage(url, config);

      const name = scraped.name || 'Unknown Product';
      const brand = detectBrand(name);
      const salePrice = parsePrice(scraped.salePrice);
      const retailPrice = parsePrice(scraped.retailPrice);
      const discount = (salePrice && retailPrice && retailPrice > salePrice)
        ? `-${Math.round((1 - salePrice / retailPrice) * 100)}%` : '0%';

      const nextId = Math.max(...picksData.picks.map(p => p.id), 0) + 1;
      const filename = `${nextId}-${slugify(name)}`;

      let imageUrl = scraped.image || '';
      if (imageUrl && CLOUD_ENABLED) {
        const cdnUrl = await uploadToCloudinary(imageUrl, `picks/${filename}`);
        if (cdnUrl) imageUrl = cdnUrl;
      }

      const validSizes = (scraped.sizes || []).filter(s => isValidSize(s));

      const newPick = {
        id: nextId, name, brand,
        styleCode: scraped.styleCode || '', colorway: scraped.colorway || '',
        retailPrice: retailPrice ? formatPrice(retailPrice, currency) : '',
        salePrice: salePrice ? formatPrice(salePrice, currency) : '',
        discount, store: storeInfo.name, storeFlag: storeInfo.flag,
        image: imageUrl, url,
        description: (scraped.description || '').substring(0, 200),
        tags: detectTags(name, brand),
        sizes: validSizes,
      };

      if (!DRY_RUN) picksData.picks.push(newPick);

      const priceStr = newPick.salePrice
        ? `${newPick.retailPrice || '?'} \u2192 ${newPick.salePrice} (${newPick.discount})`
        : '\u26a0\ufe0f  price not found';

      console.log(`  \u2705 ${name}`);
      console.log(`     ${brand} | ${priceStr}`);
      console.log(`     Sizes: ${validSizes.length > 0 ? validSizes.join(', ') : 'none found'}`);
      if (scraped.allSizeData && scraped.allSizeData.length > 0) {
        const soldOut = scraped.allSizeData.filter(s => !s.available).length;
        console.log(`     Stock: ${validSizes.length} available, ${soldOut} sold out`);
      }
      console.log(`     Image: ${newPick.image ? '\u2705' : '\u274c'}`);
      console.log(`     Color: ${newPick.colorway || '-'}`);

      results.success++;
      results.items.push({ url, name, status: 'success', id: nextId });
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

  const missingImages = picksData.picks.filter(p => !p.image);
  if (missingImages.length > 0 && !DRY_RUN) {
    console.log(`\n  \ud83d\udcf8 ${missingImages.length} picks need images, running fetch-images.js...`);
    try { execSync('node scripts/fetch-images.js', { cwd: path.join(__dirname, '..'), stdio: 'inherit' }); }
    catch (e) { console.log('  \u26a0\ufe0f  Image fetcher had issues'); }
  }

  if (!DRY_RUN) {
    fs.writeFileSync(PICKS_PATH, JSON.stringify(picksData, null, 2) + '\n');
    console.log('\n  \ud83d\udcbe Saved picks.json');
  }

  if (!DRY_RUN && processedUrls.length > 0) {
    const timestamp = new Date().toISOString().split('T')[0];
    fs.appendFileSync(DONE_PATH, `\n# Processed ${timestamp}\n${processedUrls.join('\n')}\n`);
    const header = fs.readFileSync(QUEUE_PATH, 'utf-8').split('\n').filter(l => l.startsWith('#') || l.trim() === '').join('\n');
    fs.writeFileSync(QUEUE_PATH, header + '\n');
    console.log('  \ud83d\udcea Queue cleared');
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  \u2705 Added: ${results.success}  |  \u274c Failed: ${results.failed}`);
  console.log('='.repeat(50));
  for (const item of results.items) {
    console.log(`  ${item.status === 'success' ? '\u2705' : '\u274c'} #${item.id || '?'} ${item.name || item.url}`);
  }
  console.log('\n\u2728 Done!\n');
}

main().catch(e => {
  console.error('\n\u274c Fatal error:', e.message);
  if (VERBOSE) console.error(e);
  if (_browser) _browser.close();
  process.exit(1);
});
