/**
 * FASHION. — Foot Locker Adapter
 * ================================
 * Store: footlocker.nl, footlocker.co.uk, footlocker.de, etc.
 * Method: Patchright (Cloudflare)
 * JSON-LD: Product with multiple Offer objects (one per size)
 *
 * VERIFIED via recon (2026-02-13):
 * - Anti-bot: Cloudflare (light) → Patchright bypasses in 2s
 * - JSON-LD: Product type with offers[] array
 *   - Each offer has SKU suffix as size: "314217718304-39.5"
 *   - offers.price = sale price (or full price if not on sale)
 *   - offers.availability = InStock/OutOfStock
 *   - brand is a plain string, not an object
 * - Retail price: NOT in JSON-LD → DOM only:
 *     <span class="font-caption line-through">€ 129,99</span>
 *     (Tailwind classes, not semantic names)
 *     Located inside parent with class containing "ProductPrice"
 * - Sale price in DOM:
 *     <span class="font-medium text-sale_red">€ 60,00</span>
 * - Discount badge: "Bespaar € 69" in ProductDetails-header-V2-metadata
 * - Sizes: JSON-LD offers[].sku suffix (already EU format)
 *   Also in DOM as <a class="size-box"> elements
 * - Image: JSON-LD image (images.footlocker.com/is/image/EBFL2/...)
 * - No H1 in DOM, no data-testid for prices
 * - Model number in JSON-LD: ld.model (e.g. "194969")
 */

const { log, detectBrand, detectCategory, detectTags, parsePrice, buildPrice, calcDiscount, normalizeSizes, isValidSize, detectCurrency } = require('../lib/helpers');

/**
 * DOM-based extraction for Foot Locker.
 * Primarily needed for retail price (not in JSON-LD).
 */
async function extractFromDOM(page) {
  return await page.evaluate(() => {
    const result = {
      name: '', brand: '', image: '', description: '',
      salePrice: '', retailPrice: '', currency: '',
      sizes: [], styleCode: '', colorway: '',
    };

    // 1. Retail price — span with line-through (Tailwind class)
    //    First one in the product details area is the main product retail price
    //    (Others may be from recommended products below)
    const allLineThrough = document.querySelectorAll('span.line-through');
    for (const el of allLineThrough) {
      const text = el.textContent.trim();
      // Must contain a currency symbol and be in the product details area
      if (text.includes('€') || text.includes('£') || text.includes('$')) {
        // Check if it's in the main product area (not a product card)
        const parent = el.closest('[class*="ProductDetails"], [class*="ProductPrice"]');
        const inCard = el.closest('[class*="ProductCard"]');
        if (!inCard) {
          result.retailPrice = text;
          break;
        }
      }
    }

    // 2. Sale price from DOM (backup — JSON-LD usually has this)
    const saleEl = document.querySelector('span.text-sale_red, [class*="text-sale"]');
    if (saleEl) {
      result.salePrice = saleEl.textContent.trim();
    }

    // 3. Colorway
    const colorEl = document.querySelector('[class*="ProductColor"], [data-testid="product-color"]');
    if (colorEl) result.colorway = colorEl.textContent.trim();

    // 4. Sizes from DOM (backup — JSON-LD offers[] is primary)
    const sizeLinks = document.querySelectorAll('a.size-box');
    for (const link of sizeLinks) {
      const text = link.textContent.trim();
      if (text && /^\d{2,3}(\.5)?$/.test(text)) {
        result.sizes.push(text);
      }
    }

    return result;
  });
}

/**
 * Post-process Foot Locker data.
 */
function postProcess(raw, store) {
  const brand = raw.brand || detectBrand(raw.name);
  const currency = raw.currency || store.currency || 'EUR';
  const salePriceNum = parsePrice(raw.salePrice);
  const retailPriceNum = parsePrice(raw.retailPrice);
  const discount = calcDiscount(retailPriceNum, salePriceNum);

  // Foot Locker sizes are already EU format from JSON-LD
  // Prefix with "EU " if they're bare numbers >= 35
  const prefixedSizes = (raw.sizes || []).map(s => {
    const num = parseFloat(s);
    if (!isNaN(num) && num >= 35) return 'EU ' + s;
    return s;
  });
  const validSizes = prefixedSizes.filter(s => isValidSize(s));
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
