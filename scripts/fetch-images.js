#!/usr/bin/env node
/**
 * FASHION. — Automated Image Fetcher + Cloudflare R2 Uploader
 * =============================================================
 * Reads picks.json, validates product URLs, downloads images,
 * uploads them to Cloudflare R2, and updates picks.json with CDN URLs.
 *
 * Falls back to local storage if R2 is not configured.
 *
 * Usage:
 *   node scripts/fetch-images.js
 *
 * Options:
 *   --dry-run     Check URLs without downloading/uploading
 *   --force       Re-process even if image already on R2
 *   --local       Skip R2, save locally only
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
const R2_FOLDER = 'picks'; // folder prefix inside the R2 bucket

// ===== CLI FLAGS =====
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const VERBOSE = args.includes('--verbose');
const LOCAL_ONLY = args.includes('--local');

// ===== R2 SETUP =====
let r2Client = null;
let R2_ENABLED = false;
let R2_PUBLIC_URL = '';

async function initR2() {
  if (LOCAL_ONLY) {
    console.log('📁 Local-only mode (--local flag)\n');
    return;
  }

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    console.log('⚠️  R2 not configured — falling back to local storage');
    console.log('   Copy .env.example to .env and fill in your Cloudflare R2 credentials\n');
    return;
  }

  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    R2_ENABLED = true;
    console.log(`☁️  R2 connected → ${R2_PUBLIC_URL}`);
    console.log(`   Bucket: ${R2_BUCKET_NAME} | Folder: ${R2_FOLDER}/\n`);
  } catch (err) {
    console.log(`⚠️  R2 init failed: ${err.message} — falling back to local\n`);
  }
}

async function uploadToR2(buffer, filename, contentType) {
  if (!R2_ENABLED) return null;

  try {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const key = `${R2_FOLDER}/${filename}`;

    await r2Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    const publicUrl = `${R2_PUBLIC_URL}/${key}`;
    log(`Uploaded to R2: ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    log(`R2 upload failed: ${err.message}`);
    return null;
  }
}

async function checkR2Exists(filename) {
  if (!R2_ENABLED) return false;

  try {
    const { HeadObjectCommand } = require('@aws-sdk/client-s3');
    await r2Client.send(new HeadObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: `${R2_FOLDER}/${filename}`,
    }));
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
  return '.png'; // default
}

function getMimeType(ext) {
  const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' };
  return types[ext] || 'image/jpeg';
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
        log(`Redirect ${res.statusCode} -> ${redirectUrl}`);
        return fetchUrl(redirectUrl, { ...options, maxRedirects: maxRedirects - 1 }).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      if (options.stream) return resolve(res);

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

async function downloadBuffer(imageUrl) {
  try {
    const buffer = await fetchUrl(imageUrl);
    if (buffer.length < 1000) {
      log(`Image too small (${buffer.length} bytes), likely not valid`);
      return null;
    }
    log(`Downloaded ${(buffer.length / 1024).toFixed(1)} KB`);
    return buffer;
  } catch (e) {
    log(`Download failed: ${e.message}`);
    return null;
  }
}

// ===== MAIN =====
async function main() {
  console.log('\n🔍 FASHION. Image Fetcher + R2 Uploader\n' + '='.repeat(45));
  if (DRY_RUN) console.log('📋 DRY RUN — no files will be modified\n');

  // Initialize R2
  await initR2();

  const storageMode = R2_ENABLED ? '☁️  Cloudflare R2' : '📁 Local';
  console.log(`Storage: ${storageMode}\n`);

  // Load picks
  if (!fs.existsSync(PICKS_JSON_PATH)) {
    console.error('❌ picks.json not found at', PICKS_JSON_PATH);
    process.exit(1);
  }
  const picksData = JSON.parse(fs.readFileSync(PICKS_JSON_PATH, 'utf-8'));
  const picks = picksData.picks;
  console.log(`📦 Found ${picks.length} picks to process\n`);

  // Ensure local images directory exists (for fallback or local mode)
  if (!DRY_RUN) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const report = {
    total: picks.length,
    storageMode: R2_ENABLED ? 'cloudflare-r2' : 'local',
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

    // --- 1. Check if product page is still alive ---
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

    // --- 2. Determine filename ---
    const slug = slugify(pick.name);
    const ext = getExtFromUrl(pick._originalImage || pick.image);
    const filename = `${pick.id}-${slug}${ext}`;
    const mimeType = getMimeType(ext);

    // --- 3. Check if already processed ---
    const alreadyOnR2 = R2_ENABLED && pick.image && pick.image.startsWith(R2_PUBLIC_URL);
    const localPath = path.join(IMAGES_DIR, filename);
    const alreadyLocal = !R2_ENABLED && fs.existsSync(localPath);

    if ((alreadyOnR2 || alreadyLocal) && !FORCE) {
      const where = alreadyOnR2 ? 'R2' : 'local';
      console.log(`  📁 Already on ${where}, skipping (use --force to re-process)`);
      itemReport.imageStatus = `already-${where}`;
      report.imagesSkipped++;
      report.items.push(itemReport);
      continue;
    }

    // Check if it exists on R2 even if picks.json isn't updated yet
    if (R2_ENABLED && !FORCE && !alreadyOnR2) {
      const existsOnR2 = await checkR2Exists(filename);
      if (existsOnR2) {
        const cdnUrl = `${R2_PUBLIC_URL}/${R2_FOLDER}/${filename}`;
        console.log(`  ☁️  Found on R2, updating picks.json`);
        if (!DRY_RUN) {
          pick._originalImage = pick._originalImage || pick.image;
          pick.image = cdnUrl;
        }
        itemReport.imageStatus = 'already-r2';
        itemReport.actions.push('updated URL to R2');
        report.imagesSkipped++;
        report.items.push(itemReport);
        continue;
      }
    }

    if (DRY_RUN) {
      console.log(`  📋 Would download and ${R2_ENABLED ? 'upload to R2' : 'save locally'}`);
      report.items.push(itemReport);
      continue;
    }

    // --- 4. Download image ---
    console.log(`  📥 Downloading image...`);
    const sourceUrl = pick._originalImage || pick.image;
    let buffer = await downloadBuffer(sourceUrl);

    // Fallback: scrape og:image from product page
    if (!buffer && linkCheck.alive) {
      console.log(`  🔄 Fallback: scraping product page for og:image...`);
      const ogImage = await scrapeOgImage(pick.url);
      if (ogImage) {
        console.log(`  🖼️  Found: ${ogImage.substring(0, 80)}...`);
        buffer = await downloadBuffer(ogImage);
      } else {
        console.log(`  ⚠️  No og:image found`);
      }
    }

    if (!buffer) {
      console.log(`  ❌ Could not fetch image from any source`);
      itemReport.imageStatus = 'failed';
      itemReport.actions.push('image download failed');
      report.imagesFailed++;
      report.items.push(itemReport);
      continue;
    }

    // --- 5. Upload to R2 or save locally ---
    if (R2_ENABLED) {
      console.log(`  ☁️  Uploading to R2... (${(buffer.length / 1024).toFixed(0)} KB)`);
      const cdnUrl = await uploadToR2(buffer, filename, mimeType);
      if (cdnUrl) {
        console.log(`  ✅ ${cdnUrl}`);
        pick._originalImage = pick._originalImage || pick.image;
        pick.image = cdnUrl;
        itemReport.imageStatus = 'uploaded-r2';
        itemReport.actions.push('uploaded to R2');
        report.imagesUploaded++;
      } else {
        // Fallback to local if R2 upload fails
        console.log(`  ⚠️  R2 upload failed, saving locally instead`);
        fs.writeFileSync(localPath, buffer);
        pick._originalImage = pick._originalImage || pick.image;
        pick.image = `images/picks/${filename}`;
        itemReport.imageStatus = 'local-fallback';
        itemReport.actions.push('saved locally (R2 failed)');
        report.imagesUploaded++;
      }
    } else {
      fs.writeFileSync(localPath, buffer);
      console.log(`  ✅ Saved locally: images/picks/${filename}`);
      pick._originalImage = pick._originalImage || pick.image;
      pick.image = `images/picks/${filename}`;
      itemReport.imageStatus = 'saved-local';
      itemReport.actions.push('saved locally');
      report.imagesUploaded++;
    }

    report.items.push(itemReport);
  }

  // --- Save updated picks.json ---
  if (!DRY_RUN) {
    fs.writeFileSync(PICKS_JSON_PATH, JSON.stringify(picksData, null, 2) + '\n');
    console.log('\n💾 Updated picks.json');
  }

  // --- Report ---
  console.log('\n' + '='.repeat(45));
  console.log('📊 REPORT');
  console.log('='.repeat(45));
  console.log(`Storage mode:      ${storageMode}`);
  console.log(`Total picks:       ${report.total}`);
  console.log(`Images processed:  ${report.imagesUploaded}`);
  console.log(`Images skipped:    ${report.imagesSkipped} (already stored)`);
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
    console.log('\n⚠️  Failed image downloads:');
    report.items.filter(i => i.imageStatus === 'failed').forEach(i => {
      console.log(`   #${i.id} ${i.name}`);
    });
  }

  // Save report
  const reportPath = path.join(__dirname, '..', 'data', 'image-report.json');
  if (!DRY_RUN) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`\n📄 Report saved to data/image-report.json`);
  }

  console.log('\n✨ Done!\n');
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });
