#!/usr/bin/env node
/**
 * FASHION. — One-Command Product Scraper
 * ==========================================
 * Paste any product URL → Playwright opens it → extracts everything →
 * adds it to picks.json with the correct store, image, prices, sizes.
 *
 * Usage:
 *   node scripts/add-pick.js "https://www.footlocker.nl/nl/product/~/314217367904.html"
 *   node scripts/add-pick.js URL --verbose
 *   node scripts/add-pick.js URL --dry-run   (preview without saving)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// ===== PATHS =====
const PICKS_PATH = path.join(__dirname, '..', 'data', 'picks.json');
const STORES_PATH = path.join(__dirname, '..', 'data', 'stores.json');
const CONFIGS_PATH = path.join(__dirname, '..', 'data', 'store-configs.json');
const IMAGES_DIR = path.join(__dirname, '..', 'images', 'picks');

// ===== CLI =====
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const DRY_RUN = args.includes('--dry-run') || args.includes('--dry');
const productUrl = args.find(a => a.startsWith('http'));

if (!productUrl) {
  console.log(`
🔥 FASHION. — Add Pick
${'='.repeat(40)}

Usage:
  node scripts/add-pick.js <product-url>
  node scripts/add-pick.js <product-url> --verbose
  node scripts/add-pick.js <product-url> --dry-run

Examples:
  node scripts/add-pick.js "https://www.footlocker.nl/nl/product/~/314217367904.html"
  node scripts/add-pick.js "https://www.endclothing.com/gb/some-product.html"
  node scripts/add-pick.js "https://www.zalando.com/some-product.html" --verbose
`);
  process.exit(0);
}

function log(msg) { if (VERBOSE) console.log(`  [v] ${msg}`); }

// ===== CLOUDINARY =====
let cloudinary = null;
let CLOUD_ENABLED = false;
let CLOUD_NAME = '';

function initCloudinary() {
  const url = process.env.CLOUDINARY_URL;
  if (!url || url.includes('your_')) return;
  const m = url.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/);
  if (!m) return;
  try {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({ cloud_name: m[3], api_key: m[1], api_secret: m[2], secure: true });
    CLOUD_NAME = m[3]; CLOUD_ENABLED = true;
    log(`Cloudinary connected: ${m[3]}`);
  } catch (e) { log(`Cloudinary init failed: ${e.message}`); }
}

async function uploadToCloudinary(source, publicId) {
  if (!CLOUD_ENABLED) return null;
  try {
    let result;
    if (Buffer.isBuffer(source)) {
      result = await new Promise((resolve, reject) => {
        const s = cloudinary.uploader.upload_stream(
          { public_id: publicId, overwrite: true, resource_type: 'image' },
          (e, r) => e ? reject(e) : resolve(r)
        );
        s.end(source);
      });
    } else {
      result = await cloudinary.uploader.upload(source, {
        public_id: publicId, overwrite: true, resource_type: 'image'
      });
    }
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${publicId}`;
  } catch (e) { log(`Cloudinary upload failed: ${e.message}`); return null; }
}

// ===== HELPERS =====
function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return hostname;
  } catch { return ''; }
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
}

function parsePrice(text) {
  if (!text) return null;
  // Remove currency symbols and normalize
  const cleaned = text.replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function formatPrice(num, currency) {
  if (!num) return '';
  const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€';
  return `${sym}${num.toFixed(num % 1 === 0 ? 0 : 2)}`;
}

function detectCurrency(domain) {
  if (domain.endsWith('.co.uk') || domain.endsWith('.uk')) return 'GBP';
  if (domain.endsWith('.com') && !domain.includes('.co')) return 'USD';
  return 'EUR';
}

// ===== STORE CONFIG LOADER =====
function loadStoreConfig(domain) {
  const configs = JSON.parse(fs.readFileSync(CONFIGS_PATH, 'utf-8'));
  const stores = configs.stores;

  // Direct match
  if (stores[domain]) {
    let config = stores[domain];
    // Handle inheritance
    if (config._inherit) {
      const parent = stores[config._inherit];
      config = { ...parent, ...config };
      delete config._inherit;
    }
    return config;
  }

  // Partial match (e.g. footlocker.nl matches footlocker.*)
  const baseDomain = domain.split('.').slice(-2, -1)[0]; // "footlocker" from "footlocker.nl"
  for (const [key, config] of Object.entries(stores)) {
    if (key === '_default') continue;
    if (key.startsWith(baseDomain + '.')) {
      let resolved = config;
      if (resolved._inherit) {
        const parent = stores[resolved._inherit];
        resolved = { ...parent, ...resolved };
        delete resolved._inherit;
      }
      log(`Matched config: ${key} (via base domain "${baseDomain}")`);
      return resolved;
    }
  }

  // Default fallback
  log('Using _default config');
  return stores._default;
}

// ===== STORE MATCHER =====
function matchStore(domain) {
  const storesData = JSON.parse(fs.readFileSync(STORES_PATH, 'utf-8'));
  const domainLower = domain.toLowerCase();

  for (const category of storesData.categories) {
    for (const store of category.stores) {
      const storeDomain = extractDomain(store.url);
      // Match by domain root ("footlocker" in "footlocker.nl" matches "footlocker.eu")
      const storeBase = storeDomain.split('.').slice(-2, -1)[0];
      const inputBase = domainLower.split('.').slice(-2, -1)[0];

      if (storeDomain === domainLower || storeBase === inputBase) {
        return {
          name: store.name,
          country: store.country,
          flag: store.flag,
          saleUrl: store.saleUrl,
          category: category.name,
          categoryIcon: category.icon
        };
      }
    }
  }

  // Not found in stores.json — create basic info from domain
  return {
    name: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
    country: 'Unknown',
    flag: '🌐',
    saleUrl: `https://${domain}`,
    category: 'Other',
    categoryIcon: '🛒'
  };
}

// ===== DETECT BRAND =====
function detectBrand(name) {
  const brandMap = [
    { keywords: ['nike', 'air max', 'air jordan', 'air force', 'dunk', 'blazer', 'vapormax'], brand: 'Nike' },
    { keywords: ['jordan', 'air jordan'], brand: 'Jordan' },
    { keywords: ['adidas', 'yeezy', 'ultraboost', 'nmd', 'stan smith', 'superstar', 'samba', 'gazelle'], brand: 'adidas' },
    { keywords: ['new balance', 'nb ', '990', '991', '992', '993', '550', '2002r', '1906r', '9060', '2010'], brand: 'New Balance' },
    { keywords: ['asics', 'gel-', 'gel lyte'], brand: 'ASICS' },
    { keywords: ['puma', 'suede', 'rs-x'], brand: 'Puma' },
    { keywords: ['converse', 'chuck taylor', 'all star'], brand: 'Converse' },
    { keywords: ['vans', 'old skool', 'sk8'], brand: 'Vans' },
    { keywords: ['reebok', 'club c', 'classic leather'], brand: 'Reebok' },
    { keywords: ['salomon', 'xt-6', 'xt-4', 'speedcross'], brand: 'Salomon' },
    { keywords: ['on running', 'on cloud', 'cloudmonster'], brand: 'On' },
    { keywords: ['hoka', 'bondi', 'clifton', 'speedgoat'], brand: 'HOKA' },
    { keywords: ['timberland'], brand: 'Timberland' },
    { keywords: ['dr. martens', 'dr martens'], brand: 'Dr. Martens' },
    { keywords: ['ugg'], brand: 'UGG' },
    { keywords: ['north face', 'tnf'], brand: 'The North Face' },
    { keywords: ['carhartt'], brand: 'Carhartt WIP' },
    { keywords: ['stussy', 'stüssy'], brand: 'Stüssy' },
    { keywords: ['ralph lauren', 'polo ralph'], brand: 'Ralph Lauren' },
    { keywords: ['tommy hilfiger'], brand: 'Tommy Hilfiger' },
    { keywords: ['calvin klein'], brand: 'Calvin Klein' },
    { keywords: ['hugo boss', 'boss '], brand: 'Hugo Boss' },
    { keywords: ['lacoste'], brand: 'Lacoste' },
    { keywords: ['moncler'], brand: 'Moncler' },
    { keywords: ['stone island'], brand: 'Stone Island' },
    { keywords: ['c.p. company', 'cp company'], brand: 'C.P. Company' },
    { keywords: ['maison margiela', 'margiela'], brand: 'Maison Margiela' },
    { keywords: ['balenciaga'], brand: 'Balenciaga' },
    { keywords: ['gucci'], brand: 'Gucci' },
    { keywords: ['prada'], brand: 'Prada' },
    { keywords: ['versace'], brand: 'Versace' },
    { keywords: ['alexander mcqueen', 'mcqueen'], brand: 'Alexander McQueen' },
    { keywords: ['rick owens'], brand: 'Rick Owens' },
    { keywords: ['fear of god', 'essentials'], brand: 'Fear of God' },
    { keywords: ['off-white', 'off white'], brand: 'Off-White' },
    { keywords: ['palm angels'], brand: 'Palm Angels' },
    { keywords: ['acne studios'], brand: 'Acne Studios' },
    { keywords: ['our legacy'], brand: 'Our Legacy' },
    { keywords: ['arc\'teryx', 'arcteryx'], brand: 'Arc\'teryx' },
    { keywords: ['patagonia'], brand: 'Patagonia' },
  ];

  const lower = name.toLowerCase();

  // Jordan before Nike (more specific)
  if (lower.includes('jordan') && (lower.includes('air jordan') || lower.includes('jordan '))) {
    return 'Jordan';
  }

  for (const entry of brandMap) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) return entry.brand;
    }
  }

  return '';
}

// ===== DETECT TAGS =====
function detectTags(name, brand, category) {
  const tags = [];
  const lower = name.toLowerCase();

  // Type detection
  const sneakerWords = ['shoe', 'sneaker', 'trainer', 'schoen', 'chaussure', 'runner', 'air max', 'air jordan', 'jordan ', 'dunk', 'yeezy', '990', '991', '992', '993', '550', '2002r', '1906r', 'ultraboost', 'nmd', 'gel-', 'old skool', 'samba', 'gazelle'];
  const clothingWords = ['hoodie', 'jacket', 'shirt', 't-shirt', 'tee', 'pants', 'trousers', 'shorts', 'jogger', 'sweatshirt', 'coat', 'vest', 'pullover', 'fleece', 'sweater', 'cardigan', 'blazer', 'parka', 'windbreaker'];
  const accessoryWords = ['hat', 'cap', 'bag', 'backpack', 'wallet', 'belt', 'watch', 'sunglasses', 'scarf', 'gloves', 'socks', 'beanie'];

  if (sneakerWords.some(w => lower.includes(w))) tags.push('Sneakers');
  else if (clothingWords.some(w => lower.includes(w))) {
    const match = clothingWords.find(w => lower.includes(w));
    tags.push(match.charAt(0).toUpperCase() + match.slice(1));
  }
  else if (accessoryWords.some(w => lower.includes(w))) {
    const match = accessoryWords.find(w => lower.includes(w));
    tags.push(match.charAt(0).toUpperCase() + match.slice(1));
  }

  // Brand tag
  if (brand) tags.push(brand);

  // Always add Sale tag
  tags.push('Sale');

  return [...new Set(tags)];
}

// ===== MAIN SCRAPER =====
async function scrapePage(url, config) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('  🌐 Opening page in Playwright...');
  await page.setViewportSize({ width: 1280, height: 900 });

  // Set a realistic user agent
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8'
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log(`  ⚠️  Page load timeout, continuing anyway...`);
  }

  // Wait for JS to render
  const waitTime = config.waitTime || 4000;
  console.log(`  ⏳ Waiting ${waitTime}ms for JS to render...`);
  await page.waitForTimeout(waitTime);

  // Handle cookie consent popups
  try {
    const cookieSelectors = [
      'button[id*="accept"]', 'button[id*="cookie"]', 'button[id*="consent"]',
      'button[class*="accept"]', 'button[class*="cookie"]', 'button[class*="consent"]',
      '[data-testid*="accept"]', '[data-testid*="cookie"]',
      'button:has-text("Accept")', 'button:has-text("Accepteren")',
      'button:has-text("Accept All")', 'button:has-text("Alle akkoord")',
      '#onetrust-accept-btn-handler'
    ];
    for (const sel of cookieSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        log(`Dismissed cookie popup: ${sel}`);
        await page.waitForTimeout(1000);
        break;
      }
    }
  } catch (e) { log(`Cookie dismiss failed: ${e.message}`); }

  // ===== EXTRACT DATA =====
  const data = await page.evaluate((config) => {
    const result = {
      name: '', brand: '', colorway: '', image: '',
      salePrice: '', retailPrice: '', sizes: [], description: ''
    };

    // Helper: try selectors in order
    function trySelectors(selectors, attr) {
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (!el) continue;

          // Meta tags
          if (el.tagName === 'META') {
            const content = el.getAttribute('content');
            if (content && content.trim()) return content.trim();
            continue;
          }

          // Attribute extraction
          if (attr === 'src') {
            const src = el.getAttribute('src') || el.getAttribute('data-src');
            if (src && src.startsWith('http')) return src;
            const srcset = el.getAttribute('srcset');
            if (srcset) {
              const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
              const best = urls[urls.length - 1] || urls[0];
              if (best && best.startsWith('http')) return best;
            }
            continue;
          }

          if (attr === 'content') {
            const content = el.getAttribute('content');
            if (content && content.trim()) return content.trim();
            continue;
          }

          // Text content
          const text = el.textContent.trim();
          if (text) return text;
        } catch (e) {}
      }
      return '';
    }

    // Helper: try selectors for multiple results
    function trySelectorsAll(selectors) {
      for (const sel of selectors) {
        try {
          const els = document.querySelectorAll(sel);
          if (els.length === 0) continue;
          const values = [];
          els.forEach(el => {
            const text = el.textContent.trim();
            // Filter out empty, "Uitverkocht"/"Sold Out", and non-size text
            if (text && text.length < 15 && !text.toLowerCase().includes('sold') && !text.toLowerCase().includes('uitverkocht')) {
              values.push(text);
            }
          });
          if (values.length > 0) return values;
        } catch (e) {}
      }
      return [];
    }

    // === Name ===
    result.name = trySelectors(config.nameSelectors);

    // === Image ===
    // Try og:image first
    const ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg) {
      const content = ogImg.getAttribute('content');
      if (content && content.startsWith('http')) result.image = content;
    }
    // Then try config selectors
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
            if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('svg') && !src.includes('icon')) {
              result.image = src;
              break;
            }
          }
        } catch (e) {}
      }
    }

    // If still no image, find ANY large product image
    if (!result.image) {
      const allImgs = [...document.querySelectorAll('img')];
      for (const img of allImgs) {
        const src = img.src || img.getAttribute('data-src');
        if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('svg') && !src.includes('icon') && !src.includes('flag') && !src.includes('banner')) {
          if (img.naturalWidth > 200 || img.width > 200 || src.includes('product') || src.includes('media') || src.includes('catalog')) {
            result.image = src;
            break;
          }
        }
      }
    }

    // === Prices ===
    result.salePrice = trySelectors(config.priceSelectors);
    result.retailPrice = trySelectors(config.retailPriceSelectors);

    // Fallback: structured data / JSON-LD
    if (!result.salePrice || !result.retailPrice) {
      try {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
          const data = JSON.parse(script.textContent);
          const offers = data.offers || (data['@graph'] && data['@graph'].find(g => g.offers))?.offers;
          if (offers) {
            const offer = Array.isArray(offers) ? offers[0] : offers;
            if (!result.salePrice && offer.price) result.salePrice = String(offer.price);
            if (!result.retailPrice && offer.highPrice) result.retailPrice = String(offer.highPrice);
          }
        }
      } catch (e) {}
    }

    // === Sizes ===
    result.sizes = trySelectorsAll(config.sizeSelectors);

    // === Colorway / Description ===
    // Try meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) result.description = metaDesc.getAttribute('content') || '';

    // Try og:description
    if (!result.description) {
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) result.description = ogDesc.getAttribute('content') || '';
    }

    // Try to find colorway
    const colorSelectors = [
      '[class*="color-name"]', '[class*="ColorName"]', '[class*="colorway"]',
      '[class*="Colorway"]', '[data-testid*="color"]', '[class*="product-color"]',
      '[class*="ProductColor"]'
    ];
    result.colorway = trySelectors(colorSelectors);

    // === Style Code from page ===
    const styleSelectors = [
      '[class*="style-code"]', '[class*="StyleCode"]', '[class*="product-code"]',
      '[class*="ProductCode"]', '[class*="article-number"]', '[class*="sku"]',
      '[data-testid*="style"]', '[data-testid*="sku"]'
    ];
    result.styleCode = trySelectors(styleSelectors);

    return result;
  }, config);

  // === Screenshot fallback for image ===
  if (!data.image) {
    console.log('  📸 No image found, taking screenshot...');
    const selectors = config.imageSelectors.filter(s => !s.includes('meta'));
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const box = await el.boundingBox();
          if (box && box.width > 100 && box.height > 100) {
            const screenshotBuffer = await el.screenshot();
            data._screenshotBuffer = screenshotBuffer.toString('base64');
            log(`Screenshot captured from: ${sel}`);
            break;
          }
        }
      } catch (e) {}
    }
  }

  await browser.close();
  return data;
}

// ===== MAIN =====
async function main() {
  console.log(`\n\ud83d\udd25 FASHION. — Add Pick`);
  console.log('='.repeat(50));
  console.log(`  URL: ${productUrl}`);
  if (DRY_RUN) console.log('  🧪 DRY RUN — nothing will be saved');
  console.log();

  initCloudinary();
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  // 1. Detect store
  const domain = extractDomain(productUrl);
  const storeInfo = matchStore(domain);
  const config = loadStoreConfig(domain);
  const currency = detectCurrency(domain);

  console.log(`  🏪 Store: ${storeInfo.flag} ${storeInfo.name} (${storeInfo.category})`);
  console.log(`  ⚙️  Config: ${config.name} [${config.renderMode}, ${config.waitTime}ms]`);
  console.log();

  // 2. Scrape the page
  const scraped = await scrapePage(productUrl, config);

  // 3. Process results
  const name = scraped.name || 'Unknown Product';
  const brand = scraped.brand || detectBrand(name) || '';
  const colorway = scraped.colorway || '';
  const salePrice = parsePrice(scraped.salePrice);
  const retailPrice = parsePrice(scraped.retailPrice);
  const discount = (salePrice && retailPrice && retailPrice > salePrice)
    ? `-${Math.round((1 - salePrice / retailPrice) * 100)}%`
    : '0%';
  const sizes = scraped.sizes || [];
  const description = scraped.description || '';
  const styleCode = scraped.styleCode || '';
  const tags = detectTags(name, brand, storeInfo.category);

  // 4. Handle image
  let imageUrl = scraped.image || '';
  const picksData = JSON.parse(fs.readFileSync(PICKS_PATH, 'utf-8'));
  const nextId = Math.max(...picksData.picks.map(p => p.id), 0) + 1;
  const filename = `${nextId}-${slugify(name)}`;

  if (imageUrl && CLOUD_ENABLED) {
    console.log('  ☁️  Uploading image to Cloudinary...');
    const cdnUrl = await uploadToCloudinary(imageUrl, `picks/${filename}`);
    if (cdnUrl) {
      log(`Cloudinary URL: ${cdnUrl}`);
      imageUrl = cdnUrl;
    }
  } else if (scraped._screenshotBuffer) {
    const buffer = Buffer.from(scraped._screenshotBuffer, 'base64');
    if (CLOUD_ENABLED) {
      const cdnUrl = await uploadToCloudinary(buffer, `picks/${filename}`);
      if (cdnUrl) imageUrl = cdnUrl;
    } else {
      const localPath = path.join(IMAGES_DIR, `${filename}.png`);
      fs.writeFileSync(localPath, buffer);
      imageUrl = `images/picks/${filename}.png`;
    }
  }

  // 5. Build the pick
  const newPick = {
    id: nextId,
    name: name,
    brand: brand,
    styleCode: styleCode,
    colorway: colorway,
    retailPrice: retailPrice ? formatPrice(retailPrice, currency) : '',
    salePrice: salePrice ? formatPrice(salePrice, currency) : '',
    discount: discount,
    store: storeInfo.name,
    storeFlag: storeInfo.flag,
    image: imageUrl,
    url: productUrl,
    description: description.substring(0, 200),
    tags: tags,
    sizes: sizes
  };

  // Store the original image URL if we got a CDN URL
  if (scraped.image && imageUrl !== scraped.image) {
    newPick._originalImage = scraped.image;
  }

  // 6. Display results
  console.log();
  console.log('  📦 SCRAPED PRODUCT');
  console.log('  ' + '='.repeat(48));
  console.log(`  Name:        ${newPick.name}`);
  console.log(`  Brand:       ${newPick.brand || '(not detected)'}`);
  console.log(`  Colorway:    ${newPick.colorway || '(not found)'}`);
  console.log(`  Style Code:  ${newPick.styleCode || '(not found)'}`);
  console.log(`  Retail:      ${newPick.retailPrice || '⚠️  not found'}`);
  console.log(`  Sale:        ${newPick.salePrice || '⚠️  not found'}`);
  console.log(`  Discount:    ${newPick.discount}`);
  console.log(`  Store:       ${newPick.storeFlag} ${newPick.store}`);
  console.log(`  Category:    ${storeInfo.categoryIcon} ${storeInfo.category}`);
  console.log(`  Sizes:       ${newPick.sizes.length > 0 ? newPick.sizes.join(', ') : '⚠️  none found'}`);
  console.log(`  Tags:        ${newPick.tags.join(', ')}`);
  console.log(`  Image:       ${newPick.image ? '✅' : '❌'} ${newPick.image ? newPick.image.substring(0, 60) + '...' : 'none'}`);
  console.log(`  Description: ${newPick.description.substring(0, 80)}...`);
  console.log(`  Pick ID:     #${newPick.id}`);
  console.log('  ' + '='.repeat(48));

  // 7. Save
  if (DRY_RUN) {
    console.log('\n  🧪 DRY RUN — not saving. Run without --dry-run to save.');
    console.log('\n  Full JSON:');
    console.log(JSON.stringify(newPick, null, 2));
  } else {
    picksData.picks.push(newPick);
    fs.writeFileSync(PICKS_PATH, JSON.stringify(picksData, null, 2) + '\n');
    console.log(`\n  ✅ Saved as pick #${newPick.id} in picks.json`);
    console.log(`  🏪 Will appear under: ${storeInfo.flag} ${storeInfo.name}`);

    // Warnings for missing data
    const warnings = [];
    if (!newPick.salePrice) warnings.push('Sale price not found — edit picks.json manually');
    if (!newPick.retailPrice) warnings.push('Retail price not found — edit picks.json manually');
    if (!newPick.image) warnings.push('Image not found — run: node scripts/fetch-images.js');
    if (newPick.sizes.length === 0) warnings.push('Sizes not found — edit picks.json manually');
    if (!newPick.brand) warnings.push('Brand not detected — edit picks.json manually');

    if (warnings.length > 0) {
      console.log('\n  ⚠️  Warnings:');
      warnings.forEach(w => console.log(`     • ${w}`));
    }
  }

  console.log('\n✨ Done!\n');
}

main().catch(e => {
  console.error('\n❌ Fatal error:', e.message);
  if (VERBOSE) console.error(e);
  process.exit(1);
});
