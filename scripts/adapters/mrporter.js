/**
 * FASHION. — MR PORTER Adapter
 * ===============================
 * Store: mrporter.com
 * Method: Patchright (anti-bot protection)
 * JSON-LD: ProductGroup with hasVariant
 *
 * MR PORTER quirks:
 * - Heavy anti-bot → Patchright required
 * - Brand listed as "designer" in their data model
 * - Uses GBP by default, EUR for /en-xx/ locales
 * - Mix of sneakers, clothing, and accessories
 * - Sizes vary: EU for shoes, letter sizes for clothing
 * - High quality product images from their CDN
 * - Product names often include brand prefix
 * - Color listed as part of the product variant
 * - Sale section: mrporter.com/en-xx/sale
 */

const { log, detectBrand, detectCategory, detectTags, parsePrice, buildPrice, calcDiscount, normalizeSizes, isValidSize } = require('../lib/helpers');

/**
 * Clean MR PORTER product name.
 * MR PORTER often prefixes with the brand name redundantly.
 * E.g. "NIKE Air Max 95" when brand is already "Nike"
 */
function cleanName(name, brand) {
  let cleaned = (name || '').trim();

  // Remove brand prefix if it's redundant
  if (brand) {
    const brandUpper = brand.toUpperCase();
    if (cleaned.toUpperCase().startsWith(brandUpper + ' ')) {
      cleaned = cleaned.substring(brand.length).trim();
    }
  }

  // Remove size suffix from variant names
  cleaned = cleaned
    .replace(/\s*-\s*(XXS|XS|S|M|L|XL|XXL|\d{1,2}(\.5)?)\s*$/i, '')
    .trim();

  return cleaned;
}

/**
 * Post-process raw JSON-LD data from MR PORTER pages.
 */
function postProcess(raw, store) {
  let brand = raw.brand || detectBrand(raw.name);

  // MR PORTER sometimes uses all-caps brand names
  if (brand === brand.toUpperCase() && brand.length > 3) {
    brand = brand.charAt(0) + brand.slice(1).toLowerCase();
  }

  const cleanedName = cleanName(raw.name, brand);
  const currency = raw.currency || store.currency || 'GBP';
  const salePriceNum = parsePrice(raw.salePrice);
  const retailPriceNum = parsePrice(raw.retailPrice);
  const discount = calcDiscount(retailPriceNum, salePriceNum);

  // MR PORTER: clothing uses letter sizes, shoes use EU/UK/IT
  const validSizes = (raw.sizes || []).filter(s => isValidSize(s));
  const normalizedSizes = normalizeSizes(validSizes, 'MR PORTER', cleanedName);

  const tags = detectTags(cleanedName, brand);
  const category = detectCategory(cleanedName, tags);

  // MR PORTER image cleanup
  let image = raw.image || '';
  if (image.includes('mrporter.com') || image.includes('net-a-porter.com')) {
    // Get highest resolution version
    image = image.replace(/_in_pp\.jpg/, '_in_xl.jpg');
    image = image.replace(/\?.*$/, '');
  }

  return {
    name: cleanedName || raw.name || 'Unknown Product',
    brand,
    styleCode: raw.styleCode || '',
    colorway: raw.colorway || '',
    category,
    tags,
    image,
    description: raw.description || '',
    retailPrice: buildPrice(retailPriceNum, currency),
    salePrice: buildPrice(salePriceNum, currency),
    discount,
    sizes: normalizedSizes,
  };
}

/**
 * Scrape MR PORTER sale page for product URLs.
 */
async function scrapeSalePage(page) {
  await page.goto('https://www.mrporter.com/en-gb/mens/sale', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Scroll to load products
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1500);
  }

  const urls = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/product/"]');
    const urlSet = new Set();
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href) {
        const full = href.startsWith('http') ? href : `https://www.mrporter.com${href}`;
        urlSet.add(full);
      }
    }
    return [...urlSet];
  });

  log(`MR PORTER sale page: found ${urls.length} product URLs`);
  return urls;
}

module.exports = { postProcess, scrapeSalePage, cleanName };
