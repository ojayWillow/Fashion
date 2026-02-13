/**
 * FASHION. — END. Clothing Adapter
 * ==================================
 * Store: endclothing.com
 * Method: Playwright (browser)
 * JSON-LD: ProductGroup with hasVariant
 *
 * END. quirks:
 * - Uses ProductGroup JSON-LD with detailed priceSpecification
 * - Strikethrough price type: "https://schema.org/StrikethroughPrice"
 * - Variants include size in the name (e.g. "Product Name - 42")
 * - Style codes from productGroupId
 * - Images from their CDN with high quality
 * - GBP pricing by default, but EU pages use EUR
 * - Cookie consent modal needs dismissing
 * - Sale section: endclothing.com/gb/sale
 */

const { log, detectBrand, detectCategory, detectTags, parsePrice, buildPrice, calcDiscount, normalizeSizes, isValidSize } = require('../lib/helpers');

/**
 * Post-process raw JSON-LD data from END. pages.
 */
function postProcess(raw, store) {
  const brand = raw.brand || detectBrand(raw.name);
  const currency = raw.currency || store.currency || 'GBP';
  const salePriceNum = parsePrice(raw.salePrice);
  const retailPriceNum = parsePrice(raw.retailPrice);
  const discount = calcDiscount(retailPriceNum, salePriceNum);

  // END. sizes: already from JSON-LD variants, validate
  const validSizes = (raw.sizes || []).filter(s => isValidSize(s));
  // END. UK site gives UK sizes, convert
  const normalizedSizes = normalizeSizes(validSizes, 'END. Clothing', raw.name);

  const tags = detectTags(raw.name, brand);
  const category = detectCategory(raw.name, tags);

  // END. image cleanup — get highest quality
  let image = raw.image || '';
  if (image.includes('endclothing.com')) {
    // Remove any size params to get full res
    image = image.replace(/\?.*$/, '');
  }

  return {
    name: raw.name || 'Unknown Product',
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
 * Scrape END. sale page for product URLs.
 */
async function scrapeSalePage(page) {
  await page.goto('https://www.endclothing.com/gb/sale', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Dismiss cookie banner
  try {
    const cookieBtn = await page.$('#onetrust-accept-btn-handler');
    if (cookieBtn) {
      await cookieBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch (e) {}

  // Scroll to load products
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1200);
  }

  const urls = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/product/"]');
    const urlSet = new Set();
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href) {
        const full = href.startsWith('http') ? href : `https://www.endclothing.com${href}`;
        urlSet.add(full);
      }
    }
    return [...urlSet];
  });

  log(`END. sale page: found ${urls.length} product URLs`);
  return urls;
}

module.exports = { postProcess, scrapeSalePage };
