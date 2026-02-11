#!/usr/bin/env node
/**
 * FASHION. — Bulletproof Image Fetcher
 * =====================================
 * Sources tried in order until one works:
 *   0) Foot Locker CDN — predictable URL from SKU, no browser needed
 *   0B) Patchright (undetected Chrome) — opens FL page, extracts real image
 *   A) sneaks-api (StockX/GOAT) — sneakers only, fast
 *   B) Patchright browser — opens any product page, extracts real image URL
 *   C) Google Images search — finds product image by name
 *   D) Patchright screenshot — screenshots the product image element
 *   E) fallback-images.json — manual backup URLs
 *
 * Usage:
 *   node scripts/fetch-images.js
 *   node scripts/fetch-images.js --verbose
 *   node scripts/fetch-images.js --force
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ===== PATHS =====
const PICKS_PATH = path.join(__dirname, '..', 'data', 'picks.json');
const FALLBACK_PATH = path.join(__dirname, '..', 'data', 'fallback-images.json');
const IMAGES_DIR = path.join(__dirname, '..', 'images', 'picks');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'image-report.json');
const BROWSER_DATA_DIR = path.join(__dirname, '..', '.browser-data');

// ===== CONFIG =====
const TIMEOUT = 30000;

// ===== CLI =====
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const FORCE = args.includes('--force');
const LOCAL_ONLY = args.includes('--local');

function log(msg) { if (VERBOSE) console.log(`    [v] ${msg}`); }

// ===== RANDOM DELAY (human-like) =====
function randomDelay(min = 1000, max = 3000) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

// ===== CLOUDINARY =====
let cloudinary = null;
let CLOUD_ENABLED = false;
let CLOUD_NAME = '';

function initCloudinary() {
  if (LOCAL_ONLY) return;
  const url = process.env.CLOUDINARY_URL;
  if (!url || url.includes('your_')) return;
  const m = url.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/);
  if (!m) return;
  try {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({ cloud_name: m[3], api_key: m[1], api_secret: m[2], secure: true });
    CLOUD_NAME = m[3]; CLOUD_ENABLED = true;
    console.log(`  ☁️  Cloudinary → ${m[3]}`);
  } catch (e) { console.log(`  ⚠️  Cloudinary init failed: ${e.message}`); }
}

async function uploadToCloudinary(source, filename) {
  if (!CLOUD_ENABLED) return null;
  const publicId = `picks/${path.parse(filename).name}`;
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

// ===== HTTP HELPER =====
function fetchBuffer(url, timeout = TIMEOUT) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return fetchBuffer(new URL(res.headers.location, url).href, timeout).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
}

// ===========================================================
// FOOT LOCKER PLACEHOLDER DETECTION
// ===========================================================
const FL_PLACEHOLDER_SIZES = [333321];

function isFootLockerPlaceholder(buffer) {
  if (!buffer || buffer.length < 1000) return true;

  for (const size of FL_PLACEHOLDER_SIZES) {
    if (buffer.length === size) {
      log(`⚠️  Detected FL placeholder (exact match: ${buffer.length} bytes)`);
      return true;
    }
  }

  if (buffer.length >= 330000 && buffer.length <= 340000) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
      log(`⚠️  Suspicious FL image: ${buffer.length} bytes — rejecting`);
      return true;
    }
  }

  return false;
}

// ===========================================================
// GENERIC IMAGE VALIDATION
// ===========================================================
function isValidImage(buffer) {
  if (!buffer || buffer.length < 5000) return false;
  // Check it's a real image (PNG or JPEG magic bytes)
  const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;
  const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8;
  const isWEBP = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
  if (!isPNG && !isJPEG && !isWEBP) return false;
  return true;
}

// ===========================================================
// PATCHRIGHT BROWSER (undetected Chrome — used for ALL sites)
// ===========================================================
let _patchrightCtx = null;

async function getPatchrightContext() {
  if (_patchrightCtx) return _patchrightCtx;
  try {
    const { chromium } = require('patchright');
    fs.mkdirSync(BROWSER_DATA_DIR, { recursive: true });
    _patchrightCtx = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
      channel: 'chrome',
      headless: false,
      viewport: null,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    log('Patchright persistent context launched (real Chrome)');
    return _patchrightCtx;
  } catch (e) {
    log(`Patchright launch failed: ${e.message}`);
    // Fallback: try without persistent context
    try {
      const { chromium } = require('patchright');
      _patchrightCtx = await chromium.launchPersistentContext('', {
        channel: 'chrome',
        headless: false,
        viewport: null,
      });
      log('Patchright launched (fallback, no persistence)');
      return _patchrightCtx;
    } catch (e2) {
      log(`Patchright fallback also failed: ${e2.message}`);
      return null;
    }
  }
}

// ===========================================================
// IMAGE EXTRACTION FROM ANY PAGE (shared logic)
// ===========================================================
async function extractImageFromPage(page, pick) {
  // Strategy 1: og:image meta tag
  let imageUrl = await page.evaluate(() => {
    const og = document.querySelector('meta[property="og:image"]');
    if (og) {
      const src = og.getAttribute('content');
      if (src && src.startsWith('http')) return src;
    }
    return null;
  });
  if (imageUrl) { log(`Found og:image: ${imageUrl}`); return imageUrl; }

  // Strategy 2: Product image selectors
  imageUrl = await page.evaluate(() => {
    const selectors = [
      '#ProductImages img',
      '[class*="ProductImages"] img',
      '[class*="product-image"] img',
      '[class*="ProductCarousel"] img',
      '[class*="carousel"] img',
      'img[data-testid="product-image"]',
      'img[data-testid="main-image"]',
      'picture source[type="image/webp"]',
      '.product-image img',
      '[class*="ProductImage"] img',
      '[class*="gallery"] img',
      '[class*="Gallery"] img',
      '[class*="pdp"] img',
      '.slick-slide img',
      '[data-testid*="image"] img',
      'picture img',
      'img[srcset]',
      'main img',
    ];

    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        let src;
        if (el.tagName === 'SOURCE') {
          const srcset = el.getAttribute('srcset');
          if (srcset) src = srcset.split(',')[0].trim().split(' ')[0];
        } else {
          src = el.getAttribute('src') || el.getAttribute('data-src');
          if (!src) {
            const srcset = el.getAttribute('srcset');
            if (srcset) {
              const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
              src = urls[urls.length - 1] || urls[0];
            }
          }
        }
        if (!src || !src.startsWith('http')) continue;
        if (src.includes('logo') || src.includes('svg') || src.includes('icon') || src.includes('flag')) continue;
        if (src.includes('placeholder') || src.includes('no-image')) continue;
        return src;
      }
    }

    // Strategy 3: Any large image
    const allImgs = [...document.querySelectorAll('img')];
    for (const img of allImgs) {
      const src = img.src || img.getAttribute('data-src');
      if (!src || !src.startsWith('http')) continue;
      if (src.includes('logo') || src.includes('svg') || src.includes('icon') || src.includes('flag')) continue;
      if (img.naturalWidth > 200 || img.width > 200 || src.includes('media') || src.includes('product') || src.includes('catalog')) {
        return src;
      }
    }

    return null;
  });

  if (imageUrl) { log(`Found product image: ${imageUrl}`); return imageUrl; }

  // Strategy 4: Regex in page source (for lazy-loaded images)
  const content = await page.content();
  const mediaPatterns = [
    /https?:\/\/images\.footlocker\.com\/is\/image\/[^"'\s\)]+/gi,
    /https?:\/\/media\.endclothing\.com[^"'\s\)]+/gi,
    /https?:\/\/[^"'\s\)]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s\)]*)?/gi,
  ];
  for (const pattern of mediaPatterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      const good = matches.find(u =>
        !u.includes('logo') && !u.includes('icon') && !u.includes('svg') &&
        !u.includes('flag') && !u.includes('pixel') && !u.includes('tracking') &&
        (u.includes('product') || u.includes('media') || u.includes('catalog') ||
         u.includes('image/FLEU') || u.includes('image/EBFL') || u.includes('w_') || u.includes('800'))
      );
      if (good) { log(`Found in HTML source: ${good}`); return good; }
    }
  }

  return null;
}

// =============================================================
// SOURCE 0: Foot Locker CDN (no browser needed)
// =============================================================
async function source0_FootLockerCDN(pick) {
  if (!pick.url || !pick.url.includes('footlocker')) return null;
  log('Source 0: Foot Locker CDN...');

  const m = pick.url.match(/(\d{10,15})\.html/);
  if (!m) {
    const m2 = pick.url.match(/[\/\-](\d{10,15})(?:\?|$)/);
    if (!m2) { log('No FL SKU found in URL'); return null; }
    var sku = m2[1];
  } else {
    var sku = m[1];
  }

  const cdnUrls = [
    `https://images.footlocker.com/is/image/FLEU/${sku}?wid=763&hei=538&fmt=png-alpha`,
    `https://images.footlocker.com/is/image/EBFL2/${sku}?wid=763&hei=538&fmt=png-alpha`,
  ];

  for (const cdnUrl of cdnUrls) {
    try {
      const buffer = await fetchBuffer(cdnUrl, 10000);
      if (buffer && buffer.length > 5000) {
        if (isFootLockerPlaceholder(buffer)) {
          console.log(`  ⚠️  FL CDN returned shoe box placeholder — skipping`);
          continue;
        }
        if (!isValidImage(buffer)) {
          log('FL CDN returned non-image data — skipping');
          continue;
        }
        log(`✓ Source 0 found: ${cdnUrl} (${Math.round(buffer.length / 1024)}KB)`);
        return { url: cdnUrl, buffer };
      }
    } catch (e) {
      log(`Source 0 CDN failed for ${cdnUrl}: ${e.message}`);
    }
  }

  return null;
}

// =============================================================
// SOURCE 0B: Patchright — open product page as real Chrome
//            Works for Foot Locker AND any other site
// =============================================================
async function source0B_PatchrightPage(pick) {
  if (!pick.url) return null;
  log('Source 0B: Patchright (undetected Chrome)...');

  const ctx = await getPatchrightContext();
  if (!ctx) return null;

  let page;
  try {
    page = await ctx.newPage();
    await page.goto(pick.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Human-like: random wait, scroll a bit
    await randomDelay(3000, 6000);

    // Dismiss cookie popups (common on EU sites)
    try {
      const cookieSelectors = ['#onetrust-accept-btn-handler', '[id*="cookie"] button', '[class*="cookie"] button', 'button[data-testid="accept-cookies"]'];
      for (const sel of cookieSelectors) {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); await randomDelay(800, 1500); break; }
      }
    } catch (e) {}

    // Scroll down slightly to trigger lazy-loaded images
    await page.evaluate(() => window.scrollBy(0, 300));
    await randomDelay(1500, 3000);

    const imageUrl = await extractImageFromPage(page, pick);
    await page.close();

    if (imageUrl) {
      // Download and validate
      try {
        const buffer = await fetchBuffer(imageUrl, 15000);
        if (buffer && isValidImage(buffer) && !isFootLockerPlaceholder(buffer)) {
          log(`✓ Source 0B found real image: ${imageUrl} (${Math.round(buffer.length / 1024)}KB)`);
          return { url: imageUrl, buffer };
        }
        log('Source 0B: Downloaded image failed validation');
      } catch (e) {
        log(`Source 0B: Download failed: ${e.message}`);
        // Return the URL anyway — saveImage will try to download it
        return imageUrl;
      }
    }
  } catch (e) {
    log(`Source 0B failed: ${e.message}`);
    if (page) try { await page.close(); } catch {}
  }

  return null;
}

// =============================================================
// SOURCE A: sneaks-api (StockX/GOAT image URLs for sneakers)
// =============================================================
async function sourceA_SneaksAPI(pick) {
  if (!pick.tags || !pick.tags.some(t => t.toLowerCase() === 'sneakers')) {
    log('Source A: Not a sneaker, skipping');
    return null;
  }
  log('Source A: sneaks-api lookup...');

  try {
    const SneaksAPI = require('sneaks-api');
    const sneaks = new SneaksAPI();

    // Try style code first, then product name
    const searchTerms = [pick.styleCode, `${pick.brand} ${pick.name}`];

    for (const term of searchTerms) {
      try {
        const products = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Sneaks timeout')), 15000);
          sneaks.getProducts(term, 3, (err, products) => {
            clearTimeout(timer);
            if (err) reject(err); else resolve(products);
          });
        });

        if (products && products.length > 0) {
          const p = products[0];
          const img = p.thumbnail || p.image?.original || p.image?.small;
          if (img && img.startsWith('http')) {
            log(`✓ Source A found: ${img}`);
            return img;
          }
        }
      } catch (e) {
        log(`Source A attempt with "${term}" failed: ${e.message}`);
      }
    }
  } catch (e) {
    log(`Source A failed: ${e.message}`);
  }
  return null;
}

// =============================================================
// SOURCE B: Patchright — open product page (non-FL fallback)
//           Now uses Patchright instead of Playwright
// =============================================================
async function sourceB_Patchright(pick) {
  log('Source B: Patchright browser...');

  const ctx = await getPatchrightContext();
  if (!ctx) return null;

  let page;
  try {
    page = await ctx.newPage();
    await page.goto(pick.url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await randomDelay(2000, 4000);

    const imageUrl = await extractImageFromPage(page, pick);
    await page.close();

    if (imageUrl && imageUrl.startsWith('http')) {
      log(`✓ Source B found: ${imageUrl}`);
      return imageUrl;
    }
  } catch (e) {
    log(`Source B failed: ${e.message}`);
    if (page) try { await page.close(); } catch {}
  }
  return null;
}

// =============================================================
// SOURCE C: Google Images search (via Patchright)
// =============================================================
async function sourceC_GoogleImages(pick) {
  log('Source C: Google Images search...');
  try {
    const ctx = await getPatchrightContext();
    if (!ctx) return null;

    const page = await ctx.newPage();
    const query = encodeURIComponent(`${pick.brand} ${pick.name} product photo`);
    const url = `https://www.google.com/search?q=${query}&tbm=isch&safe=active`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await randomDelay(1500, 3000);

    const imageUrl = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')];
      for (const img of imgs) {
        const src = img.src;
        if (src && src.startsWith('http') && !src.includes('google.com') && !src.includes('gstatic') && !src.startsWith('data:') && img.width > 80) return src;
      }
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent;
        if (!text) continue;
        const matches = text.match(/https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi);
        if (matches) {
          for (const m of matches) {
            if (!m.includes('google') && !m.includes('gstatic') && !m.includes('googleapis')) return m;
          }
        }
      }
      return null;
    });

    await page.close();
    if (imageUrl) { log(`✓ Source C found: ${imageUrl}`); return imageUrl; }
  } catch (e) { log(`Source C failed: ${e.message}`); }
  return null;
}

// =============================================================
// SOURCE D: Patchright screenshot (works for ALL sites now)
// =============================================================
async function sourceD_Screenshot(pick) {
  log('Source D: Patchright screenshot...');
  const ctx = await getPatchrightContext();
  if (!ctx) return null;

  let page;
  try {
    page = await ctx.newPage();
    await page.goto(pick.url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await randomDelay(3000, 5000);

    // Dismiss cookies
    try {
      const cookieSelectors = ['#onetrust-accept-btn-handler', '[id*="cookie"] button', '[class*="cookie"] button'];
      for (const sel of cookieSelectors) {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); await randomDelay(800, 1500); break; }
      }
    } catch (e) {}

    const selectors = [
      '#ProductImages img',
      'img[data-testid="product-image"]', 'img[data-testid="main-image"]',
      '.product-image img', '[class*="ProductImage"] img',
      '[class*="product-image"] img', '[class*="gallery"] img:first-child',
      '[class*="Gallery"] img:first-child', 'main img',
    ];

    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const box = await el.boundingBox();
          if (box && box.width > 100 && box.height > 100) {
            const filename = `${pick.id}-${slugify(pick.name)}.png`;
            const filepath = path.join(IMAGES_DIR, filename);
            await el.screenshot({ path: filepath });
            log(`✓ Source D screenshot saved: ${filepath}`);
            await page.close();
            // Validate the screenshot isn't tiny/broken
            const buf = fs.readFileSync(filepath);
            if (buf.length < 5000) {
              log('Source D: Screenshot too small, skipping');
              fs.unlinkSync(filepath);
              continue;
            }
            return { localFile: filepath, filename };
          }
        }
      } catch {}
    }

    // Last resort: crop the page
    const filename = `${pick.id}-${slugify(pick.name)}.png`;
    const filepath = path.join(IMAGES_DIR, filename);
    await page.screenshot({ path: filepath, clip: { x: 0, y: 0, width: 640, height: 640 } });
    log(`✓ Source D page screenshot saved: ${filepath}`);
    await page.close();
    return { localFile: filepath, filename };
  } catch (e) {
    log(`Source D failed: ${e.message}`);
    if (page) try { await page.close(); } catch {}
  }
  return null;
}

// =============================================================
// SOURCE E: Manual fallback URLs
// =============================================================
function sourceE_Fallback(pick) {
  log('Source E: Checking fallback-images.json...');
  if (!fs.existsSync(FALLBACK_PATH)) { log('No fallback file found'); return null; }
  try {
    const fallbacks = JSON.parse(fs.readFileSync(FALLBACK_PATH, 'utf-8'));
    const entry = fallbacks[pick.styleCode] || fallbacks[String(pick.id)] || fallbacks[pick.name];
    if (entry) { log(`✓ Source E found fallback: ${entry}`); return entry; }
  } catch (e) { log(`Source E failed: ${e.message}`); }
  return null;
}

// ===== SAVE IMAGE =====
async function saveImage(pick, imageResult, filename) {
  if (imageResult && typeof imageResult === 'object' && imageResult.localFile) {
    if (CLOUD_ENABLED) {
      const cdnUrl = await uploadToCloudinary(imageResult.localFile, imageResult.filename);
      if (cdnUrl) return cdnUrl;
    }
    return `images/picks/${imageResult.filename}`;
  }

  if (imageResult && typeof imageResult === 'object' && imageResult.buffer) {
    // Final validation before uploading
    if (isFootLockerPlaceholder(imageResult.buffer)) {
      console.log('  ⚠️  Blocked shoe-box placeholder from being uploaded');
      return null;
    }
    if (CLOUD_ENABLED) {
      const cdnUrl = await uploadToCloudinary(imageResult.buffer, filename);
      if (cdnUrl) return cdnUrl;
    }
    const localPath = path.join(IMAGES_DIR, filename);
    fs.writeFileSync(localPath, imageResult.buffer);
    return `images/picks/${filename}`;
  }

  const imageUrl = imageResult;

  if (CLOUD_ENABLED) {
    const cdnUrl = await uploadToCloudinary(imageUrl, filename);
    if (cdnUrl) return cdnUrl;
    try {
      const buffer = await fetchBuffer(imageUrl);
      if (buffer && buffer.length > 1000) {
        // Validate before upload
        if (isFootLockerPlaceholder(buffer)) {
          console.log('  ⚠️  Blocked shoe-box placeholder from being uploaded');
          return null;
        }
        const cdnUrl2 = await uploadToCloudinary(buffer, filename);
        if (cdnUrl2) return cdnUrl2;
      }
    } catch {}
  }

  try {
    const buffer = await fetchBuffer(imageUrl);
    if (buffer && buffer.length > 1000) {
      if (isFootLockerPlaceholder(buffer)) {
        console.log('  ⚠️  Blocked shoe-box placeholder from being saved');
        return null;
      }
      const localPath = path.join(IMAGES_DIR, filename);
      fs.writeFileSync(localPath, buffer);
      return `images/picks/${filename}`;
    }
  } catch (e) { log(`Local save failed: ${e.message}`); }

  return null;
}

// ===== MAIN =====
async function main() {
  console.log('\n🔥 FASHION. Bulletproof Image Fetcher');
  console.log('='.repeat(50));

  initCloudinary();
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  if (!fs.existsSync(PICKS_PATH)) {
    console.error('❌ picks.json not found'); process.exit(1);
  }

  const picksData = JSON.parse(fs.readFileSync(PICKS_PATH, 'utf-8'));
  const picks = picksData.picks;
  console.log(`\n📦 ${picks.length} items to process\n`);

  const report = { total: picks.length, success: 0, failed: 0, items: [] };

  for (const pick of picks) {
    console.log(`\n[${pick.id}/${picks.length}] ${pick.brand} — ${pick.name}`);
    const filename = `${pick.id}-${slugify(pick.name)}.png`;
    const item = { id: pick.id, name: pick.name, source: '', status: '' };

    if (!FORCE && pick.image && pick.image.includes('res.cloudinary.com')) {
      console.log('  ☁️  Already on Cloudinary ✅');
      item.status = 'skipped'; item.source = 'cloudinary';
      report.items.push(item); continue;
    }

    let imageResult = null;
    let sourceName = '';

    // ========== SOURCE 0: Foot Locker CDN ==========
    if (pick.url && pick.url.includes('footlocker')) {
      console.log('  [0] Foot Locker CDN...');
      imageResult = await source0_FootLockerCDN(pick);
      if (imageResult) { sourceName = 'fl-cdn'; }
    }

    // ========== SOURCE 0B: Patchright (any site, undetected Chrome) ==========
    if (!imageResult) {
      console.log('  [0B] Patchright (undetected Chrome)...');
      imageResult = await source0B_PatchrightPage(pick);
      if (imageResult) { sourceName = 'patchright'; }
    }

    // ========== SOURCE A ==========
    if (!imageResult) {
      console.log('  [A] sneaks-api...');
      imageResult = await sourceA_SneaksAPI(pick);
      if (imageResult) { sourceName = 'sneaks-api'; }
    }

    // ========== SOURCE B ==========
    if (!imageResult) {
      console.log('  [B] Patchright browser (retry)...');
      imageResult = await sourceB_Patchright(pick);
      if (imageResult) { sourceName = 'patchright-b'; }
    }

    // ========== SOURCE C ==========
    if (!imageResult) {
      console.log('  [C] Google Images...');
      imageResult = await sourceC_GoogleImages(pick);
      if (imageResult) { sourceName = 'google-images'; }
    }

    // ========== SOURCE D ==========
    if (!imageResult) {
      console.log('  [D] Patchright screenshot...');
      imageResult = await sourceD_Screenshot(pick);
      if (imageResult) { sourceName = 'screenshot'; }
    }

    // ========== SOURCE E ==========
    if (!imageResult) {
      console.log('  [E] Fallback file...');
      imageResult = sourceE_Fallback(pick);
      if (imageResult) { sourceName = 'fallback'; }
    }

    // ========== SAVE ==========
    if (imageResult) {
      console.log(`  📸 Found via: ${sourceName}`);
      const saved = await saveImage(pick, imageResult, filename);
      if (saved) {
        pick._originalImage = pick._originalImage || pick.image;
        pick.image = saved;
        console.log(`  ✅ ${saved}`);
        item.status = 'success'; item.source = sourceName;
        report.success++;
      } else {
        console.log('  ❌ Found image but failed validation (placeholder or broken)');
        item.status = 'blocked-placeholder'; item.source = sourceName;
        report.failed++;
      }
    } else {
      console.log('  ❌ No image found from any source');
      item.status = 'failed'; item.source = 'none';
      report.failed++;
    }

    report.items.push(item);
  }

  // Close browser
  if (_patchrightCtx) {
    try { await _patchrightCtx.close(); } catch {}
    log('Patchright closed');
  }

  fs.writeFileSync(PICKS_PATH, JSON.stringify(picksData, null, 2) + '\n');
  console.log('\n💾 Updated picks.json');

  console.log('\n' + '='.repeat(50));
  console.log('📊 RESULTS');
  console.log('='.repeat(50));
  console.log(`Total:      ${report.total}`);
  console.log(`✅ Success: ${report.success}`);
  console.log(`❌ Failed:  ${report.failed}`);
  console.log('='.repeat(50));

  for (const item of report.items) {
    const icon = item.status === 'success' ? '✅' : item.status === 'skipped' ? '⏭️' : '❌';
    console.log(`  ${icon} #${item.id} ${item.name} → ${item.source}`);
  }

  if (report.failed > 0) {
    console.log('\n⚠️  For failed items, add manual URLs to data/fallback-images.json:');
    console.log('  {');
    for (const item of report.items) {
      if (item.status === 'failed' || item.status === 'save-failed' || item.status === 'blocked-placeholder') {
        const pick = picks.find(p => p.id === item.id);
        console.log(`    "${pick.styleCode}": "https://example.com/image.jpg",`);
      }
    }
    console.log('  }');
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log('\n✨ Done!\n');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
