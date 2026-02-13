/**
 * FASHION. — SNS (Sneakersnstuff) Adapter
 * ==========================================
 * Store: sneakersnstuff.com
 * Method: Patchright (Cloudflare Turnstile)
 * JSON-LD: ProductGroup with hasVariant
 *
 * VERIFIED via recon (2026-02-13):
 * - Anti-bot: Cloudflare Turnstile → Patchright required
 * - Sale price: JSON-LD offers.price (e.g. "105.00" EUR)
 * - Retail price: NOT in JSON-LD → DOM only: <s class="price__original">€140</s>
 * - Sizes: JSON-LD variant names as US ("All-Pro Nitro 2 E.T. - 7") → need US→EU
 * - Style code: from SKU prefix ("312313-01-7" → "312313-01")
 * - Brand: JSON-LD brand.name ✅
 * - Image: JSON-LD variant image (cdn/shop/files/...) ✅
 * - Offers: simple Offer type, no priceSpecification
 */

const { log, detectBrand, detectCategory, detectTags, parsePrice, buildPrice, calcDiscount, normalizeSizes, isValidSize } = require('../lib/helpers');

/**
 * Extract style code from SKU.
 * SNS SKU format: "312313-01-7" → style code is everything before the last "-"
 * But style codes can contain dashes, so we match the known pattern.
 * Pattern: letters/numbers + dash + numbers at the end is the size.
 */
function extractStyleCodeFromSku(sku) {
  if (!sku) return '';
  // Match: everything up to the last segment which is a size number
  // "312313-01-7" → "312313-01"
  // "312313-01-10.5" → "312313-01"
  const match = sku.match(/^(.+)-\d+(\.5)?$/);
  return match ? match[1] : sku;
}

/**
 * Extract US size from JSON-LD variant name.
 * "All-Pro Nitro 2 E.T. - 7" → "7"
 * "All-Pro Nitro 2 E.T. - 10.5" → "10.5"
 */
function extractSizeFromVariantName(name) {
  const match = (name || '').match(/\s-\s(\d+\.?\d*)$/);
  return match ? match[1] : '';
}

/**
 * Extract retail price from DOM.
 * SNS uses: <s class="price__original">€140</s>
 * inside:  <p class="product-view__price price price--discount">
 */
async function extractRetailPriceFromDOM(page) {
  return await page.evaluate(() => {
    const el = document.querySelector('s.price__original');
    if (el) return el.textContent.trim();
    // Fallback: any <s> inside a price container
    const fallback = document.querySelector('.product-view__price s, .price--discount s');
    if (fallback) return fallback.textContent.trim();
    return null;
  });
}

/**
 * Post-process raw JSON-LD data from SNS pages.
 * Called by base adapter after generic extraction.
 */
function postProcess(raw, store) {
  // Style code from first variant SKU
  const styleCode = raw.styleCode || '';
  const brand = raw.brand || detectBrand(raw.name);
  const currency = raw.currency || 'EUR';
  const salePriceNum = parsePrice(raw.salePrice);
  const retailPriceNum = parsePrice(raw.retailPrice);
  const discount = calcDiscount(retailPriceNum, salePriceNum);

  // SNS sizes come as US numbers from JSON-LD → prefix with "US " for normalization
  const prefixedSizes = (raw.sizes || []).map(s => {
    // If it's a bare number (from variant name), prefix with US
    const num = parseFloat(s);
    if (!isNaN(num) && num < 20) return 'US ' + s;
    return s;
  });
  const validSizes = prefixedSizes.filter(s => isValidSize(s));
  const normalizedSizes = normalizeSizes(validSizes, 'SNS', raw.name);

  // Clean name: remove size suffix from variant name
  const cleanedName = (raw.name || '').replace(/\s-\s\d+(\.5)?$/, '').trim();

  const tags = detectTags(cleanedName, brand);
  const category = detectCategory(cleanedName, tags);

  return {
    name: cleanedName,
    brand,
    styleCode,
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
}

/**
 * SNS-specific extraction that runs BEFORE base JSON-LD.
 * Grabs retail price from DOM since it's not in JSON-LD.
 */
async function extractFromDOM(page) {
  return await page.evaluate(() => {
    const result = {
      retailPrice: null,
    };

    // Retail price from strikethrough element
    const retailEl = document.querySelector('s.price__original');
    if (retailEl) {
      result.retailPrice = retailEl.textContent.trim();
    } else {
      // Fallback
      const fallback = document.querySelector('.product-view__price s, .price--discount s');
      if (fallback) result.retailPrice = fallback.textContent.trim();
    }

    return result;
  });
}

/**
 * Scrape SNS sale page to get all product URLs.
 */
async function scrapeSalePage(page) {
  await page.goto('https://www.sneakersnstuff.com/en-eu/sale', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1500);
  }

  const urls = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/products/"]');
    const urlSet = new Set();
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.includes('/products/')) {
        const full = href.startsWith('http') ? href : `https://www.sneakersnstuff.com${href}`;
        urlSet.add(full);
      }
    }
    return [...urlSet];
  });

  log(`SNS sale page: found ${urls.length} product URLs`);
  return urls;
}

module.exports = { postProcess, extractFromDOM, scrapeSalePage, extractStyleCodeFromSku, extractSizeFromVariantName };
