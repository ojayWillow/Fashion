/**
 * FASHION. — Unified Scraper
 * ============================
 * Single entry point: scrapePage(url, config)
 * Routes to Foot Locker (Patchright) or generic (Playwright) automatically.
 *
 * Browser instances are cached and reused across calls.
 * Call closeBrowsers() when done.
 */

const { extractDomain } = require('./helpers');
const { isFootLocker } = require('./stores');

let _browser = null;
let _patchrightBrowser = null;

// =====================================================================
// BROWSER MANAGEMENT
// =====================================================================

async function getBrowser() {
  if (_browser) return _browser;
  const { chromium } = require('playwright');
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

async function getPatchrightBrowser() {
  if (_patchrightBrowser) return _patchrightBrowser;
  try {
    const { chromium } = require('patchright');
    _patchrightBrowser = await chromium.launch({ headless: false });
    return _patchrightBrowser;
  } catch (e) {
    return null;
  }
}

/**
 * Close all cached browser instances. Call this when done scraping.
 */
async function closeBrowsers() {
  if (_browser) { await _browser.close().catch(() => {}); _browser = null; }
  if (_patchrightBrowser) { await _patchrightBrowser.close().catch(() => {}); _patchrightBrowser = null; }
}

// =====================================================================
// COOKIE DISMISSAL
// =====================================================================

const COOKIE_SELECTORS = [
  '#onetrust-accept-btn-handler',
  'button[id*="accept"]', 'button[id*="cookie"]', 'button[id*="consent"]',
  'button[class*="accept"]', 'button[class*="consent"]',
  '[data-testid*="accept"]', '[data-testid*="cookie"]',
  'button:has-text("Accept")', 'button:has-text("Accepteren")',
  'button:has-text("Accept All")', 'button:has-text("Alle akkoord")',
];

async function dismissCookies(page) {
  for (const sel of COOKIE_SELECTORS) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        await page.waitForTimeout(1000);
        return true;
      }
    } catch {}
  }
  return false;
}

// =====================================================================
// FOOT LOCKER SCRAPER (Patchright — bypasses Kasada)
// =====================================================================

function extractFlSku(url) {
  const m1 = url.match(/(\d{10,15})\.html/);
  if (m1) return m1[1];
  const m2 = url.match(/[\/\-](\d{10,15})(?:\?|$)/);
  if (m2) return m2[1];
  return null;
}

async function scrapeFootLocker(url) {
  const sku = extractFlSku(url);
  if (!sku) throw new Error(`Could not extract SKU from FL URL: ${url}`);

  const browser = await getPatchrightBrowser();
  if (!browser) throw new Error('Patchright not available — needed for Foot Locker');

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {}

  await page.waitForTimeout(8000);
  await dismissCookies(page);

  const scraped = await page.evaluate(() => {
    const data = {
      name: '', image: '', salePrice: '', retailPrice: '',
      sizes: [], totalSizes: 0, soldOutSizes: 0,
      description: '', colorway: '', brand: '',
    };

    // JSON-LD structured data (most reliable for FL)
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
    } catch {}

    // Fallback: DOM extraction
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

    // Retail price from crossed-out text
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

    // Sizes from DOM if JSON-LD missed them
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
          if (style.color === 'rgb(117, 117, 117)') return;
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

  // Build best image URL
  let image = scraped.image || '';
  if (image && !image.includes('wid=')) {
    image = image.split('?')[0] + '?wid=763&hei=538&fmt=png-alpha';
  }
  if (!image) {
    image = `https://images.footlocker.com/is/image/FLEU/${sku}?wid=763&hei=538&fmt=png-alpha`;
  }

  return {
    name: scraped.name || '', image,
    salePrice: scraped.salePrice || '', retailPrice: scraped.retailPrice || '',
    sizes: scraped.sizes || [],
    description: scraped.description || '', colorway: scraped.colorway || '',
    styleCode: sku, brand: scraped.brand || '',
    _totalSizes: scraped.totalSizes, _soldOut: scraped.soldOutSizes,
  };
}

// =====================================================================
// GENERIC SCRAPER (Playwright — headless)
// =====================================================================

async function scrapeGeneric(url, config) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8' });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {}

  await page.waitForTimeout(config.waitTime || 4000);
  await dismissCookies(page);

  const data = await page.evaluate((config) => {
    const result = {
      name: '', image: '', salePrice: '', retailPrice: '',
      sizes: [], description: '', colorway: '', styleCode: '',
    };

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
        } catch {}
      }
      return '';
    }

    // Name
    result.name = trySelectors(config.nameSelectors);

    // Image — og:image first, then config selectors
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
              const best = urls[urls.length - 1];
              if (best && best.startsWith('http')) { result.image = best; break; }
            }
          } else {
            const src = el.src || el.getAttribute('data-src');
            if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('svg')) {
              result.image = src; break;
            }
          }
        } catch {}
      }
    }

    // Fallback: ANY large product image
    if (!result.image) {
      const allImgs = [...document.querySelectorAll('img')];
      for (const img of allImgs) {
        const src = img.src || img.getAttribute('data-src');
        if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('svg') && !src.includes('icon') && !src.includes('flag') && !src.includes('banner')) {
          if (img.naturalWidth > 200 || img.width > 200 || src.includes('product') || src.includes('media') || src.includes('catalog')) {
            result.image = src; break;
          }
        }
      }
    }

    // Prices
    result.salePrice = trySelectors(config.priceSelectors);
    result.retailPrice = trySelectors(config.retailPriceSelectors);

    // JSON-LD fallback for prices
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
      } catch {}
    }

    // Sizes
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
      } catch {}
    }

    // Description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) result.description = metaDesc.getAttribute('content') || '';

    // Colorway
    const colorSels = [
      '[class*="color-name"]', '[class*="ColorName"]',
      '[class*="colorway"]', '[class*="Colorway"]',
      '[class*="product-color"]', '[class*="ProductColor"]',
    ];
    result.colorway = trySelectors(colorSels);

    // Style code
    const styleSels = [
      '[class*="style-code"]', '[class*="StyleCode"]',
      '[class*="product-code"]', '[class*="ProductCode"]',
      '[class*="article-number"]', '[class*="sku"]',
      '[data-testid*="style"]', '[data-testid*="sku"]',
    ];
    result.styleCode = trySelectors(styleSels);

    return result;
  }, config);

  // Screenshot fallback for image
  if (!data.image) {
    const selectors = config.imageSelectors.filter(s => !s.includes('meta'));
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const box = await el.boundingBox();
          if (box && box.width > 100 && box.height > 100) {
            const screenshotBuffer = await el.screenshot();
            data._screenshotBuffer = screenshotBuffer.toString('base64');
            break;
          }
        }
      } catch {}
    }
  }

  await page.close();
  return data;
}

// =====================================================================
// PUBLIC API
// =====================================================================

/**
 * Scrape a product page. Automatically routes to the correct scraper.
 *
 * @param {string} url - Product URL
 * @param {object} config - Store config (from loadStoreConfig)
 * @returns {Promise<object>} Scraped product data
 */
async function scrapePage(url, config) {
  const domain = extractDomain(url);
  if (isFootLocker(domain)) {
    return await scrapeFootLocker(url);
  }
  return await scrapeGeneric(url, config);
}

module.exports = { scrapePage, closeBrowsers, getBrowser, getPatchrightBrowser };
