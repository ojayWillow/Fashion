#!/usr/bin/env node
/**
 * FASHION. — Process Queue
 * =========================
 * One command to rule them all.
 *
 * 1. Reads URLs from data/queue.txt
 * 2. Scrapes each product (API-first for known stores, Playwright fallback)
 * 3. Saves to picks.json
 * 4. Fetches images (all 5 sources)
 * 5. Moves processed URLs to data/queue-done.txt
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

/**
 * Validates if a string looks like a real product size.
 * Filters out navigation items, random text, etc.
 */
function isValidSize(text) {
  if (!text || text.length > 12) return false;
  const t = text.trim();
  // EU shoe sizes: 35-50, with optional .5
  if (/^\d{2}(\.5)?$/.test(t)) {
    const n = parseFloat(t);
    if (n >= 35 && n <= 52) return true;
  }
  // US/UK shoe sizes: 3-16, with optional .5
  if (/^(US|UK)?\s?\d{1,2}(\.5)?$/i.test(t)) return true;
  // Clothing sizes
  if (/^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|XXXL)$/i.test(t)) return true;
  // Numeric clothing sizes (waist etc): 24-44
  if (/^\d{2}$/.test(t)) {
    const n = parseInt(t);
    if (n >= 24 && n <= 52) return true;
  }
  // FR/IT clothing sizes
  if (/^(FR|IT)?\s?\d{2}$/i.test(t)) return true;
  return false;
}

// ===== STORE CONFIG =====
function loadStoreConfig(domain) {
  const configs = JSON.parse(fs.readFileSync(CONFIGS_PATH, 'utf-8'));
  const stores = configs.stores;

  if (stores[domain]) {
    let config = stores[domain];
    if (config._inherit) {
      config = { ...stores[config._inherit], ...config };
      delete config._inherit;
    }
    return config;
  }

  const baseDomain = domain.split('.').slice(-2, -1)[0];
  for (const [key, config] of Object.entries(stores)) {
    if (key === '_default') continue;
    if (key.startsWith(baseDomain + '.')) {
      let resolved = config;
      if (resolved._inherit) {
        resolved = { ...stores[resolved._inherit], ...resolved };
        delete resolved._inherit;
      }
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
        return {
          name: store.name, country: store.country, flag: store.flag,
          category: category.name, categoryIcon: category.icon
        };
      }
    }
  }

  return {
    name: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
    country: 'Unknown', flag: '\ud83c\udf10', category: 'Other', categoryIcon: '\ud83d\uded2'
  };
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
// FOOT LOCKER API — proper data extraction via their inventory endpoint
// =====================================================================

/**
 * Foot Locker region configs.
 * Maps TLD to the INTERSHOP path used in their API.
 */
const FL_REGIONS = {
  'footlocker.nl':    { base: 'https://www.footlocker.nl',    path: 'INTERSHOP/web/FLE/Footlocker-Footlocker_NL-Site/en_GB/-/EUR',  currency: 'EUR' },
  'footlocker.de':    { base: 'https://www.footlocker.de',    path: 'INTERSHOP/web/FLE/Footlocker-Footlocker_DE-Site/en_GB/-/EUR',  currency: 'EUR' },
  'footlocker.fr':    { base: 'https://www.footlocker.fr',    path: 'INTERSHOP/web/FLE/Footlocker-Footlocker_FR-Site/en_GB/-/EUR',  currency: 'EUR' },
  'footlocker.es':    { base: 'https://www.footlocker.es',    path: 'INTERSHOP/web/FLE/Footlocker-Footlocker_ES-Site/en_GB/-/EUR',  currency: 'EUR' },
  'footlocker.it':    { base: 'https://www.footlocker.it',    path: 'INTERSHOP/web/FLE/Footlocker-Footlocker_IT-Site/en_GB/-/EUR',  currency: 'EUR' },
  'footlocker.co.uk': { base: 'https://www.footlocker.co.uk', path: 'INTERSHOP/web/FLE/Footlocker-Footlocker_GB-Site/en_GB/-/GBP',  currency: 'GBP' },
  'footlocker.com':   { base: 'https://www.footlocker.com',   path: 'INTERSHOP/web/FLE/Footlocker-Footlocker_US-Site/en_US/-/USD',  currency: 'USD' },
  'footlocker.eu':    { base: 'https://www.footlocker.eu',    path: 'INTERSHOP/web/FLE/Footlocker-Footlocker_EU-Site/en_GB/-/EUR',  currency: 'EUR' },
};

