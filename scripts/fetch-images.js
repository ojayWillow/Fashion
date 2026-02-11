#!/usr/bin/env node
/**
 * FASHION. — Automated Image Fetcher + Cloudinary Uploader
 * ==========================================================
 * Reads picks.json, validates product URLs, tells Cloudinary to
 * fetch images from the source URLs, and updates picks.json with CDN URLs.
 *
 * Uses Cloudinary's remote fetch — their servers grab the image
 * (bypasses blocks that hit our script directly).
 *
 * Usage:
 *   node scripts/fetch-images.js
 *
 * Options:
 *   --dry-run     Check URLs without uploading
 *   --force       Re-process even if image already on Cloudinary
 *   --local       Skip Cloudinary, save locally only
 *   --verbose     Show detailed logs
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ===== CONFIG =====
const PICKS_JSON_PATH = path.join(__dirname, '..', 'data', 'picks.json');
const IMAGES_DIR = path.join(__dirname, '..', 'images', 'picks');
const TIMEOUT_MS = 15000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CLOUDINARY_FOLDER = 'picks';

// ===== CLI FLAGS =====
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const VERBOSE = args.includes('--verbose');
const LOCAL_ONLY = args.includes('--local');

// ===== CLOUDINARY SETUP =====
let cloudinary = null;
let CLOUD_ENABLED = false;
let CLOUD_NAME = '';

function initCloudinary() {
  if (LOCAL_ONLY) {
    console.log('📁 Local-only mode (--local flag)\n');
    return;
  }

  const url = process.env.CLOUDINARY_URL;
  if (!url || url.includes('your_')) {
    console.log('⚠️  Cloudinary not configured — falling back to local storage');
    console.log('   Copy .env.example to .env and paste your CLOUDINARY_URL\n');
    return;
  }

  const match = url.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/);
  if (!match) {
    console.log('⚠️  Invalid CLOUDINARY_URL format — falling back to local\n');
    return;
  }

  try {
    const [, apiKey, apiSecret, cloudName] = match;
    CLOUD_NAME = cloudName;
    cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });
    CLOUD_ENABLED = true;
    console.log(`☁️  Cloudinary connected → ${cloudName}`);
    console.log(`   CDN: https://res.cloudinary.com/${cloudName}/image/upload/${CLOUDINARY_FOLDER}/\n`);
  } catch (err) {
    console.log(`⚠️  Cloudinary init failed: ${err.message} — falling back to local\n`);
  }
}

/**
 * Upload to Cloudinary by giving it a remote URL to fetch.
 * Cloudinary's servers will download the image themselves.
 */
async function uploadUrlToCloudinary(remoteUrl, filename) {
  if (!CLOUD_ENABLED) return null;

  try {
    const publicId = `${CLOUDINARY_FOLDER}/${path.parse(filename).name}`;

    const result = await cloudinary.uploader.upload(remoteUrl, {
      public_id: publicId,
      overwrite: true,
      resource_type: 'image',
    });

    // Build CDN URL with auto-format and auto-quality
    const cdnUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${publicId}`;
    log(`Uploaded to Cloudinary: ${cdnUrl} (${result.bytes} bytes)`);
    return cdnUrl;
  } catch (err) {
    log(`Cloudinary upload failed: ${err.message}`);
    return null;
  }
}

/**
 * Upload a local buffer to Cloudinary (fallback method).
 */
async function uploadBufferToCloudinary(buffer, filename) {
  if (!CLOUD_ENABLED) return null;

  try {
    const publicId = `${CLOUDINARY_FOLDER}/${path.parse(filename).name}`;

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { public_id: publicId, overwrite: true, resource_type: 'image' },
        (error, result) => { if (error) reject(error); else resolve(result); }
      );
      stream.end(buffer);
    });

    const cdnUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${publicId}`;
    log(`Uploaded buffer to Cloudinary: ${cdnUrl}`);
    return cdnUrl;
  } catch (err) {
    log(`Cloudinary buffer upload failed: ${err.message}`);
    return null;
  }
}

