/**
 * FASHION. — Base Adapter
 * ========================
 * Shared extraction logic for all stores.
 * Opens pages with Playwright or Patchright, extracts product
 * data from JSON-LD, meta tags, and DOM selectors.
 *
 * Adapter resolution order:
 *   1. Check domain → load store-specific adapter if exists
 *   2. Wait for Cloudflare bypass (if Patchright)
 *   3. Extract raw data via JSON-LD + DOM (shared)
 *   4. If adapter has extractFromDOM and JSON-LD is incomplete → DOM fallback
 *   5. Run adapter's postProcess() or generic normalization
 *   6. Return normalized product data
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
  if (ADAPTER_MAP[domainLower]) return ADAPTER_MAP[domainLower]();
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

process.on('exit', () => { closeBrowsers().catch(() => {}); });
process.on('SIGINT', () => { closeBrowsers().then(() => process.exit()); });

// ===== PAGE HELPERS =====

/**
 * Wait for Cloudflare Turnstile to resolve.
 * Checks page title — Cloudflare shows "Just a moment..." during challenge.
 * Verified: SNS, END. both use this pattern.
 */
async function waitForCloudflare(page, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const title = await page.title();
    if (title !== 'Just a moment...' && !title.includes('Attention')) {
      log(`Cloudflare bypassed (${Math.round((Date.now() - start) / 1000)}s)`);
      await page.waitForTimeout(2000); // settle time for JS to hydrate
      return true;
    }
    await page.waitForTimeout(1000);
  }
  log('Cloudflare bypass timeout');
  return false;
}

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

  // If using Patchright, wait for Cloudflare to resolve
  if (usePatchright) {
    const passed = await waitForCloudflare(page);
    if (!passed) {
      log('WARNING: Cloudflare may not have been bypassed');
    }
  } else {
    await page.waitForTimeout(4000);
  }

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

        // ProductGroup (SNS, MR PORTER)
        if (ld['@type'] === 'ProductGroup' && ld.hasVariant) {
          const variants = ld.hasVariant || [];
          const first = variants[0] || {};

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

          // Sizes from variant names or SKUs
          const inStock = variants.filter(v =>
            v.offers && v.offers.availability && v.offers.availability.includes('InStock')
          );
          result.sizes = inStock.map(v => {
            if (v.name) {
              const m = v.name.match(/\s-\s(.+)$/);
              if (m) return m[1].trim();
            }
            if (v.sku) {
              const parts = v.sku.split('-');
              return parts[parts.length - 1];
            }
            if (v.size) return v.size;
            return '';
          }).filter(Boolean);

          // Style code from first SKU if not from productGroupId
          if (!result.styleCode && first.sku) {
            const skuMatch = first.sku.match(/^(.+)-\d+(\.5)?$/);
            if (skuMatch) result.styleCode = skuMatch[1];
          }

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

        // Product (END., Foot Locker, generic)
        if (ld['@type'] === 'Product') {
          if (!result.name && ld.name) result.name = ld.name;
          if (ld.brand) result.brand = typeof ld.brand === 'string' ? ld.brand : (ld.brand.name || '');
          if (ld.sku) result.styleCode = ld.sku;
          if (ld.image) {
            const img = Array.isArray(ld.image) ? ld.image[0] : ld.image;
            result.image = typeof img === 'string' ? img : (img.url || '');
          }
          if (ld.description) result.description = (ld.description || '').substring(0, 300);

          if (ld.offers) {
            const offers = Array.isArray(ld.offers) ? ld.offers : [ld.offers];
            if (offers[0]) {
              if (offers[0].price) result.salePrice = String(offers[0].price);
              if (offers[0].priceCurrency) result.currency = offers[0].priceCurrency;
            }
            // Try sizes from multiple offers
            if (offers.length > 1) {
              const inStock = [];
              for (const offer of offers) {
                const sku = offer.sku || '';
                const size = sku.split('-').pop();
                if (offer.availability && offer.availability.includes('InStock') && size) {
                  inStock.push(size);
                }
              }
              if (inStock.length > 0) result.sizes = inStock;
            }
          }
          // Don't break — there might be a ProductGroup later
          // But if we got a name, mark that we found Product type
          if (result.name) continue;
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

    return result;
  });
}

// ===== MAIN ADAPTER =====

async function extractWithAdapter(url, domain, store) {
  log(`Opening ${domain} (${store.scrapeMethod})...`);

  const page = await openPage(url, store);
  const adapter = getAdapter(domain);

  try {
    // Step 1: Extract raw data from JSON-LD
    let raw = await extractJsonLd(page);

    // Step 2: Adapter-specific DOM extraction if JSON-LD is incomplete
    if (adapter && adapter.extractFromDOM) {
      const needsDOM = !raw.name || !raw.salePrice || raw.sizes.length === 0 || !raw.retailPrice;
      if (needsDOM) {
        log('JSON-LD incomplete, trying adapter DOM extraction...');
        const domData = await adapter.extractFromDOM(page);

        // Extract colorway from H1 if adapter provides it
        if (domData.h1Text && raw.name) {
          const nameIdx = domData.h1Text.indexOf(raw.name);
          if (nameIdx !== -1) {
            const after = domData.h1Text.substring(nameIdx + raw.name.length).trim();
            const colorway = after.replace(/^[-|\s]+/, '').trim();
            if (colorway) raw.colorway = colorway;
          }
        }

        // Merge: prefer existing non-empty values, fill gaps from DOM
        raw = {
          name: raw.name || (domData.name || ''),
          brand: raw.brand || (domData.brand || ''),
          image: raw.image || (domData.image || ''),
          description: raw.description || (domData.description || ''),
          colorway: raw.colorway || (domData.colorway || ''),
          salePrice: raw.salePrice || (domData.salePrice || ''),
          retailPrice: raw.retailPrice || (domData.retailPrice || ''),
          currency: raw.currency || (domData.currency || ''),
          sizes: raw.sizes.length > 0 ? raw.sizes : (domData.sizes || []),
          styleCode: raw.styleCode || (domData.styleCode || ''),
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
