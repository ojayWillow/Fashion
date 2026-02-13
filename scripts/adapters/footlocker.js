/**
 * FASHION. — Foot Locker Adapter
 * ================================
 * Store: footlocker.nl, footlocker.co.uk, footlocker.de, etc.
 * Method: Patchright (anti-bot bypass required)
 * JSON-LD: Product (sometimes missing or minimal)
 *
 * Foot Locker quirks:
 * - Heavy anti-bot protection → requires Patchright (not Playwright)
 * - JSON-LD is often incomplete or missing entirely
 * - Must fall back to DOM selectors for price, sizes, name
 * - Sizes displayed in EU format in the size grid
 * - Sale/retail prices in separate DOM elements
 * - Product images from i8.amplience.net CDN
 * - Style code in the URL or a data attribute
 * - Cookie consent modal always present
 * - Regional domains: .nl, .co.uk, .de, .fr, .com
 */

const { log, detectBrand, detectCategory, detectTags, parsePrice, buildPrice, calcDiscount, normalizeSizes, isValidSize, detectCurrency } = require('../lib/helpers');

/**
 * DOM-based extraction for Foot Locker.
 * Called when JSON-LD is insufficient.
 */
async function extractFromDOM(page) {
  return await page.evaluate(() => {
    const result = {
      name: '', brand: '', image: '', description: '',
      salePrice: '', retailPrice: '', currency: '',
      sizes: [], styleCode: '', colorway: '',
    };

    // Product name
    const nameEl = document.querySelector('[data-testid="product-name"]')
      || document.querySelector('h1.ProductName')
      || document.querySelector('h1[class*="ProductName"]')
      || document.querySelector('h1');
    if (nameEl) result.name = nameEl.textContent.trim();

    // Brand
    const brandEl = document.querySelector('[data-testid="product-brand"]')
      || document.querySelector('.ProductBrand')
      || document.querySelector('span[class*="ProductBrand"]');
    if (brandEl) result.brand = brandEl.textContent.trim();

    // Prices
    const salePriceEl = document.querySelector('[data-testid="product-price"]')
      || document.querySelector('.ProductPrice--sale')
      || document.querySelector('[class*="ProductPrice"][class*="sale"]')
      || document.querySelector('.ProductPrice');
    if (salePriceEl) result.salePrice = salePriceEl.textContent.trim();

    const retailPriceEl = document.querySelector('[data-testid="product-original-price"]')
      || document.querySelector('.ProductPrice--original')
      || document.querySelector('[class*="ProductPrice"][class*="original"]')
      || document.querySelector('.ProductPrice--crossed')
      || document.querySelector('s[class*="price"]')
      || document.querySelector('del');
    if (retailPriceEl) result.retailPrice = retailPriceEl.textContent.trim();

    // Sizes — from size grid buttons
    const sizeButtons = document.querySelectorAll(
      '[data-testid="size-selector"] button:not([disabled]),' +
      '.SizeSelector button:not([disabled]),' +
      '[class*="SizeSelector"] button:not([disabled]),' +
      '.ProductSize button:not([disabled])'
    );
    for (const btn of sizeButtons) {
      const text = btn.textContent.trim();
      if (text && text.length < 10) result.sizes.push(text);
    }

    // If no sizes from buttons, try list items
    if (result.sizes.length === 0) {
      const sizeItems = document.querySelectorAll(
        '[class*="size"] li:not(.unavailable),' +
        '[class*="Size"] li:not(.unavailable)'
      );
      for (const item of sizeItems) {
        const text = item.textContent.trim();
        if (text && text.length < 10) result.sizes.push(text);
      }
    }

    // Image
    const imgEl = document.querySelector('[data-testid="product-image"] img')
      || document.querySelector('.ProductImage img')
      || document.querySelector('[class*="ProductGallery"] img')
      || document.querySelector('.pdp-gallery img');
    if (imgEl) result.image = imgEl.src || imgEl.getAttribute('data-src') || '';
    if (!result.image) {
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg) result.image = ogImg.getAttribute('content') || '';
    }

    // Style code from URL or breadcrumb
    const url = window.location.href;
    const codeMatch = url.match(/\/([A-Z0-9]{5,15})(?:\.html)?(?:\?|$)/i);
    if (codeMatch) result.styleCode = codeMatch[1];

    // Description
    const descEl = document.querySelector('[data-testid="product-description"]')
      || document.querySelector('.ProductDetails__description')
      || document.querySelector('[class*="description"]');
    if (descEl) result.description = descEl.textContent.trim().substring(0, 300);

    // Colorway
    const colorEl = document.querySelector('[data-testid="product-color"]')
      || document.querySelector('.ProductColor')
      || document.querySelector('[class*="ProductColor"]');
    if (colorEl) result.colorway = colorEl.textContent.trim();

    return result;
  });
}

/**
 * Post-process Foot Locker data.
 * Merges JSON-LD + DOM extraction for best coverage.
 */
function postProcess(raw, store) {
  const brand = raw.brand || detectBrand(raw.name);
  const domain = store.slug || '';
  const currency = raw.currency || store.currency || detectCurrency(domain);
  const salePriceNum = parsePrice(raw.salePrice);
  const retailPriceNum = parsePrice(raw.retailPrice);
  const discount = calcDiscount(retailPriceNum, salePriceNum);

  // Foot Locker sizes are already EU format
  const validSizes = (raw.sizes || []).filter(s => isValidSize(s));
  const normalizedSizes = normalizeSizes(validSizes, 'Foot Locker', raw.name);

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
}

module.exports = { postProcess, extractFromDOM };