async function checkCloudinaryExists(filename) {
  if (!CLOUD_ENABLED) return false;

  try {
    const publicId = `${CLOUDINARY_FOLDER}/${path.parse(filename).name}`;
    await cloudinary.api.resource(publicId);
    return true;
  } catch {
    return false;
  }
}

// ===== HELPERS =====
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

function getExtFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase().split('?')[0];
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(ext)) return ext;
  } catch {}
  return '.png';
}

function log(msg) { if (VERBOSE) console.log(`  [verbose] ${msg}`); }

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const maxRedirects = options.maxRedirects || 5;

    const req = client.get(url, {
      timeout: TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': options.accept || '*/*',
        ...options.headers
      }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        const redirectUrl = new URL(res.headers.location, url).href;
        return fetchUrl(redirectUrl, { ...options, maxRedirects: maxRedirects - 1 }).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

async function checkUrlAlive(url) {
  try {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve) => {
      const req = client.request(url, {
        method: 'HEAD',
        timeout: TIMEOUT_MS,
        headers: { 'User-Agent': USER_AGENT }
      }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          return checkUrlAlive(new URL(res.headers.location, url).href).then(resolve);
        }
        res.resume();
        resolve({ alive: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode });
      });
      req.on('timeout', () => { req.destroy(); resolve({ alive: false, status: 'timeout' }); });
      req.on('error', () => resolve({ alive: false, status: 'error' }));
      req.end();
    });
  } catch {
    return { alive: false, status: 'invalid-url' };
  }
}

async function scrapeOgImage(pageUrl) {
  try {
    log(`Scraping og:image from ${pageUrl}`);
    const html = (await fetchUrl(pageUrl, { accept: 'text/html' })).toString('utf-8');

    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch) return ogMatch[1];

    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twMatch) return twMatch[1];

    const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const block of jsonLdMatch) {
        try {
          const jsonStr = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
          const data = JSON.parse(jsonStr);
          if (data.image) return Array.isArray(data.image) ? data.image[0] : data.image;
        } catch {}
      }
    }

    return null;
  } catch (e) {
    log(`Failed to scrape ${pageUrl}: ${e.message}`);
    return null;
  }
}

// ===== MAIN =====
async function main() {
  console.log('\n🔍 FASHION. Image Fetcher + Cloudinary\n' + '='.repeat(45));
  if (DRY_RUN) console.log('📋 DRY RUN — no files will be modified\n');

  initCloudinary();

  const storageMode = CLOUD_ENABLED ? '☁️  Cloudinary' : '📁 Local';
  console.log(`Storage: ${storageMode}\n`);

  if (!fs.existsSync(PICKS_JSON_PATH)) {
    console.error('❌ picks.json not found at', PICKS_JSON_PATH);
    process.exit(1);
  }
  const picksData = JSON.parse(fs.readFileSync(PICKS_JSON_PATH, 'utf-8'));
  const picks = picksData.picks;
  console.log(`📦 Found ${picks.length} picks to process\n`);

  if (!DRY_RUN) fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const report = {
    total: picks.length,
    storageMode: CLOUD_ENABLED ? 'cloudinary' : 'local',
    imagesUploaded: 0,
    imagesSkipped: 0,
    imagesFailed: 0,
    linksAlive: 0,
    linksDead: 0,
    items: []
  };

  for (const pick of picks) {
    console.log(`\n[${pick.id}/${picks.length}] ${pick.brand} — ${pick.name}`);
    const itemReport = { id: pick.id, name: pick.name, imageStatus: '', linkStatus: '', actions: [] };

    // --- 1. Check product link ---
    console.log(`  🔗 Checking product URL...`);
    const linkCheck = await checkUrlAlive(pick.url);
    if (linkCheck.alive) {
      console.log(`  ✅ Product page alive (${linkCheck.status})`);
      itemReport.linkStatus = 'alive';
      report.linksAlive++;
      if (pick._linkDead) delete pick._linkDead;
    } else {
      console.log(`  ❌ Product page DEAD (${linkCheck.status})`);
      itemReport.linkStatus = `dead (${linkCheck.status})`;
      report.linksDead++;
      if (!DRY_RUN) pick._linkDead = true;
      itemReport.actions.push('marked link as dead');
    }

    // --- 2. Filename ---
    const slug = slugify(pick.name);
    const ext = getExtFromUrl(pick._originalImage || pick.image);
    const filename = `${pick.id}-${slug}${ext}`;

    // --- 3. Already processed? ---
    const alreadyOnCloud = CLOUD_ENABLED && pick.image && pick.image.includes('res.cloudinary.com');
    if (alreadyOnCloud && !FORCE) {
      console.log(`  📁 Already on Cloudinary, skipping`);
      itemReport.imageStatus = 'already-cloudinary';
      report.imagesSkipped++;
      report.items.push(itemReport);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  📋 Would upload to ${CLOUD_ENABLED ? 'Cloudinary' : 'local'}`);
      report.items.push(itemReport);
      continue;
    }

    // --- 4. Upload via Cloudinary remote fetch ---
    const imageUrl = pick._originalImage || pick.image;
    let cdnUrl = null;

    if (CLOUD_ENABLED) {
      // Method A: Let Cloudinary fetch the image directly from the URL
      console.log(`  ☁️  Cloudinary fetching from source URL...`);
      cdnUrl = await uploadUrlToCloudinary(imageUrl, filename);

      // Method B: Try og:image from store page
      if (!cdnUrl && linkCheck.alive) {
        console.log(`  🔄 Trying og:image from store page...`);
        const ogImage = await scrapeOgImage(pick.url);
        if (ogImage) {
          console.log(`  🖼️  Found: ${ogImage.substring(0, 80)}...`);
          cdnUrl = await uploadUrlToCloudinary(ogImage, filename);
        }
      }

      // Method C: Download ourselves and upload buffer
      if (!cdnUrl) {
        console.log(`  📥 Trying direct download + buffer upload...`);
        try {
          const buffer = await fetchUrl(imageUrl);
          if (buffer && buffer.length > 1000) {
            cdnUrl = await uploadBufferToCloudinary(buffer, filename);
          }
        } catch (e) {
          log(`Direct download failed: ${e.message}`);
        }
      }
    }

    if (cdnUrl) {
      console.log(`  ✅ ${cdnUrl}`);
      pick._originalImage = pick._originalImage || pick.image;
      pick.image = cdnUrl;
      itemReport.imageStatus = 'uploaded-cloudinary';
      itemReport.actions.push('uploaded to Cloudinary');
      report.imagesUploaded++;
    } else {
      console.log(`  ❌ Could not fetch image from any source`);
      itemReport.imageStatus = 'failed';
      itemReport.actions.push('all methods failed');
      report.imagesFailed++;
    }

    report.items.push(itemReport);
  }

  // Save updated picks.json
  if (!DRY_RUN) {
    fs.writeFileSync(PICKS_JSON_PATH, JSON.stringify(picksData, null, 2) + '\n');
    console.log('\n💾 Updated picks.json');
  }

  // Report
  console.log('\n' + '='.repeat(45));
  console.log('📊 REPORT');
  console.log('='.repeat(45));
  console.log(`Storage mode:      ${storageMode}`);
  console.log(`Total picks:       ${report.total}`);
  console.log(`Images processed:  ${report.imagesUploaded}`);
  console.log(`Images skipped:    ${report.imagesSkipped}`);
  console.log(`Images failed:     ${report.imagesFailed}`);
  console.log(`Product links OK:  ${report.linksAlive}`);
  console.log(`Product links DEAD:${report.linksDead}`);
  console.log('='.repeat(45));

  if (report.linksDead > 0) {
    console.log('\n⚠️  Dead product links:');
    report.items.filter(i => i.linkStatus.startsWith('dead')).forEach(i => {
      console.log(`   #${i.id} ${i.name}`);
    });
  }
  if (report.imagesFailed > 0) {
    console.log('\n⚠️  Failed images:');
    report.items.filter(i => i.imageStatus === 'failed').forEach(i => {
      console.log(`   #${i.id} ${i.name}`);
    });
  }

  const reportPath = path.join(__dirname, '..', 'data', 'image-report.json');
  if (!DRY_RUN) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`\n📄 Report saved to data/image-report.json`);
  }

  console.log('\n✨ Done!\n');
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });
