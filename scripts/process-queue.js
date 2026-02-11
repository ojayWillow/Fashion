#!/usr/bin/env node
/**
 * FASHION. — Process Queue
 * =========================
 * One command to rule them all.
 *
 * 1. Reads URLs from data/queue.txt
 * 2. Scrapes each product (Playwright)
 * 3. Saves to picks.json
 * 4. Fetches images (all 5 sources)
 * 5. Moves processed URLs to data/queue-done.txt
 *
 * Usage:
 *   node scripts/process-queue.js
 *   node scripts/process-queue.js --verbose
 *   node scripts/process-queue.js --dry-run
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { execSync } = require('child_process');

// ===== PATHS =====
const QUEUE_PATH = path.join(__dirname, '..', 'data', 'queue.txt');
const DONE_PATH = path.join(__dirname, '..', 'data', 'queue-done.txt');
const PICKS_PATH = path.join(__dirname, '..', 'data', 'picks.json');
const STORES_PATH = path.join(__dirname, '..', 'data', 'stores.json');
const CONFIGS_PATH = path.join(__dirname, '..', 'data', 'store-configs.json');
const IMAGES_DIR = path.join(__dirname, '..', 'images', 'picks');

// ===== CLI =====
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const DRY_RUN = args.includes('--dry-run') || args.includes('--dry');

function log(msg) { if (VERBOSE) console.log(`    [v] ${msg}`); }

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
  } catch (e) {}
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
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function formatPrice(num, currency) {
  if (!num) return '';
  const sym = currency === 'GBP' ? '\u00a3' : currency === 'USD' ? '$' : '\u20ac';
  return `${sym}${num.toFixed(num % 1 === 0 ? 0 : 2)}`;
}

function detectCurrency(domain) {
  if (domain.endsWith('.co.uk') || domain.endsWith('.uk')) return 'GBP';
  if (domain.endsWith('.com') && !domain.includes('.co')) return 'USD';
  return 'EUR';
}

// ===== STORE CONFIG =====
function loadStoreConfig(domain) {
  const configs = JSON.parse(fs.readFileSync(CONFIGS_PATH, 'utf-8'));
  const stores = configs.stores;

  if (stores[domain]) {
    let config = stores[domain];
    if (config._inherit) {
      config = { ...stores[config._inherit], ...config };
      delete config._inherit;
    }
    return config;
  }

  const baseDomain = domain.split('.').slice(-2, -1)[0];
  for (const [key, config] of Object.entries(stores)) {
    if (key === '_default') continue;
    if (key.startsWith(baseDomain + '.')) {
      let resolved = config;
      if (resolved._inherit) {
        resolved = { ...stores[resolved._inherit], ...resolved };
        delete resolved._inherit;
      }
      return resolved;
    }
  }

  return stores._default;
}

function matchStore(domain) {
  const storesData = JSON.parse(fs.readFileSync(STORES_PATH, 'utf-8'));
  const domainLower = domain.toLowerCase();

  for (const category of storesData.categories) {
    for (const store of category.stores) {
      const storeDomain = extractDomain(store.url);
      const storeBase = storeDomain.split('.').slice(-2, -1)[0];
      const inputBase = domainLower.split('.').slice(-2, -1)[0];
      if (storeDomain === domainLower || storeBase === inputBase) {
        return {
          name: store.name, country: store.country, flag: store.flag,
          category: category.name, categoryIcon: category.icon
        };
      }
    }
  }

  return {
    name: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
    country: 'Unknown', flag: '\ud83c\udf10', category: 'Other', categoryIcon: '\ud83d\uded2'
  };
}

// ===== BRAND DETECTION =====
function detectBrand(name) {
  const brandMap = [
    { keywords: ['jordan', 'air jordan'], brand: 'Jordan' },
    { keywords: ['nike', 'air max', 'air force', 'dunk', 'blazer', 'vapormax'], brand: 'Nike' },
    { keywords: ['adidas', 'yeezy', 'ultraboost', 'nmd', 'stan smith', 'superstar', 'samba', 'gazelle'], brand: 'adidas' },
    { keywords: ['new balance', 'nb ', '990', '991', '992', '993', '550', '2002r', '1906r', '9060'], brand: 'New Balance' },
    { keywords: ['asics', 'gel-', 'gel lyte'], brand: 'ASICS' },
    { keywords: ['puma', 'suede', 'rs-x'], brand: 'Puma' },
    { keywords: ['converse', 'chuck taylor'], brand: 'Converse' },
    { keywords: ['vans', 'old skool'], brand: 'Vans' },
    { keywords: ['reebok', 'club c'], brand: 'Reebok' },
    { keywords: ['salomon', 'xt-6', 'xt-4', 'speedcross'], brand: 'Salomon' },
    { keywords: ['on running', 'on cloud', 'cloudmonster'], brand: 'On' },
    { keywords: ['hoka', 'bondi', 'clifton'], brand: 'HOKA' },
    { keywords: ['timberland'], brand: 'Timberland' },
    { keywords: ['dr. martens', 'dr martens'], brand: 'Dr. Martens' },
    { keywords: ['north face'], brand: 'The North Face' },
    { keywords: ['carhartt'], brand: 'Carhartt WIP' },
    { keywords: ['stussy', 'st\u00fcssy'], brand: 'St\u00fcssy' },
    { keywords: ['hugo boss', 'boss '], brand: 'Hugo Boss' },
    { keywords: ['stone island'], brand: 'Stone Island' },
    { keywords: ['c.p. company', 'cp company'], brand: 'C.P. Company' },
    { keywords: ['moncler'], brand: 'Moncler' },
    { keywords: ['balenciaga'], brand: 'Balenciaga' },
    { keywords: ['gucci'], brand: 'Gucci' },
    { keywords: ['prada'], brand: 'Prada' },
    { keywords: ['off-white', 'off white'], brand: 'Off-White' },
    { keywords: ['fear of god', 'essentials'], brand: 'Fear of God' },
    { keywords: ['acne studios'], brand: 'Acne Studios' },
    { keywords: ['our legacy'], brand: 'Our Legacy' },
    { keywords: ['arc\'teryx', 'arcteryx'], brand: 'Arc\'teryx' },
  ];
  const lower = name.toLowerCase();
  if (lower.includes('jordan') && (lower.includes('air jordan') || lower.includes('jordan '))) return 'Jordan';
  for (const entry of brandMap) {
    for (const kw of entry.keywords) { if (lower.includes(kw)) return entry.brand; }
  }
  return '';
}

function detectTags(name, brand) {
  const tags = [];
  const lower = name.toLowerCase();
  const sneakerWords = ['shoe', 'sneaker', 'trainer', 'schoen', 'runner', 'air max', 'air jordan', 'dunk', '990', '991', '550', '2002r', '1906r', 'ultraboost', 'samba', 'gazelle', 'gel-'];
  const clothingWords = ['hoodie', 'jacket', 'shirt', 't-shirt', 'pants', 'trousers', 'shorts', 'jogger', 'sweatshirt', 'coat', 'fleece', 'sweater', 'parka'];
  if (sneakerWords.some(w => lower.includes(w))) tags.push('Sneakers');
  else if (clothingWords.some(w => lower.includes(w))) tags.push('Clothing');
  if (brand) tags.push(brand);
  tags.push('Sale');
  return [...new Set(tags)];
}

// ===== SCRAPER =====
let _browser = null;

async function getBrowser() {
  if (_browser) return _browser;
  const { chromium } = require('playwright');
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

async function scrapePage(url, config) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8' });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    log(`Page load timeout for ${url}, continuing...`);
  }

  await page.waitForTimeout(config.waitTime || 4000);

  // Cookie popup dismissal
  try {
    const cookieSelectors = [
      '#onetrust-accept-btn-handler',
      'button[id*="accept"]', 'button[id*="cookie"]', 'button[id*="consent"]',
      'button[class*="accept"]', 'button[class*="consent"]',
      '[data-testid*="accept"]',
      'button:has-text("Accept All")', 'button:has-text("Accept")',
      'button:has-text("Accepteren")', 'button:has-text("Alle akkoord")'
    ];
    for (const sel of cookieSelectors) {
      const btn = await page.$(sel);
      if (btn) { await btn.click(); await page.waitForTimeout(1000); break; }
    }
  } catch (e) {}

  const data = await page.evaluate((config) => {
    const result = { name: '', image: '', salePrice: '', retailPrice: '', sizes: [], description: '', colorway: '', styleCode: '' };

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
        } catch (e) {}
      }
      return '';
    }

    function trySelectorsAll(selectors) {
      for (const sel of selectors) {
        try {
          const els = document.querySelectorAll(sel);
          if (els.length === 0) continue;
          const values = [];
          els.forEach(el => {
            const text = el.textContent.trim();
            if (text && text.length < 15 && !text.toLowerCase().includes('sold') && !text.toLowerCase().includes('uitverkocht')) {
              values.push(text);
            }
          });
          if (values.length > 0) return values;
        } catch (e) {}
      }
      return [];
    }

    // Name
    result.name = trySelectors(config.nameSelectors);

    // Image
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
              if (urls.length && urls[urls.length-1].startsWith('http')) { result.image = urls[urls.length-1]; break; }
            }
          } else {
            const src = el.src || el.getAttribute('data-src');
            if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('svg') && !src.includes('icon')) {
              result.image = src; break;
            }
          }
        } catch (e) {}
      }
    }
    if (!result.image) {
      const allImgs = [...document.querySelectorAll('img')];
      for (const img of allImgs) {
        const src = img.src || img.getAttribute('data-src');
        if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('svg') && !src.includes('icon') && !src.includes('flag') && !src.includes('banner')) {
          if (img.naturalWidth > 200 || img.width > 200 || src.includes('product') || src.includes('media')) {
            result.image = src; break;
          }
        }
      }
    }

    // Prices
    result.salePrice = trySelectors(config.priceSelectors);
    result.retailPrice = trySelectors(config.retailPriceSelectors);

    // JSON-LD fallback
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
      } catch (e) {}
    }

    // Sizes
    result.sizes = trySelectorsAll(config.sizeSelectors);

    // Description & colorway
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) result.description = metaDesc.getAttribute('content') || '';
    if (!result.description) {
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) result.description = ogDesc.getAttribute('content') || '';
    }

    const colorSels = ['[class*="color-name"]', '[class*="ColorName"]', '[class*="colorway"]', '[class*="Colorway"]', '[class*="product-color"]'];
    result.colorway = trySelectors(colorSels);

    const styleSels = ['[class*="style-code"]', '[class*="StyleCode"]', '[class*="product-code"]', '[class*="article-number"]', '[class*="sku"]'];
    result.styleCode = trySelectors(styleSels);

    return result;
  }, config);

  // Screenshot fallback
  if (!data.image) {
    log('No image found, taking screenshot...');
    const selectors = config.imageSelectors.filter(s => !s.includes('meta'));
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const box = await el.boundingBox();
          if (box && box.width > 100 && box.height > 100) {
            const buf = await el.screenshot();
            data._screenshotBuffer = buf.toString('base64');
            break;
          }
        }
      } catch (e) {}
    }
  }

  await page.close();
  return data;
}

// ===== READ QUEUE =====
function readQueue() {
  if (!fs.existsSync(QUEUE_PATH)) {
    console.log('  \u274c No queue file found. Create data/queue.txt with product URLs.');
    return [];
  }
  const content = fs.readFileSync(QUEUE_PATH, 'utf-8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.startsWith('http'));
}

// ===== MAIN =====
async function main() {
  console.log(`\n\ud83d\udd25 FASHION. \u2014 Process Queue`);
  console.log('='.repeat(50));
  if (DRY_RUN) console.log('  \ud83e\uddea DRY RUN \u2014 nothing will be saved');

  initCloudinary();
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  // 1. Read queue
  const urls = readQueue();
  if (urls.length === 0) {
    console.log('\n  \ud83d\udcea Queue is empty!');
    console.log('  Paste product URLs into data/queue.txt (one per line)');
    console.log('  Then run this command again.\n');
    return;
  }

  console.log(`\n  \ud83d\udce6 ${urls.length} product${urls.length > 1 ? 's' : ''} in queue\n`);

  const picksData = JSON.parse(fs.readFileSync(PICKS_PATH, 'utf-8'));
  const results = { success: 0, failed: 0, items: [] };
  const processedUrls = [];

  // 2. Process each URL
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const domain = extractDomain(url);
    const storeInfo = matchStore(domain);
    const config = loadStoreConfig(domain);
    const currency = detectCurrency(domain);

    console.log(`\n  [${i + 1}/${urls.length}] ${storeInfo.flag} ${storeInfo.name}`);
    console.log(`  ${url}`);

    try {
      // Scrape
      const scraped = await scrapePage(url, config);

      // Process
      const name = scraped.name || 'Unknown Product';
      const brand = detectBrand(name);
      const salePrice = parsePrice(scraped.salePrice);
      const retailPrice = parsePrice(scraped.retailPrice);
      const discount = (salePrice && retailPrice && retailPrice > salePrice)
        ? `-${Math.round((1 - salePrice / retailPrice) * 100)}%` : '0%';

      const nextId = Math.max(...picksData.picks.map(p => p.id), 0) + 1;
      const filename = `${nextId}-${slugify(name)}`;

      // Handle image
      let imageUrl = scraped.image || '';
      if (imageUrl && CLOUD_ENABLED) {
        const cdnUrl = await uploadToCloudinary(imageUrl, `picks/${filename}`);
        if (cdnUrl) imageUrl = cdnUrl;
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

      // Build pick
      const newPick = {
        id: nextId,
        name: name,
        brand: brand,
        styleCode: scraped.styleCode || '',
        colorway: scraped.colorway || '',
        retailPrice: retailPrice ? formatPrice(retailPrice, currency) : '',
        salePrice: salePrice ? formatPrice(salePrice, currency) : '',
        discount: discount,
        store: storeInfo.name,
        storeFlag: storeInfo.flag,
        image: imageUrl,
        url: url,
        description: (scraped.description || '').substring(0, 200),
        tags: detectTags(name, brand),
        sizes: scraped.sizes || []
      };

      if (!DRY_RUN) {
        picksData.picks.push(newPick);
      }

      // Print result
      const priceStr = newPick.salePrice
        ? `${newPick.retailPrice} \u2192 ${newPick.salePrice} (${newPick.discount})`
        : '\u26a0\ufe0f  price not found';

      console.log(`  \u2705 ${name}`);
      console.log(`     ${brand} | ${priceStr}`);
      console.log(`     Sizes: ${newPick.sizes.length > 0 ? newPick.sizes.join(', ') : 'none found'}`);
      console.log(`     Image: ${newPick.image ? '\u2705' : '\u274c'}`);

      results.success++;
      results.items.push({ url, name, status: 'success', id: nextId });
      processedUrls.push(url);

    } catch (e) {
      console.log(`  \u274c Failed: ${e.message}`);
      results.failed++;
      results.items.push({ url, name: '', status: 'failed', error: e.message });
      processedUrls.push(url);
    }
  }

  // 3. Close browser
  if (_browser) {
    await _browser.close();
    _browser = null;
  }

  // 4. Run fetch-images.js for any picks missing images
  const missingImages = picksData.picks.filter(p => !p.image);
  if (missingImages.length > 0 && !DRY_RUN) {
    console.log(`\n  \ud83d\udcf8 ${missingImages.length} picks need images, running fetch-images.js...`);
    try {
      execSync('node scripts/fetch-images.js', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    } catch (e) {
      console.log('  \u26a0\ufe0f  Image fetcher had issues, some images may need manual fixing');
    }
  }

  // 5. Save picks.json
  if (!DRY_RUN) {
    fs.writeFileSync(PICKS_PATH, JSON.stringify(picksData, null, 2) + '\n');
    console.log('\n  \ud83d\udcbe Saved picks.json');
  }

  // 6. Clear queue & archive processed URLs
  if (!DRY_RUN && processedUrls.length > 0) {
    // Archive to queue-done.txt
    const timestamp = new Date().toISOString().split('T')[0];
    const doneEntry = `\n# Processed ${timestamp}\n${processedUrls.join('\n')}\n`;
    fs.appendFileSync(DONE_PATH, doneEntry);

    // Clear queue.txt (keep the header comments)
    const header = fs.readFileSync(QUEUE_PATH, 'utf-8')
      .split('\n')
      .filter(line => line.startsWith('#') || line.trim() === '')
      .join('\n');
    fs.writeFileSync(QUEUE_PATH, header + '\n');

    console.log('  \ud83d\udcea Queue cleared \u2192 processed URLs archived in data/queue-done.txt');
  }

  // 7. Report
  console.log(`\n${'='.repeat(50)}`);
  console.log('  \ud83d\udcca RESULTS');
  console.log('='.repeat(50));
  console.log(`  Total:     ${urls.length}`);
  console.log(`  \u2705 Added:  ${results.success}`);
  console.log(`  \u274c Failed: ${results.failed}`);
  console.log('='.repeat(50));

  for (const item of results.items) {
    const icon = item.status === 'success' ? '\u2705' : '\u274c';
    console.log(`  ${icon} #${item.id || '?'} ${item.name || item.url}`);
  }

  if (results.failed > 0) {
    console.log('\n  \u26a0\ufe0f  Some products failed. Check --verbose output or add them manually.');
  }

  console.log('\n\u2728 Done!\n');
}

main().catch(e => {
  console.error('\n\u274c Fatal error:', e.message);
  if (VERBOSE) console.error(e);
  if (_browser) _browser.close();
  process.exit(1);
});