/**
 * Detect if a domain is a Foot Locker site.
 */
function isFootLocker(domain) {
  return domain.includes('footlocker');
}

/**
 * Get FL region config from domain.
 */
function getFlRegion(domain) {
  // Direct match
  if (FL_REGIONS[domain]) return FL_REGIONS[domain];
  // Partial match
  for (const [key, val] of Object.entries(FL_REGIONS)) {
    if (domain.includes(key.split('.')[0]) && domain.endsWith(key.split('.').slice(1).join('.'))) return val;
  }
  // Default to NL
  return FL_REGIONS['footlocker.nl'];
}

/**
 * Extract BaseSKU (product ID) from Foot Locker URL.
 * URLs look like:
 *   /nl/product/~/314217525204.html
 *   /en/p/new-balance-1906r-314217525204
 *   /product/new-balance-1906r/314217525204.html
 */
function extractFlSku(url) {
  // Pattern 1: digits before .html at end
  const m1 = url.match(/(\d{10,15})\.html/);
  if (m1) return m1[1];
  // Pattern 2: digits at end of path
  const m2 = url.match(/[\/-](\d{10,15})(?:\?|$)/);
  if (m2) return m2[1];
  // Pattern 3: ?v= param
  const m3 = url.match(/[?&]v=(\d{10,15})/);
  if (m3) return m3[1];
  return null;
}

/**
 * Scrape Foot Locker using their actual inventory API.
 * This is how bots and monitors get FL data — it returns real sizes,
 * stock levels, and product info in a structured format.
 */
