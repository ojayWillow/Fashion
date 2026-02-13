/**
 * FASHION. — Base Adapter
 * ========================
 * Shared extraction logic for all stores.
 * Opens pages with Playwright or Patchright, extracts product
 * data from JSON-LD, meta tags, and DOM selectors.
 *
 * Store-specific adapters can override postProcess().
 * When no specific adapter exists, this base handles everything.
 *
 * Adapter resolution order:
 *   1. Check domain → load store-specific adapter if exists
 *   2. Extract raw data via JSON-LD + DOM (shared)
 *   3. Run adapter's postProcess() or generic normalization
 *   4. Return normalized product data
 */

const { log, detectBrand, detectCategory, detectTags, parsePrice, buildPrice, calcDiscount, normalizeSizes, isValidSize } = require('../lib/helpers');

// ===== ADAPTER REGISTRY =====
const ADAPTER_MAP = {
  'sneakersnstuff.com': () => require('./sns'),
  'endclothing.com':    () => require('./end'),
  'footlocker.nl':      () => require('./footlocker'),
  'footlocker.co.uk':   () => require('./footlocker'),
  'footlocker.com':     () => require('./footlocker'),
  'footlocker.de':      () => require('./footlocker'),
  'footlocker.fr':      () => require('./footlocker'),
  'mrporter.com':       () => require('./mrporter'),
  'net-a-porter.com':   () => require('./mrporter'),
};

function getAdapter(domain) {
  const domainLower = domain.toLowerCase();
  // Exact match
  if (ADAPTER_MAP[domainLower]) return ADAPTER_MAP[domainLower]();
  // Partial match
  for (const [key, loader] of Object.entries(ADAPTER_MAP)) {
    if (domainLower.includes(key.split('.')[0])) return loader();
  }
  return null;
}

// ===== BROWSER MANAGEMENT =====

let _browser = null;
let _patchrightBrowser = null;

async function getBrowser() {
  if (_browser) return _browser;
  const { chromium } = require('playwright');
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

async function getPatchrightBrowser() {
  if (_patchrightBrowser) return _patchrightBrowser;
  const { chromium } = require('patchright');
  _patchrightBrowser = await chromium.launch({ headless: false });
  return _patchrightBrowser;
}

async function closeBrowsers() {
  if (_browser) { await _browser.close(); _browser = null; }
  if (_patchrightBrowser) { await _patchrightBrowser.close(); _patchrightBrowser = null; }
}

// Auto-close on process exit
process.on('exit', () => { closeBrowsers().catch(() => {}); });
process.on('SIGINT', () => { closeBrowsers().then(() => process.exit()); });

// ===== PAGE HELPERS =====

async function openPage(url, store) {
  const usePatchright = store.scrapeMethod === 'patchright';
  const browser = usePatchright ? await getPatchrightBrowser() : await getBrowser();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  if (!usePatchright) {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
  }

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    log(`Page load timeout, continuing...`);
  }

  // Wait for dynamic content
  const waitTime = usePatchright ? 8000 : 4000;
  await page.waitForTimeout(waitTime);

  // Dismiss cookie banners
  try {
    const cookieSelectors = [
      '#onetrust-accept-btn-handler',
      'button[id*="accept"]',
      'button[id*="cookie"]',
      'button[class*="accept"]',
      '[data-testid*="accept"]',
    ];
    for (const sel of cookieSelectors) {
      const btn = await page.$(sel);
      if (btn) { await btn.click(); await page.waitForTimeout(1000); break; }
    }
  } catch (e) {}

  return page;
}

// ===== JSON-LD EXTRACTION =====

