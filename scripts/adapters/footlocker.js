/**
 * FASHION. — Foot Locker Adapter
 * ================================
 * Store: footlocker.nl, footlocker.co.uk, footlocker.de, etc.
 * Method: Patchright (Cloudflare)
 * JSON-LD: Product with multiple Offer objects (one per size)
 *
 * VERIFIED via recon (2026-02-13):
 * - Retail price: <span class="font-caption line-through">€ 129,99</span>
 *   NOT inside ProductDetails/ProductPrice — just exclude ProductCard
 * - Fallback: "Bespaar € 69" badge → retailPrice = salePrice + savings
 * - Sale price: <span class="font-medium text-sale_red">€ 60,00</span>
 * - Sizes: JSON-LD offers[].sku suffix (already EU), filter InStock
 * - Brand: JSON-LD brand (plain string)
 * - Image: JSON-LD image (images.footlocker.com)
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

    // 1. Retail price — first span with class "line-through" containing €/£/$
    //    Exclude ProductCard elements (recommended products section)
    const allLineThrough = document.querySelectorAll('span.line-through');
    for (const el of allLineThrough) {
      const text = el.textContent.trim();
      if (text.includes('\u20ac') || text.includes('\u00a3') || text.includes('$')) {
        // Skip if inside a ProductCard (recommended items)
        const inCard = el.closest('[class*="ProductCard"]');
        if (!inCard) {
          result.retailPrice = text;
          break;
        }
      }
    }

    // 2. Fallback: parse "Bespaar € X" / "Save £X" badge
    //    retailPrice = salePrice + savings
    if (!result.retailPrice) {
      const allSpans = document.querySelectorAll('span');
      for (const span of allSpans) {
        const text = span.textContent.trim();
        const match = text.match(/(?:Bespaar|Save|Spare|\u00c9conomisez)\s*[\u20ac\u00a3$]\s*([\d.,]+)/i);
        if (match) {
          result._savings = match[1];
          break;
        }
      }
    }

    // 3. Sale price from DOM (backup)
    const saleEl = document.querySelector('span.text-sale_red, [class*="text-sale"]');
    if (saleEl) {
      result.salePrice = saleEl.textContent.trim();
    }

    // 4. Colorway
    const colorEl = document.querySelector('[class*="ProductColor"], [data-testid="product-color"]');
    if (colorEl) result.colorway = colorEl.textContent.trim();

    // 5. Sizes from DOM (backup — JSON-LD offers[] is primary)
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
  let retailPriceNum = parsePrice(raw.retailPrice);

  // Fallback: calculate retail from savings badge
  if (!retailPriceNum && raw._savings && salePriceNum) {
    const savings = parsePrice(raw._savings);
    if (savings) {
      retailPriceNum = salePriceNum + savings;
      log(`Retail calculated from savings badge: ${retailPriceNum}`);
    }
  }

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