async function scrapeFootLocker(url) {
  const https = require('https');
  const http = require('http');

  const domain = extractDomain(url);
  const region = getFlRegion(domain);
  const sku = extractFlSku(url);

  if (!sku) {
    throw new Error(`Could not extract product SKU from Foot Locker URL: ${url}`);
  }

  log(`FL SKU: ${sku}`);
  log(`FL Region: ${region.base}`);

  const result = {
    name: '',
    image: '',
    salePrice: '',
    retailPrice: '',
    sizes: [],
    allSizeData: [],
    description: '',
    colorway: '',
    styleCode: sku,
  };

  // ===== METHOD 1: Inventory API (sizes + stock) =====
  const apiUrl = `${region.base}/${region.path}/ViewProduct-ProductVariationSelect?BaseSKU=${sku}&InventoryServerity=ProductDetail`;
  log(`FL API URL: ${apiUrl}`);

  try {
    const apiResponse = await fetchUrl(apiUrl, {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': url,
      'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8',
    });

    if (apiResponse) {
      let apiData;
      try {
        apiData = JSON.parse(apiResponse);
      } catch (e) {
        log('FL API did not return valid JSON, trying HTML parse');
      }

      if (apiData && apiData.content) {
        // Parse the HTML content from API response
        const content = apiData.content;

        // Extract product variation JSON (contains all sizes + stock)
        const variationMatch = content.match(/data-product-variation-info-json=['"]({[^'"]+})['"]/);
        if (variationMatch) {
          try {
            const variations = JSON.parse(variationMatch[1].replace(/&quot;/g, '"'));
            for (const [varSku, info] of Object.entries(variations)) {
              const sizeEntry = {
                size: info.sizeValue || '',
                sku: varSku,
                stock: info.inventoryLevel || 'RED',
                available: info.inventoryLevel !== 'RED',
              };
              result.allSizeData.push(sizeEntry);
              if (sizeEntry.available && sizeEntry.size) {
                result.sizes.push(sizeEntry.size);
              }
            }
            log(`FL API: found ${result.allSizeData.length} total sizes, ${result.sizes.length} available`);
          } catch (e) {
            log(`FL API: error parsing variation JSON: ${e.message}`);
          }
        }

        // Also try to extract variation JSON with escaped quotes
        if (result.sizes.length === 0) {
          const variationMatch2 = content.match(/data-product-variation-info-json="({.*?})"/);
          if (variationMatch2) {
            try {
              const decoded = variationMatch2[1]
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&#39;/g, "'");
              const variations = JSON.parse(decoded);
              for (const [varSku, info] of Object.entries(variations)) {
                const sizeEntry = {
                  size: info.sizeValue || '',
                  sku: varSku,
                  stock: info.inventoryLevel || 'RED',
                  available: info.inventoryLevel !== 'RED',
                };
                result.allSizeData.push(sizeEntry);
                if (sizeEntry.available && sizeEntry.size) {
                  result.sizes.push(sizeEntry.size);
                }
              }
              log(`FL API (2nd parse): found ${result.sizes.length} available sizes`);
            } catch (e) {
              log(`FL API: 2nd parse also failed: ${e.message}`);
            }
          }
        }
      }
    }
  } catch (e) {
    log(`FL API request failed: ${e.message}`);
  }

  // ===== METHOD 2: Product page for name, price, image =====
  // Use Playwright for the actual product page to get name, image, prices
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8' });

  // Intercept network responses to capture JSON data
  const capturedData = { jsonLd: null, nextData: null, apiResponses: [] };
  page.on('response', async (response) => {
    const respUrl = response.url();
    const contentType = response.headers()['content-type'] || '';
    try {
      if (contentType.includes('application/json') && respUrl.includes('ProductVariation')) {
        const body = await response.json();
        capturedData.apiResponses.push(body);
        log(`Captured FL API response from: ${respUrl}`);
      }
    } catch (e) {}
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    log(`Page load timeout, continuing...`);
  }

  await page.waitForTimeout(5000);

  // Dismiss cookie popup
  try {
    const cookieBtn = await page.$('#onetrust-accept-btn-handler');
    if (cookieBtn) { await cookieBtn.click(); await page.waitForTimeout(1000); }
  } catch (e) {}
  try {
    const acceptBtn = await page.$('button[id*="accept"]');
    if (acceptBtn) { await acceptBtn.click(); await page.waitForTimeout(1000); }
  } catch (e) {}

  // Extract data from the rendered page
  const pageData = await page.evaluate((sku) => {
    const data = { name: '', image: '', salePrice: '', retailPrice: '', colorway: '', description: '', sizes: [] };

    // ===== NAME =====
    // Try og:title first (most reliable)
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) data.name = ogTitle.getAttribute('content') || '';
    // Fallback to h1 in the product area
    if (!data.name) {
      const h1 = document.querySelector('h1');
      if (h1) data.name = h1.textContent.trim();
    }

    // ===== IMAGE =====
    // og:image is the most reliable source
    const ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg) {
      const src = ogImg.getAttribute('content');
      if (src && src.startsWith('http')) data.image = src;
    }
    // Known FL image pattern as fallback
    if (!data.image) {
      data.image = `https://images.footlocker.com/is/image/FLEU/${sku}_01?wid=763&hei=538&fmt=png-alpha`;
    }

    // ===== PRICES =====
    // JSON-LD structured data (most reliable for prices)
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const d = JSON.parse(script.textContent);
        if (d['@type'] === 'Product' && d.offers) {
          const offers = Array.isArray(d.offers) ? d.offers[0] : d.offers;
          if (offers.price) data.salePrice = String(offers.price);
          if (offers.highPrice) data.retailPrice = String(offers.highPrice);
          // If only one price, it might be regular price
          if (data.salePrice && !data.retailPrice) {
            data.retailPrice = data.salePrice;
          }
        }
        // Handle @graph format
        if (d['@graph']) {
          for (const item of d['@graph']) {
            if (item['@type'] === 'Product' && item.offers) {
              const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
              if (offers.price) data.salePrice = String(offers.price);
              if (offers.highPrice) data.retailPrice = String(offers.highPrice);
            }
          }
        }
      }
    } catch (e) {}

    // DOM price fallback — specifically in the product detail area
    if (!data.salePrice) {
      const priceSelectors = [
        '[data-testid="ProductPrice-sale"]',
        '[class*="ProductPrice"] [class*="sale"]',
        '[class*="ProductPrice--sale"]',
        'meta[property="product:sale_price:amount"]',
      ];
      for (const sel of priceSelectors) {
        try {
          const el = document.querySelector(sel);
          if (!el) continue;
          if (el.tagName === 'META') {
            const c = el.getAttribute('content');
            if (c) { data.salePrice = c; break; }
          }
          const text = el.textContent.trim();
          if (text) { data.salePrice = text; break; }
        } catch (e) {}
      }
    }
    if (!data.retailPrice) {
      const retailSelectors = [
        '[data-testid="ProductPrice-original"]',
        '[class*="ProductPrice"] [class*="original"]',
        '[class*="ProductPrice--crossed"]',
        'meta[property="product:price:amount"]',
      ];
      for (const sel of retailSelectors) {
        try {
          const el = document.querySelector(sel);
          if (!el) continue;
          if (el.tagName === 'META') {
            const c = el.getAttribute('content');
            if (c) { data.retailPrice = c; break; }
          }
          const text = el.textContent.trim();
          if (text) { data.retailPrice = text; break; }
        } catch (e) {}
      }
    }

    // ===== COLORWAY =====
    const colorSels = [
      '[class*="color-name"]', '[class*="ColorName"]',
      '[class*="colorway"]', '[class*="Colorway"]',
      '[class*="product-color"]'
    ];
    for (const sel of colorSels) {
      try {
        const el = document.querySelector(sel);
        if (el) { data.colorway = el.textContent.trim(); break; }
      } catch (e) {}
    }

    // ===== DESCRIPTION =====
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) data.description = metaDesc.getAttribute('content') || '';
    if (!data.description) {
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) data.description = ogDesc.getAttribute('content') || '';
    }

    // ===== SIZES (DOM fallback, ONLY from product area) =====
    // Target specifically the product variation area, not the nav
    const sizeContainers = [
      '[data-product-variation-info-json]',
      '[class*="SizeSelector"][class*="product"]',
      '#product-detail [class*="SizeSelector"]',
      'main [class*="SizeSelector"]',
      '[class*="pdp"] [class*="SizeSelector"]',
    ];
    for (const containerSel of sizeContainers) {
      try {
        const container = document.querySelector(containerSel);
        if (!container) continue;
        const buttons = container.querySelectorAll('button, a, li');
        const sizes = [];
        buttons.forEach(btn => {
          const text = btn.textContent.trim();
          // Only accept things that look like shoe/clothing sizes
          if (text && text.length <= 8 && /^\d{2}(\.5)?$/.test(text)) {
            sizes.push(text);
          }
        });
        if (sizes.length > 0) {
          data.sizes = sizes;
          break;
        }
      } catch (e) {}
    }

    // ===== __NEXT_DATA__ fallback =====
    try {
      const nextScript = document.querySelector('#__NEXT_DATA__');
      if (nextScript) {
        const nextData = JSON.parse(nextScript.textContent);
        const props = nextData.props?.pageProps;
        if (props) {
          if (props.product) {
            const p = props.product;
            if (!data.name && p.name) data.name = p.name;
            if (!data.salePrice && p.salePrice) data.salePrice = String(p.salePrice);
            if (!data.retailPrice && p.retailPrice) data.retailPrice = String(p.retailPrice);
            if (!data.image && p.image) data.image = p.image;
            if (p.sizes && Array.isArray(p.sizes)) {
              data.sizes = p.sizes.filter(s => s.available !== false).map(s => s.label || s.value || s.size || String(s));
            }
          }
        }
      }
    } catch (e) {}

    return data;
  }, sku);

  await page.close();

  // Merge: API sizes take priority, page data fills the rest
  result.name = pageData.name || result.name;
  result.image = pageData.image || result.image;
  result.salePrice = pageData.salePrice || result.salePrice;
  result.retailPrice = pageData.retailPrice || result.retailPrice;
  result.colorway = pageData.colorway || result.colorway;
  result.description = pageData.description || result.description;

  // If API didn't get sizes, use DOM sizes
  if (result.sizes.length === 0 && pageData.sizes.length > 0) {
    result.sizes = pageData.sizes;
  }

  // Also check captured API responses from network interception
  for (const apiResp of capturedData.apiResponses) {
    if (apiResp.content && result.sizes.length === 0) {
      const varMatch = apiResp.content.match(/data-product-variation-info-json=['"]({[^'"]+})['"]/);
      if (varMatch) {
        try {
          const variations = JSON.parse(varMatch[1].replace(/&quot;/g, '"'));
          for (const [, info] of Object.entries(variations)) {
            if (info.inventoryLevel !== 'RED' && info.sizeValue) {
              result.sizes.push(info.sizeValue);
            }
          }
        } catch (e) {}
      }
    }
  }

  // Final fallback image: FL's known CDN pattern
  if (!result.image) {
    result.image = `https://images.footlocker.com/is/image/FLEU/${sku}_01?wid=763&hei=538&fmt=png-alpha`;
  }

  return result;
}

