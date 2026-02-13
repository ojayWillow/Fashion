/**
 * FASHION. — SNS (Sneakersnstuff) Adapter
 * ==========================================
 * Store: sneakersnstuff.com
 * Method: Playwright (browser)
 * JSON-LD: ProductGroup with hasVariant
 *
 * SNS quirks:
 * - Sale page: sneakersnstuff.com/en-eu/sale
 * - Style code is in the product name after " - " (e.g. "Puma Speedcat OG - 398846-56")
 * - Sizes come as EU from JSON-LD variants
 * - Uses priceSpecification with StrikethroughPrice for retail
 * - Image URLs need no special handling (their CDN works)
 * - Sale items have /en-eu/ locale prefix
 */

const { log, detectBrand, detectCategory, detectTags, parsePrice, buildPrice, calcDiscount, normalizeSizes, isValidSize } = require('../lib/helpers');

/**
 * Extract style code from SNS product name.
 * SNS format: "Brand Name Product Name - STYLECODE"
 * Example: "Puma Speedcat OG - 398846-56" → "398846-56"
 */
function extractStyleCode(name) {
  const match = (name || '').match(/\s-\s([A-Za-z0-9][-A-Za-z0-9]+)$/);
  return match ? match[1] : '';
}

/**
 * Clean SNS product name by removing brand prefix duplication.
 * SNS sometimes returns: "Jordan Air Jordan 5 Retro" or "adidas Originals Samba"
 * We keep the full name but clean up obvious redundancies.
 */
function cleanName(name) {
  return (name || '')
    .replace(/\s*-\s*[A-Za-z0-9][-A-Za-z0-9]+$/, '')  // Remove style code suffix
    .replace(/^(Nike Sportswear|Nike Running|adidas Originals|adidas Basketball|Jordan)\s+/, (match) => {
      // Keep these as-is — they provide context
      return match;
    })
    .trim();
}

/**
 * Post-process raw JSON-LD data from SNS pages.
 * Called by base adapter after generic extraction.
 */
function postProcess(raw, store) {
  const styleCode = raw.styleCode || extractStyleCode(raw.name);
  const cleanedName = cleanName(raw.name);
  const brand = raw.brand || detectBrand(cleanedName);
  const currency = raw.currency || 'EUR';
  const salePriceNum = parsePrice(raw.salePrice);
  const retailPriceNum = parsePrice(raw.retailPrice);
  const discount = calcDiscount(retailPriceNum, salePriceNum);

  // SNS sizes come as EU from JSON-LD — validate and normalize
  const validSizes = (raw.sizes || []).filter(s => isValidSize(s));
  const normalizedSizes = normalizeSizes(validSizes, 'SNS', cleanedName);

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
 * Scrape SNS sale page to get all product URLs.
 * Useful for bulk importing from their sale section.
 *
 * @param {Object} page - Playwright page
 * @returns {string[]} Array of product URLs
 */
async function scrapeSalePage(page) {
  await page.goto('https://www.sneakersnstuff.com/en-eu/sale', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Scroll to load lazy products
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

module.exports = { postProcess, scrapeSalePage, extractStyleCode, cleanName };