async function extractJsonLd(page) {
  return await page.evaluate(() => {
    const result = { name: '', brand: '', image: '', description: '',
      colorway: '', salePrice: '', retailPrice: '', currency: '',
      sizes: [], styleCode: '' };

    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        let ld;
        try { ld = JSON.parse(script.textContent); } catch { continue; }

        // ProductGroup (END., SNS, MR PORTER)
        if (ld['@type'] === 'ProductGroup' && ld.hasVariant) {
          const variants = ld.hasVariant || [];
          const first = variants[0] || {};

          // Name — from variant, strip size suffix
          result.name = (first.name || ld.name || '')
            .replace(/\s*-\s*(XXS|XS|S|M|L|XL|XXL|\d{1,2}(\.5)?)\s*$/i, '').trim();

          if (ld.brand && ld.brand.name) result.brand = ld.brand.name;
          if (ld.productGroupId) result.styleCode = ld.productGroupId;
          if (ld.description) result.description = ld.description.substring(0, 300);

          // Image
          if (first.image) {
            const img = Array.isArray(first.image) ? first.image[0] : first.image;
            result.image = typeof img === 'string' ? img : (img.url || '');
          }

          // Color
          if (first.color) {
            result.colorway = first.color.charAt(0).toUpperCase() + first.color.slice(1);
          }

          // Sizes (in-stock only)
          const inStock = variants.filter(v =>
            v.offers && v.offers.availability && v.offers.availability.includes('InStock')
          );
          result.sizes = inStock.map(v => {
            if (v.size) return v.size;
            if (v.sku) { const parts = v.sku.split('-'); return parts[parts.length - 1]; }
            if (v.name) { const m = v.name.match(/\s-\s(.+)$/); if (m) return m[1].trim(); }
            return '';
          }).filter(Boolean);

          // Prices
          const priceVariant = inStock[0] || variants[0];
          if (priceVariant && priceVariant.offers) {
            if (priceVariant.offers.priceSpecification) {
              for (const spec of priceVariant.offers.priceSpecification) {
                if (spec.priceCurrency) result.currency = spec.priceCurrency;
                if (spec.priceType && spec.priceType.includes('StrikethroughPrice')) {
                  result.retailPrice = String(spec.price);
                } else if (!spec.priceType) {
                  result.salePrice = String(spec.price);
                }
              }
            } else if (priceVariant.offers.price) {
              result.salePrice = String(priceVariant.offers.price);
              if (priceVariant.offers.priceCurrency) result.currency = priceVariant.offers.priceCurrency;
            }
          }
          break;
        }

        // Product (Foot Locker, generic)
        if (ld['@type'] === 'Product') {
          if (!result.name && ld.name) result.name = ld.name;
          if (ld.brand) result.brand = typeof ld.brand === 'string' ? ld.brand : (ld.brand.name || '');
          if (ld.image) result.image = ld.image;
          if (ld.description) result.description = (ld.description || '').substring(0, 300);

          if (ld.offers) {
            const offers = Array.isArray(ld.offers) ? ld.offers : [ld.offers];

            // Extract sizes from offers
            const inStock = [];
            for (const offer of offers) {
              const sku = offer.sku || '';
              const size = sku.split('-').pop();
              if (offer.availability && offer.availability.includes('InStock') && size) {
                inStock.push(size);
              }
              if (offer.priceCurrency) result.currency = offer.priceCurrency;
            }
            if (inStock.length > 0) result.sizes = inStock;

            if (offers[0] && offers[0].price) result.salePrice = String(offers[0].price);
          }
          break;
        }
      }
    } catch (e) {}

    // Fallbacks from meta tags
    if (!result.name) {
      const h1 = document.querySelector('h1');
      if (h1) result.name = h1.textContent.trim();
    }
    if (!result.image) {
      const og = document.querySelector('meta[property="og:image"]');
      if (og) result.image = og.getAttribute('content') || '';
    }
    if (!result.description) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) result.description = (meta.getAttribute('content') || '').substring(0, 300);
    }

    // Retail price fallback — look for crossed-out price
    if (!result.retailPrice) {
      const crossed = document.querySelector('.price__original') ||
        document.querySelector('[class*="price"] s') ||
        document.querySelector('[class*="price"] del') ||
        document.querySelector('[class*="LineThrough"]');
      if (crossed) {
        const text = crossed.textContent.trim().replace(/[^\d.,]/g, '').replace(',', '.');
        if (text) result.retailPrice = text;
      }
    }

    return result;
  });
}

// ===== MAIN ADAPTER =====

/**
 * Extract product data from any supported store.
 *
 * @param {string} url    - Product page URL
 * @param {string} domain - Extracted domain
 * @param {Object} store  - Store metadata from STORE_MAP
 * @returns {Object} Normalized product data ready for writer
 */
async function extractWithAdapter(url, domain, store) {
  log(`Opening ${domain} (${store.scrapeMethod})...`);

  const page = await openPage(url, store);
  const adapter = getAdapter(domain);

  try {
    // Step 1: Extract raw data from JSON-LD
    let raw = await extractJsonLd(page);

    // Step 2: Foot Locker DOM fallback if JSON-LD is weak
    if (adapter && adapter.extractFromDOM) {
      if (!raw.name || !raw.salePrice || raw.sizes.length === 0) {
        log('JSON-LD insufficient, trying DOM extraction...');
        const domData = await adapter.extractFromDOM(page);
        // Merge: prefer non-empty values
        raw = {
          name: raw.name || domData.name,
          brand: raw.brand || domData.brand,
          image: raw.image || domData.image,
          description: raw.description || domData.description,
          colorway: raw.colorway || domData.colorway,
          salePrice: raw.salePrice || domData.salePrice,
          retailPrice: raw.retailPrice || domData.retailPrice,
          currency: raw.currency || domData.currency,
          sizes: raw.sizes.length > 0 ? raw.sizes : domData.sizes,
          styleCode: raw.styleCode || domData.styleCode,
        };
      }
    }

    await page.close();

    // Step 3: Run adapter's postProcess or generic normalization
    if (adapter && adapter.postProcess) {
      return adapter.postProcess(raw, store);
    }

    // Generic normalization (no specific adapter)
    const brand = raw.brand || detectBrand(raw.name);
    const currency = raw.currency || store.currency;
    const salePriceNum = parsePrice(raw.salePrice);
    const retailPriceNum = parsePrice(raw.retailPrice);
    const discount = calcDiscount(retailPriceNum, salePriceNum);
    const validSizes = (raw.sizes || []).filter(s => isValidSize(s));
    const normalizedSizes = normalizeSizes(validSizes, store.name, raw.name);
    const tags = detectTags(raw.name, brand);
    const category = detectCategory(raw.name, tags);

    return {
      name: raw.name || 'Unknown Product',
      brand,
      styleCode: raw.styleCode || '',
      colorway: raw.colorway || '',
      category,
      tags,
      image: raw.image || '',
      description: raw.description || '',
      retailPrice: buildPrice(retailPriceNum, currency),
      salePrice: buildPrice(salePriceNum, currency),
      discount,
      sizes: normalizedSizes,
    };
  } catch (e) {
    await page.close().catch(() => {});
    throw e;
  }
}

module.exports = { extractWithAdapter, closeBrowsers };