/**
 * Simple HTTP fetch helper (no browser needed)
 */
function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        ...headers,
        'Connection': 'keep-alive',
      },
      timeout: 15000,
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

// ===== GENERIC PLAYWRIGHT SCRAPER (non-Foot Locker stores) =====
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

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    log(`Page load timeout for ${url}, continuing...`);
  }

  await page.waitForTimeout(config.waitTime || 4000);

  // Cookie popup dismissal
  try {
    const cookieSelectors = [
      '#onetrust-accept-btn-handler',
      'button[id*="accept"]', 'button[id*="cookie"]', 'button[id*="consent"]',
      'button[class*="accept"]', 'button[class*="consent"]',
      '[data-testid*="accept"]',
      'button:has-text("Accept All")', 'button:has-text("Accept")',
      'button:has-text("Accepteren")', 'button:has-text("Alle akkoord")'
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
          if (el.tagName === 'META') {
            const c = el.getAttribute('content');
            if (c && c.trim()) return c.trim();
            continue;
          }
          const text = el.textContent.trim();
          if (text) return text;
        } catch (e) {}
      }
      return '';
    }

    // Name
    result.name = trySelectors(config.nameSelectors);

    // Image — og:image first
    const ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg) {
      const c = ogImg.getAttribute('content');
      if (c && c.startsWith('http')) result.image = c;
    }
    if (!result.image) {
      for (const sel of config.imageSelectors) {
        try {
          const el = document.querySelector(sel);
          if (!el) continue;
          if (el.tagName === 'META') {
            const c = el.getAttribute('content');
            if (c && c.startsWith('http')) { result.image = c; break; }
          } else if (el.tagName === 'SOURCE') {
            const srcset = el.getAttribute('srcset');
            if (srcset) {
              const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
              if (urls.length && urls[urls.length-1].startsWith('http')) { result.image = urls[urls.length-1]; break; }
            }
          } else {
            const src = el.src || el.getAttribute('data-src');
            if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('svg') && !src.includes('icon')) {
              result.image = src; break;
            }
          }
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

    // Sizes — scoped to product area, with validation
    const sizeAreas = [
      'main',
      '#product-detail',
      '[class*="pdp"]',
      '[class*="product-detail"]',
      'article',
    ];
    let sizeContainer = null;
    for (const area of sizeAreas) {
      sizeContainer = document.querySelector(area);
      if (sizeContainer) break;
    }
    if (!sizeContainer) sizeContainer = document;

    for (const sel of config.sizeSelectors) {
      try {
        const els = sizeContainer.querySelectorAll(sel);
        if (els.length === 0) continue;
        const values = [];
        els.forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length <= 12) {
            // Must look like an actual size
            const isSize = /^\d{2}(\.5)?$/.test(text) ||
                           /^(US|UK)?\s?\d{1,2}(\.5)?$/i.test(text) ||
                           /^(XXS|XS|S|M|L|XL|XXL|2XL|3XL)$/i.test(text) ||
                           /^(One Size)$/i.test(text);
            if (isSize && !text.toLowerCase().includes('sold') && !text.toLowerCase().includes('uitverkocht')) {
              values.push(text);
            }
          }
        });
        if (values.length > 0) { result.sizes = values; break; }
      } catch (e) {}
    }

    // Description & colorway
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) result.description = metaDesc.getAttribute('content') || '';

    const colorSels = ['[class*="color-name"]', '[class*="ColorName"]', '[class*="colorway"]', '[class*="Colorway"]'];
    for (const sel of colorSels) {
      try {
        const el = document.querySelector(sel);
        if (el) { result.colorway = el.textContent.trim(); break; }
      } catch (e) {}
    }

    const styleSels = ['[class*="style-code"]', '[class*="StyleCode"]', '[class*="product-code"]', '[class*="article-number"]'];
    for (const sel of styleSels) {
      try {
        const el = document.querySelector(sel);
        if (el) { result.styleCode = el.textContent.trim(); break; }
      } catch (e) {}
    }

    return result;
  }, config);

  await page.close();
  return data;
}

