#!/usr/bin/env node
/**
 * FASHION. — Bulletproof Image Fetcher
 * =====================================
 * 5 sources tried in order until one works:
 *   A) sneaks-api (StockX/GOAT) — sneakers only, fast
 *   B) Playwright browser — opens END. page, extracts real image URL
 *   C) Google Images search — finds product image by name
 *   D) Playwright screenshot — screenshots the product image element
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

// ===== CONFIG =====
const TIMEOUT = 30000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ===== CLI =====
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const FORCE = args.includes('--force');
const LOCAL_ONLY = args.includes('--local');

function log(msg) { if (VERBOSE) console.log(`    [v] ${msg}`); }

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
    const req = client.get(url, { timeout, headers: { 'User-Agent': USER_AGENT } }, (res) => {
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

    const products = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Sneaks timeout')), 15000);
      sneaks.getProducts(pick.styleCode, 1, (err, products) => {
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
    log(`Source A failed: ${e.message}`);
  }
  return null;
}

// =============================================================
// SOURCE B: Playwright — open product page, extract real image
// =============================================================
let _browser = null;

async function getBrowser() {
  if (_browser) return _browser;
  try {
    const { chromium } = require('playwright');
    _browser = await chromium.launch({ headless: true });
    log('Playwright browser launched');
    return _browser;
  } catch (e) {
    log(`Playwright launch failed: ${e.message}`);
    return null;
  }
}

async function sourceB_Playwright(pick) {
  log('Source B: Playwright browser...');
  const browser = await getBrowser();
  if (!browser) return null;

  let page;
  try {
    page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });

    // Go to the END. product page
    await page.goto(pick.url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

    // Wait for any product image to render
    await page.waitForTimeout(3000);

    // Strategy 1: Look for og:image meta tag (rendered by JS)
    let imageUrl = await page.evaluate(() => {
      const og = document.querySelector('meta[property="og:image"]');
      if (og) return og.getAttribute('content');
      return null;
    });

    if (imageUrl && imageUrl.startsWith('http')) {
      log(`✓ Source B found og:image: ${imageUrl}`);
      await page.close();
      return imageUrl;
    }

    // Strategy 2: Find the main product image element
    imageUrl = await page.evaluate(() => {
      // END. uses various selectors for product images
      const selectors = [
        'img[data-testid="product-image"]',
        'img[data-testid="main-image"]',
        'picture source[type="image/webp"]',
        '.product-image img',
        '[class*="ProductImage"] img',
        '[class*="product-image"] img',
        '[class*="gallery"] img',
        '[class*="Gallery"] img',
        '[class*="pdp"] img',
        'img[srcset]',
        'main img',
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          // For <source> elements, get srcset
          if (el.tagName === 'SOURCE') {
            const srcset = el.getAttribute('srcset');
            if (srcset) {
              // Get highest resolution from srcset
              const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
              const best = urls[urls.length - 1] || urls[0];
              if (best && best.startsWith('http')) return best;
            }
          }
          // For <img> elements
          const src = el.getAttribute('src') || el.getAttribute('data-src');
          if (src && src.startsWith('http') && !src.includes('placeholder') && !src.includes('logo') && !src.includes('svg')) {
            return src;
          }
          const srcset = el.getAttribute('srcset');
          if (srcset) {
            const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
            const best = urls[urls.length - 1] || urls[0];
            if (best && best.startsWith('http')) return best;
          }
        }
      }

      // Strategy 3: Find ANY large image on the page
      const allImgs = [...document.querySelectorAll('img')];
      for (const img of allImgs) {
        const src = img.src || img.getAttribute('data-src');
        if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('svg') && !src.includes('icon') && !src.includes('flag')) {
          // Check if it's likely a product image (large enough)
          if (img.naturalWidth > 200 || img.width > 200 || src.includes('media') || src.includes('product') || src.includes('catalog')) {
            return src;
          }
        }
      }

      return null;
    });

    if (imageUrl && imageUrl.startsWith('http')) {
      log(`✓ Source B found product image: ${imageUrl}`);
      await page.close();
      return imageUrl;
    }

    // Strategy 3: Check network requests for image URLs
    // Sometimes the images are loaded via API calls
    log('Source B: No image in DOM, checking page content...');
    const content = await page.content();

    // Look for media.endclothing.com URLs in the rendered HTML
    const mediaMatch = content.match(/https?:\/\/media\.endclothing\.com[^"'\s\)]+/gi);
    if (mediaMatch && mediaMatch.length > 0) {
      // Filter for product images, not icons
      const productImg = mediaMatch.find(u => u.includes('prodmedia') || u.includes('catalog') || u.includes('w_') || u.includes('800'));
      const img = productImg || mediaMatch[0];
      log(`✓ Source B found in HTML: ${img}`);
      await page.close();
      return img;
    }

    await page.close();
  } catch (e) {
    log(`Source B failed: ${e.message}`);
    if (page) try { await page.close(); } catch {}
  }
  return null;
}

// =============================================================
// SOURCE C: Google Images search (no API key needed)
// =============================================================
async function sourceC_GoogleImages(pick) {
  log('Source C: Google Images search...');

  try {
    const browser = await getBrowser();
    if (!browser) return null;

    const page = await browser.newPage();
    const query = encodeURIComponent(`${pick.brand} ${pick.name} ${pick.styleCode} product photo`);
    const url = `https://www.google.com/search?q=${query}&tbm=isch&safe=active`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForTimeout(2000);

    // Extract image URLs from Google Images results
    const imageUrl = await page.evaluate(() => {
      // Google Images stores original URLs in data attributes or in script tags
      const imgs = [...document.querySelectorAll('img')];
      for (const img of imgs) {
        const src = img.src;
        // Skip Google's own assets, base64 thumbnails, and tiny images
        if (src && src.startsWith('http') && !src.includes('google.com') && !src.includes('gstatic') && !src.startsWith('data:') && img.width > 80) {
          return src;
        }
      }

      // Try to find URLs in the page's script data
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent;
        if (!text) continue;
        // Look for image URLs in the metadata
        const matches = text.match(/https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi);
        if (matches) {
          for (const m of matches) {
            if (!m.includes('google') && !m.includes('gstatic') && !m.includes('googleapis')) {
              return m;
            }
          }
        }
      }
      return null;
    });

    await page.close();

    if (imageUrl) {
      log(`✓ Source C found: ${imageUrl}`);
      return imageUrl;
    }
  } catch (e) {
    log(`Source C failed: ${e.message}`);
  }
  return null;
}

// =============================================================
// SOURCE D: Playwright screenshot of product image
// =============================================================
async function sourceD_Screenshot(pick) {
  log('Source D: Playwright screenshot...');
  const browser = await getBrowser();
  if (!browser) return null;

  let page;
  try {
    page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(pick.url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForTimeout(4000);

    // Try to find and screenshot just the product image
    const selectors = [
      'img[data-testid="product-image"]',
      'img[data-testid="main-image"]',
      '.product-image img',
      '[class*="ProductImage"] img',
      '[class*="product-image"] img',
      '[class*="gallery"] img:first-child',
      '[class*="Gallery"] img:first-child',
      'main img',
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
            return { localFile: filepath, filename };
          }
        }
      } catch {}
    }

    // Fallback: screenshot the top-left area (usually the product image)
    const filename = `${pick.id}-${slugify(pick.name)}.png`;
    const filepath = path.join(IMAGES_DIR, filename);
    await page.screenshot({
      path: filepath,
      clip: { x: 0, y: 0, width: 640, height: 640 }
    });
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
  if (!fs.existsSync(FALLBACK_PATH)) {
    log('No fallback file found');
    return null;
  }
  try {
    const fallbacks = JSON.parse(fs.readFileSync(FALLBACK_PATH, 'utf-8'));
    const entry = fallbacks[pick.styleCode] || fallbacks[pick.id] || fallbacks[pick.name];
    if (entry) {
      log(`✓ Source E found fallback: ${entry}`);
      return entry;
    }
  } catch (e) {
    log(`Source E failed: ${e.message}`);
  }
  return null;
}

// ===== SAVE IMAGE =====
async function saveImage(pick, imageResult, filename) {
  // If it's already a local screenshot (from Source D)
  if (imageResult && typeof imageResult === 'object' && imageResult.localFile) {
    if (CLOUD_ENABLED) {
      const cdnUrl = await uploadToCloudinary(imageResult.localFile, imageResult.filename);
      if (cdnUrl) return cdnUrl;
    }
    return `images/picks/${imageResult.filename}`;
  }

  // It's a URL — download it
  const imageUrl = imageResult;

  if (CLOUD_ENABLED) {
    // Try uploading URL directly to Cloudinary
    const cdnUrl = await uploadToCloudinary(imageUrl, filename);
    if (cdnUrl) return cdnUrl;

    // If that failed, download buffer then upload
    try {
      const buffer = await fetchBuffer(imageUrl);
      if (buffer && buffer.length > 1000) {
        const cdnUrl2 = await uploadToCloudinary(buffer, filename);
        if (cdnUrl2) return cdnUrl2;
      }
    } catch {}
  }

  // Save locally
  try {
    const buffer = await fetchBuffer(imageUrl);
    if (buffer && buffer.length > 1000) {
      const localPath = path.join(IMAGES_DIR, filename);
      fs.writeFileSync(localPath, buffer);
      return `images/picks/${filename}`;
    }
  } catch (e) {
    log(`Local save failed: ${e.message}`);
  }

  return null;
}

// ===== MAIN =====
async function main() {
  console.log('\n🔥 FASHION. Bulletproof Image Fetcher');
  console.log('=' .repeat(50));

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

    // Skip if already on Cloudinary
    if (!FORCE && pick.image && pick.image.includes('res.cloudinary.com')) {
      console.log('  ☁️  Already on Cloudinary ✅');
      item.status = 'skipped'; item.source = 'cloudinary';
      report.items.push(item); continue;
    }

    let imageResult = null;
    let sourceName = '';

    // ========== SOURCE A ==========
    console.log('  [A] sneaks-api...');
    imageResult = await sourceA_SneaksAPI(pick);
    if (imageResult) { sourceName = 'sneaks-api'; }

    // ========== SOURCE B ==========
    if (!imageResult) {
      console.log('  [B] Playwright browser...');
      imageResult = await sourceB_Playwright(pick);
      if (imageResult) { sourceName = 'playwright'; }
    }

    // ========== SOURCE C ==========
    if (!imageResult) {
      console.log('  [C] Google Images...');
      imageResult = await sourceC_GoogleImages(pick);
      if (imageResult) { sourceName = 'google-images'; }
    }

    // ========== SOURCE D ==========
    if (!imageResult) {
      console.log('  [D] Playwright screenshot...');
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
        console.log('  ❌ Found image but failed to save');
        item.status = 'save-failed'; item.source = sourceName;
        report.failed++;
      }
    } else {
      console.log('  ❌ No image found from any source');
      item.status = 'failed'; item.source = 'none';
      report.failed++;
    }

    report.items.push(item);
  }

  // Cleanup
  if (_browser) {
    await _browser.close();
    log('Browser closed');
  }

  // Save picks.json
  fs.writeFileSync(PICKS_PATH, JSON.stringify(picksData, null, 2) + '\n');
  console.log('\n💾 Updated picks.json');

  // Report
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
      if (item.status === 'failed' || item.status === 'save-failed') {
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
