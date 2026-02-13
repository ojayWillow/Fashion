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
 *   3. Wait for content readiness (JSON-LD or price elements)
 *   4. Extract raw data via JSON-LD + DOM (shared)
 *   5. If adapter has extractFromDOM and JSON-LD is incomplete → DOM fallback
 *   6. Run adapter's postProcess() or generic normalization
 *   7. Return normalized product data
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
 * Wait for Cloudflare Turnstile / anti-bot to resolve.
 * Checks title is not a challenge page.
 */
async function waitForCloudflare(page, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const title = await page.title();
    if (title !== 'Just a moment...' && !title.includes('Attention') && title !== 'Access Denied' && title.length > 5) {
      log(`Cloudflare bypassed (${Math.round((Date.now() - start) / 1000)}s)`);
      return true;
    }
    await page.waitForTimeout(1000);
  }
  log('Cloudflare bypass timeout');
  return false;
}

/**
 * Wait for product content to be ready (JS hydration).
 * Checks for JSON-LD scripts or price-related elements.
 * This is critical when pages load fast in a shared browser session.
 */
async function waitForContent(page, maxWait = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const ready = await page.evaluate(() => {
      // Check 1: JSON-LD with product data
      const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLd) {
        try {
          const data = JSON.parse(script.textContent);
          if (data['@type'] === 'Product' || data['@type'] === 'ProductGroup') return true;
        } catch {}
      }
      // Check 2: Price elements in DOM
      const priceEls = document.querySelectorAll('[class*="rice"], [class*="Price"]');
      for (const el of priceEls) {
        const text = el.textContent.trim();
        if (text.match(/[\u20ac\u00a3$]\s*\d/)) return true;
      }
      return false;
    });
    if (ready) {
      log(`Content ready (${Math.round((Date.now() - start) / 1000)}s after bypass)`);
      // Extra settle time for remaining JS (size selectors, images, etc.)
      await page.waitForTimeout(2000);
      return true;
    }
    await page.waitForTimeout(500);
  }
  log('Content readiness timeout — proceeding anyway');
  await page.waitForTimeout(2000);
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

  if (usePatchright) {
    const passed = await waitForCloudflare(page);
    if (!passed) {
      log('WARNING: Cloudflare may not have been bypassed');
    }
    // Wait for actual product content to render
    await waitForContent(page);
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

          // Clean name: remove color suffix too
          // MR PORTER: "Logo T-Shirt - black - XS" → after size strip: "Logo T-Shirt - black"
          result.name = result.name.replace(/\s*-\s*[a-z]+\s*$/i, function(match) {
            const word = match.replace(/[\s-]/g, '').toLowerCase();
            const colors = ['black','white','red','blue','green','grey','gray','navy',
              'beige','brown','cream','pink','orange','yellow','purple','khaki',
              'olive','tan','ivory','charcoal','burgundy','maroon','teal','coral',
              'sand','stone','ecru','natural','multi','multicolor'];
            return colors.includes(word) ? '' : match;
          }).trim();

          if (ld.brand && ld.brand.name) result.brand = ld.brand.name;
          if (ld.productGroupId) result.styleCode = ld.productGroupId;
          if (ld.description) result.description = ld.description.substring(0, 300);

          // Image — handle string, ImageObject, and arrays of either
          if (first.image) {
            const imgArr = Array.isArray(first.image) ? first.image : [first.image];
            const img = imgArr[0];
            result.image = typeof img === 'string' ? img : (img.url || img.contentUrl || '');
          }

          // Color — prefer first variant's color field
          if (first.color) {
            result.colorway = first.color.charAt(0).toUpperCase() + first.color.slice(1);
          }

          // Sizes from variants — priority: v.size > name suffix > sku suffix
          const inStock = variants.filter(v =>
            v.offers && v.offers.availability && v.offers.availability.includes('InStock')
          );
          result.sizes = inStock.map(v => {
            // 1. Explicit size field (MR PORTER)
            if (v.size) return v.size;
            // 2. Size from variant name suffix: "Product Name - 42"
            if (v.name) {
              const m = v.name.match(/\s-\s(XXS|XS|S|M|L|XL|XXL|\d{1,2}(\.5)?)$/i);
              if (m) return m[1].trim();
            }
            // 3. Size from SKU suffix: "SKU-42"
            if (v.sku) {
              const parts = v.sku.split('-');
              const last = parts[parts.length - 1];
              const num = parseFloat(last);
              if (!isNaN(num) && num >= 4 && num <= 55) return last;
            }
            return '';
          }).filter(Boolean);

          // Style code from first SKU if not from productGroupId
          if (!result.styleCode && first.sku) {
            const skuMatch = first.sku.match(/^(.+)-\d+(\.5)?$/);
            if (skuMatch) result.styleCode = skuMatch[1];
          }

          // Prices from priceSpecification or offers.price
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

          // Brand: can be string (Foot Locker) or object (END.)
          if (ld.brand) {
            if (typeof ld.brand === 'string') {
              result.brand = ld.brand;
            } else if (ld.brand.name) {
              result.brand = ld.brand.name;
            }
          }

          if (ld.sku) result.styleCode = ld.sku;
          if (ld.model) result.model = ld.model;

          if (ld.image) {
            const imgArr = Array.isArray(ld.image) ? ld.image : [ld.image];
            const img = imgArr[0];
            result.image = typeof img === 'string' ? img : (img.url || img.contentUrl || '');
          }
          if (ld.description) result.description = (ld.description || '').substring(0, 300);

          // Offers: single or array
          if (ld.offers) {
            const offers = Array.isArray(ld.offers) ? ld.offers : [ld.offers];

            // Price from first offer
            if (offers[0]) {
              if (offers[0].price) result.salePrice = String(offers[0].price);
              if (offers[0].priceCurrency) result.currency = offers[0].priceCurrency;
            }

            // Sizes from multiple offers (Foot Locker pattern)
            if (offers.length > 1) {
              const inStockSizes = [];
              for (const offer of offers) {
                if (offer.availability && offer.availability.includes('InStock') && offer.sku) {
                  const parts = offer.sku.split('-');
                  const lastPart = parts[parts.length - 1];
                  const num = parseFloat(lastPart);
                  if (!isNaN(num) && num >= 4 && num <= 55) {
                    inStockSizes.push(lastPart);
                  }
                }
              }
              if (inStockSizes.length > 0) result.sizes = inStockSizes;
            }
          }
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
          _savings: domData._savings || '',
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