// ===== MAIN SCRAPE ROUTER =====
async function scrapePage(url, config) {
  const domain = extractDomain(url);
  if (isFootLocker(domain)) {
    log('Using Foot Locker API-first scraping');
    return await scrapeFootLocker(url);
  }
  log('Using generic Playwright scraping');
  return await scrapeGeneric(url, config);
}

// ===== READ QUEUE =====
function readQueue() {
  if (!fs.existsSync(QUEUE_PATH)) {
    console.log('  \u274c No queue file found. Create data/queue.txt with product URLs.');
    return [];
  }
  const content = fs.readFileSync(QUEUE_PATH, 'utf-8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.startsWith('http'));
}

// ===== MAIN =====
async function main() {
  console.log(`\n\ud83d\udd25 FASHION. \u2014 Process Queue`);
  console.log('='.repeat(50));
  if (DRY_RUN) console.log('  \ud83e\uddea DRY RUN \u2014 nothing will be saved');

  initCloudinary();
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  // 1. Read queue
  const urls = readQueue();
  if (urls.length === 0) {
    console.log('\n  \ud83d\udcea Queue is empty!');
    console.log('  Paste product URLs into data/queue.txt (one per line)');
    console.log('  Then run this command again.\n');
    return;
  }

  console.log(`\n  \ud83d\udce6 ${urls.length} product${urls.length > 1 ? 's' : ''} in queue\n`);

  const picksData = JSON.parse(fs.readFileSync(PICKS_PATH, 'utf-8'));
  const results = { success: 0, failed: 0, items: [] };
  const processedUrls = [];

  // 2. Process each URL
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const domain = extractDomain(url);
    const storeInfo = matchStore(domain);
    const config = loadStoreConfig(domain);
    const currency = isFootLocker(domain) ? getFlRegion(domain).currency : detectCurrency(domain);

    console.log(`\n  [${i + 1}/${urls.length}] ${storeInfo.flag} ${storeInfo.name}`);
    console.log(`  ${url}`);

    try {
      // Scrape
      const scraped = await scrapePage(url, config);

      // Process
      const name = scraped.name || 'Unknown Product';
      const brand = detectBrand(name);
      const salePrice = parsePrice(scraped.salePrice);
      const retailPrice = parsePrice(scraped.retailPrice);
      const discount = (salePrice && retailPrice && retailPrice > salePrice)
        ? `-${Math.round((1 - salePrice / retailPrice) * 100)}%` : '0%';

      const nextId = Math.max(...picksData.picks.map(p => p.id), 0) + 1;
      const filename = `${nextId}-${slugify(name)}`;

      // Handle image
      let imageUrl = scraped.image || '';
      if (imageUrl && CLOUD_ENABLED) {
        const cdnUrl = await uploadToCloudinary(imageUrl, `picks/${filename}`);
        if (cdnUrl) imageUrl = cdnUrl;
      }

      // Filter sizes to only valid ones
      const validSizes = (scraped.sizes || []).filter(s => isValidSize(s));

      // Build pick
      const newPick = {
        id: nextId,
        name: name,
        brand: brand,
        styleCode: scraped.styleCode || '',
        colorway: scraped.colorway || '',
        retailPrice: retailPrice ? formatPrice(retailPrice, currency) : '',
        salePrice: salePrice ? formatPrice(salePrice, currency) : '',
        discount: discount,
        store: storeInfo.name,
        storeFlag: storeInfo.flag,
        image: imageUrl,
        url: url,
        description: (scraped.description || '').substring(0, 200),
        tags: detectTags(name, brand),
        sizes: validSizes
      };

      if (!DRY_RUN) {
        picksData.picks.push(newPick);
      }

      // Print result
      const priceStr = newPick.salePrice
        ? `${newPick.retailPrice} \u2192 ${newPick.salePrice} (${newPick.discount})`
        : '\u26a0\ufe0f  price not found';

      console.log(`  \u2705 ${name}`);
      console.log(`     ${brand} | ${priceStr}`);
      console.log(`     Sizes: ${validSizes.length > 0 ? validSizes.join(', ') : 'none found'}`);
      if (scraped.allSizeData && scraped.allSizeData.length > 0) {
        const soldOut = scraped.allSizeData.filter(s => !s.available).length;
        console.log(`     Stock: ${validSizes.length} available, ${soldOut} sold out`);
      }
      console.log(`     Image: ${newPick.image ? '\u2705' : '\u274c'}`);
      console.log(`     Color: ${newPick.colorway || 'unknown'}`);

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

  // 3. Close browser
  if (_browser) {
    await _browser.close();
    _browser = null;
  }

  // 4. Run fetch-images.js for any picks missing images
  const missingImages = picksData.picks.filter(p => !p.image);
  if (missingImages.length > 0 && !DRY_RUN) {
    console.log(`\n  \ud83d\udcf8 ${missingImages.length} picks need images, running fetch-images.js...`);
    try {
      execSync('node scripts/fetch-images.js', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    } catch (e) {
      console.log('  \u26a0\ufe0f  Image fetcher had issues, some images may need manual fixing');
    }
  }

  // 5. Save picks.json
  if (!DRY_RUN) {
    fs.writeFileSync(PICKS_PATH, JSON.stringify(picksData, null, 2) + '\n');
    console.log('\n  \ud83d\udcbe Saved picks.json');
  }

  // 6. Clear queue & archive processed URLs
  if (!DRY_RUN && processedUrls.length > 0) {
    const timestamp = new Date().toISOString().split('T')[0];
    const doneEntry = `\n# Processed ${timestamp}\n${processedUrls.join('\n')}\n`;
    fs.appendFileSync(DONE_PATH, doneEntry);

    const header = fs.readFileSync(QUEUE_PATH, 'utf-8')
      .split('\n')
      .filter(line => line.startsWith('#') || line.trim() === '')
      .join('\n');
    fs.writeFileSync(QUEUE_PATH, header + '\n');

    console.log('  \ud83d\udcea Queue cleared \u2192 processed URLs archived in data/queue-done.txt');
  }

  // 7. Report
  console.log(`\n${'='.repeat(50)}`);
  console.log('  \ud83d\udcca RESULTS');
  console.log('='.repeat(50));
  console.log(`  Total:     ${urls.length}`);
  console.log(`  \u2705 Added:  ${results.success}`);
  console.log(`  \u274c Failed: ${results.failed}`);
  console.log('='.repeat(50));

  for (const item of results.items) {
    const icon = item.status === 'success' ? '\u2705' : '\u274c';
    console.log(`  ${icon} #${item.id || '?'} ${item.name || item.url}`);
  }

  if (results.failed > 0) {
    console.log('\n  \u26a0\ufe0f  Some products failed. Check --verbose output or add them manually.');
  }

  console.log('\n\u2728 Done!\n');
}

main().catch(e => {
  console.error('\n\u274c Fatal error:', e.message);
  if (VERBOSE) console.error(e);
  if (_browser) _browser.close();
  process.exit(1);
});
