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
// FOOT LOCKER — Patchright (bypasses Kasada)
// =====================================================================
// Kasada (KPSDK) blocks regular Playwright and HTTP requests.
// Patchright is a stealth Playwright fork that bypasses it.
// Data sources (in priority order):
//   1. JSON-LD: offers[] has per-size SKU, price, and availability
//   2. DOM sizes: class ending '--r' = available, '--d' = sold out
//   3. DOM prices: span.text-sale_red = sale, line-through = original
// =====================================================================

function isFootLocker(domain) { return domain.includes('footlocker'); }

function getFlCurrency(domain) {
  if (domain.endsWith('.co.uk') || domain.endsWith('.uk')) return 'GBP';
  if (domain.endsWith('.com') && !domain.includes('.co')) return 'USD';
  return 'EUR';
}

function extractFlSku(url) {
  const m1 = url.match(/(\d{10,15})\.html/);
  if (m1) return m1[1];
  const m2 = url.match(/[\/-](\d{10,15})(?:\?|$)/);
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

  // Wait for content to fully render
  await page.waitForTimeout(8000);

  // Dismiss cookie popup
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

    // ===== 1. JSON-LD (most reliable source) =====
    // FL puts a Product JSON-LD with offers[] per size, each with:
    //   sku: "314217525204-40", price: 125, availability: "InStock"
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const ld = JSON.parse(script.textContent);
        if (ld['@type'] !== 'Product') continue;

        // Name & brand
        if (ld.name) data.name = ld.name;
        if (ld.brand) data.brand = typeof ld.brand === 'string' ? ld.brand : (ld.brand.name || '');

        // Image
        if (ld.image) data.image = ld.image;

        // Sizes from offers (only InStock ones)
        if (ld.offers && Array.isArray(ld.offers)) {
          data.totalSizes = ld.offers.length;
          const inStock = [];
          const soldOut = [];
          for (const offer of ld.offers) {
            // Extract size from SKU like "314217525204-42.5"
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

          // Price from first offer
          if (ld.offers[0] && ld.offers[0].price) {
            data.salePrice = String(ld.offers[0].price);
          }
        }
        break;
      }
    } catch (e) {}

    // ===== 2. NAME from H1 (fallback) =====
    if (!data.name) {
      const h1 = document.querySelector('h1');
      if (h1) data.name = h1.textContent.trim();
    }

    // ===== 3. PRICES from DOM =====
    // Sale price: span with class 'text-sale_red' inside ProductPrice
    // Retail/original price: element with line-through text-decoration
    if (!data.salePrice) {
      const saleEl = document.querySelector('.text-sale_red') ||
                     document.querySelector('[class*="ProductPrice"] [class*="sale"]');
      if (saleEl) {
        const text = saleEl.textContent.trim();
        if (/\d/.test(text)) data.salePrice = text;
      }
    }

    // Look for original/retail price (crossed out)
    // FL uses line-through text decoration for the original price
    const priceArea = document.querySelector('.ProductDetails-form__price') ||
                      document.querySelector('[class*="ProductPrice"]');
    if (priceArea) {
      const allSpans = priceArea.querySelectorAll('span');
      for (const span of allSpans) {
        const style = window.getComputedStyle(span);
        const text = span.textContent.trim();
        if (!text || !/[\d]/.test(text)) continue;
        // Check for line-through (original/crossed-out price)
        if (style.textDecorationLine === 'line-through' ||
            style.textDecoration.includes('line-through')) {
          data.retailPrice = text;
          break;
        }
      }
      // Also check <s> and <del> tags
      if (!data.retailPrice) {
        const crossed = priceArea.querySelector('s, del, [class*="LineThrough"]');
        if (crossed) {
          const text = crossed.textContent.trim();
          if (/\d/.test(text)) data.retailPrice = text;
        }
      }
    }

    // If no separate retail price found, check meta tag
    if (!data.retailPrice) {
      const metaPrice = document.querySelector('meta[property="product:price:amount"]');
      if (metaPrice) data.retailPrice = metaPrice.getAttribute('content') || '';
    }

    // ===== 4. SIZES from DOM (fallback if JSON-LD didn't have them) =====
    if (data.sizes.length === 0) {
      const sizeArea = document.querySelector('[class*="SizeSelector"]');
      if (sizeArea) {
        // FL size buttons:
        //   class ending '--r' (regional) = AVAILABLE, text color rgb(14,17,17)
        //   class ending '--d' (disabled) = SOLD OUT, text color rgb(117,117,117)
        const buttons = sizeArea.querySelectorAll('button[class*="SizeSelector-button"]');
        const available = [];
        const total = [];
        buttons.forEach(btn => {
          const text = btn.textContent.trim();
          if (!text || text.length > 10) return;
          if (!/^\d{2}(\.5)?$/.test(text) && !/^(US|UK)?\s?\d{1,2}(\.5)?$/i.test(text)) return;
          total.push(text);
          const cls = (btn.className || '').toString();
          // '--d' at the end of class = disabled/sold out
          // '--r' at the end of class = regional/available
          if (cls.includes('--d')) {
            // Sold out — skip
            return;
          }
          // Also check color: grey = sold out
          const style = window.getComputedStyle(btn);
          const color = style.color;
          if (color === 'rgb(117, 117, 117)') {
            // Grey text = sold out
            return;
          }
          available.push(text);
        });
        data.sizes = available;
        data.totalSizes = total.length;
        data.soldOutSizes = total.length - available.length;
      }
    }

    // ===== 5. IMAGE =====
    // og:image or first product image from FL CDN
    if (!data.image) {
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg) data.image = ogImg.getAttribute('content') || '';
    }

    // ===== 6. DESCRIPTION =====
    if (!data.description) {
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) data.description = (metaDesc.getAttribute('content') || '').substring(0, 200);
    }

    // ===== 7. COLORWAY =====
    const colorSels = ['[class*="color-name"]', '[class*="ColorName"]', '[class*="colorway"]', '[class*="Colorway"]'];
    for (const sel of colorSels) {
      const el = document.querySelector(sel);
      if (el) { data.colorway = el.textContent.trim(); break; }
    }

    return data;
  });

  await page.close();

  // Build high-res image URL from FL CDN
  let image = scraped.image || '';
  if (image && !image.includes('wid=')) {
    image = image.split('?')[0] + '?wid=763&hei=538&fmt=png-alpha';
  }
  if (!image) {
    image = `https://images.footlocker.com/is/image/FLEU/${sku}?wid=763&hei=538&fmt=png-alpha`;
  }

  log(`FL result: name="${scraped.name}", sale="${scraped.salePrice}", retail="${scraped.retailPrice}"`);
  log(`FL sizes: ${scraped.sizes.length} available, ${scraped.soldOutSizes} sold out, ${scraped.totalSizes} total`);
  log(`FL image: ${image}`);

  return {
    name: scraped.name || '', image,
    salePrice: scraped.salePrice || '', retailPrice: scraped.retailPrice || '',
    sizes: scraped.sizes || [],
    allSizeData: [], // Not needed since JSON-LD gives clean data
    description: scraped.description || '', colorway: scraped.colorway || '',
    styleCode: sku, brand: scraped.brand || '',
    _totalSizes: scraped.totalSizes, _soldOut: scraped.soldOutSizes,
  };
}

// ===== GENERIC SCRAPER (non-FL stores, uses regular Playwright) =====
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
    const currency = isFootLocker(domain) ? getFlCurrency(domain) : detectCurrency(domain);

    console.log(`\n  [${i + 1}/${urls.length}] ${storeInfo.flag} ${storeInfo.name}`);
    console.log(`  ${url}`);

    try {
      const scraped = await scrapePage(url, config);

      const name = scraped.name || 'Unknown Product';
      const brand = scraped.brand || detectBrand(name);
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
      if (scraped._totalSizes) {
        console.log(`     Stock: ${validSizes.length} available, ${scraped._soldOut || 0} sold out of ${scraped._totalSizes} total`);
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

  // Close browsers
  if (_browser) { await _browser.close(); _browser = null; }
  if (_patchrightBrowser) { await _patchrightBrowser.close(); _patchrightBrowser = null; }

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
  if (_patchrightBrowser) _patchrightBrowser.close();
  process.exit(1);
});
