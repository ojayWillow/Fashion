/**
 * FASHION. — END. Clothing Adapter
 * ==================================
 * Store: endclothing.com
 * Method: Patchright (Cloudflare Turnstile)
 * JSON-LD: Product (simple Offer, NOT ProductGroup)
 *
 * VERIFIED via recon (2026-02-13):
 * - Anti-bot: Cloudflare Turnstile → Patchright required
 * - JSON-LD type: Product with simple Offer (price = sale price)
 * - Sale price: JSON-LD offers.price (e.g. 60 GBP)
 * - Retail price: NOT in JSON-LD → DOM only:
 *     <span class="DetailsPriceSaleWasSC...">£100</span>
 *     inside <div class="PriceContainerSC...">
 * - Sizes: NOT in JSON-LD → DOM only:
 *     <div data-test-id="Size__Button">UK 4.5</div>
 *     inside <div data-test-id="Size__List">
 *     Format: "UK X" or "UK X.5"
 * - Style code: JSON-LD sku (e.g. "JR4773")
 * - Brand: JSON-LD brand.name (e.g. "Adidas")
 * - Colorway: H1 text minus JSON-LD name (suffix after product name)
 * - Image: JSON-LD image (media.endclothing.com), strip query params for full res
 */

const { log, detectBrand, detectCategory, detectTags, parsePrice, buildPrice, calcDiscount, normalizeSizes, isValidSize } = require('../lib/helpers');

/**
 * Extract colorway from H1.
 * H1 format: "adidas Tahiti Marine SneakerNight Sky, Bold Blue & Night Navy"
 * JSON-LD name: "adidas Tahiti Marine Sneaker"
 * Colorway = H1 minus name = "Night Sky, Bold Blue & Night Navy"
 */
function extractColorway(h1Text, productName) {
  if (!h1Text || !productName) return '';
  // H1 sometimes lacks space between name and colorway
  const idx = h1Text.indexOf(productName);
  if (idx === -1) return '';
  const after = h1Text.substring(idx + productName.length).trim();
  // Remove leading dash or pipe if present
  return after.replace(/^[-|\s]+/, '').trim();
}

/**
 * END.-specific DOM extraction.
 * Grabs retail price and sizes that are NOT in JSON-LD.
 */
async function extractFromDOM(page) {
  return await page.evaluate(() => {
    const result = {
      retailPrice: null,
      sizes: [],
      colorway: '',
    };

    // 1. Retail price from the "was" price span
    //    Selector: span with class containing "DetailsPriceSaleWas"
    //    Or first span inside PriceContainer that isn't the final price
    const wasPrice = document.querySelector('[class*="DetailsPriceSaleWas"]');
    if (wasPrice) {
      result.retailPrice = wasPrice.textContent.trim();
    } else {
      // Fallback: PriceContainer's first span (if two spans, first is retail)
      const priceContainer = document.querySelector('[class*="PriceContainer"]');
      if (priceContainer) {
        const spans = priceContainer.querySelectorAll('span');
        if (spans.length >= 2) {
          result.retailPrice = spans[0].textContent.trim();
        }
      }
    }

    // 2. Sizes from data-test-id="Size__Button"
    const sizeButtons = document.querySelectorAll('[data-test-id="Size__Button"]');
    for (const btn of sizeButtons) {
      const text = btn.textContent.trim();
      if (text) result.sizes.push(text);
    }

    // 3. Colorway from H1
    const h1 = document.querySelector('h1');
    if (h1) {
      result.h1Text = h1.textContent.trim();
    }

    return result;
  });
}

/**
 * Post-process raw data from END. pages.
 */
function postProcess(raw, store) {
  // Brand: JSON-LD gives "Adidas" — fix common casing issues
  let brand = raw.brand || detectBrand(raw.name);
  // END. sometimes capitalizes oddly
  if (brand.toLowerCase() === 'adidas') brand = 'adidas';

  const currency = raw.currency || store.currency || 'GBP';
  const salePriceNum = parsePrice(raw.salePrice);
  const retailPriceNum = parsePrice(raw.retailPrice);
  const discount = calcDiscount(retailPriceNum, salePriceNum);

  // Sizes come as "UK 4", "UK 4.5" etc from DOM
  const validSizes = (raw.sizes || []).filter(s => isValidSize(s));
  const normalizedSizes = normalizeSizes(validSizes, 'END. Clothing', raw.name);

  const tags = detectTags(raw.name, brand);
  const category = detectCategory(raw.name, tags);

  // Image: strip query params for full resolution
  let image = raw.image || '';
  if (image.includes('endclothing.com')) {
    image = image.replace(/\?.*$/, '');
  }

  // Colorway: extract from H1 if available
  const colorway = raw.colorway || '';

  return {
    name: raw.name || 'Unknown Product',
    brand,
    styleCode: raw.styleCode || '',
    colorway,
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

  try {
    const cookieBtn = await page.$('#onetrust-accept-btn-handler');
    if (cookieBtn) {
      await cookieBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch (e) {}

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

module.exports = { postProcess, extractFromDOM, scrapeSalePage, extractColorway };
