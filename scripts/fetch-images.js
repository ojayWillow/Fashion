#!/usr/bin/env node
/**
 * FASHION. — Automated Image Fetcher
 * ===================================
 * Reads picks.json, validates product URLs, downloads images locally,
 * and updates picks.json with local paths.
 *
 * Usage:
 *   node scripts/fetch-images.js
 *
 * Options:
 *   --dry-run     Check URLs without downloading
 *   --force       Re-download even if local image exists
 *   --verbose     Show detailed logs
 */

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

// ===== CLI FLAGS =====
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const VERBOSE = args.includes('--verbose');

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
  return '.jpg'; // default
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
      // Handle redirects
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
        // Follow redirects for HEAD too
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

    // Try og:image first
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch) return ogMatch[1];

    // Try twitter:image
    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twMatch) return twMatch[1];

    // Try JSON-LD product image
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

async function downloadImage(imageUrl, destPath) {
  try {
    const buffer = await fetchUrl(imageUrl);
    if (buffer.length < 1000) {
      log(`Image too small (${buffer.length} bytes), likely not valid`);
      return false;
    }
    fs.writeFileSync(destPath, buffer);
    log(`Saved ${destPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return true;
  } catch (e) {
    log(`Download failed: ${e.message}`);
    return false;
  }
}

// ===== MAIN =====
async function main() {
  console.log('\n🔍 FASHION. Image Fetcher\n' + '='.repeat(40));
  if (DRY_RUN) console.log('📋 DRY RUN — no files will be modified\n');

  // Load picks
  if (!fs.existsSync(PICKS_JSON_PATH)) {
    console.error('❌ picks.json not found at', PICKS_JSON_PATH);
    process.exit(1);
  }
  const picksData = JSON.parse(fs.readFileSync(PICKS_JSON_PATH, 'utf-8'));
  const picks = picksData.picks;
  console.log(`📦 Found ${picks.length} picks to process\n`);

  // Ensure images directory exists
  if (!DRY_RUN) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const report = {
    total: picks.length,
    imagesDownloaded: 0,
    imagesSkipped: 0,
    imagesFailed: 0,
    linksAlive: 0,
    linksDead: 0,
    items: []
  };

  for (const pick of picks) {
    console.log(`\n[${ pick.id }/${ picks.length }] ${pick.brand} — ${pick.name}`);
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

    // --- 2. Determine local image path ---
    const slug = slugify(pick.name);
    const ext = getExtFromUrl(pick.image);
    const filename = `${pick.id}-${slug}${ext}`;
    const localPath = path.join(IMAGES_DIR, filename);
    const relativePath = `images/picks/${filename}`;

    // Check if already downloaded
    if (fs.existsSync(localPath) && !FORCE) {
      console.log(`  📁 Local image exists, skipping (use --force to re-download)`);
      itemReport.imageStatus = 'already-local';
      report.imagesSkipped++;
      if (!DRY_RUN && pick.image !== relativePath) {
        pick._originalImage = pick._originalImage || pick.image;
        pick.image = relativePath;
        itemReport.actions.push('updated path to local');
      }
      itemReport.actions.push('skipped download');
      report.items.push(itemReport);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  📋 Would download to: ${relativePath}`);
      report.items.push(itemReport);
      continue;
    }

    // --- 3. Try downloading from current image URL ---
    console.log(`  📥 Downloading from original URL...`);
    let downloaded = await downloadImage(pick.image, localPath);

    // --- 4. Fallback: scrape og:image from product page ---
    if (!downloaded && linkCheck.alive) {
      console.log(`  🔄 Fallback: scraping product page for og:image...`);
      const ogImage = await scrapeOgImage(pick.url);
      if (ogImage) {
        console.log(`  🖼️  Found og:image: ${ogImage.substring(0, 80)}...`);
        downloaded = await downloadImage(ogImage, localPath);
      } else {
        console.log(`  ⚠️  No og:image found on product page`);
      }
    }

    // --- 5. Update picks.json ---
    if (downloaded) {
      console.log(`  ✅ Image saved: ${relativePath}`);
      pick._originalImage = pick._originalImage || pick.image;
      pick.image = relativePath;
      itemReport.imageStatus = 'downloaded';
      itemReport.actions.push('downloaded + path updated');
      report.imagesDownloaded++;
    } else {
      console.log(`  ❌ Could not fetch image from any source`);
      itemReport.imageStatus = 'failed';
      itemReport.actions.push('image download failed');
      report.imagesFailed++;
    }

    report.items.push(itemReport);
  }

  // --- Save updated picks.json ---
  if (!DRY_RUN) {
    fs.writeFileSync(PICKS_JSON_PATH, JSON.stringify(picksData, null, 2) + '\n');
    console.log('\n💾 Updated picks.json');
  }

  // --- Report ---
  console.log('\n' + '='.repeat(40));
  console.log('📊 REPORT');
  console.log('='.repeat(40));
  console.log(`Total picks:       ${report.total}`);
  console.log(`Images downloaded:  ${report.imagesDownloaded}`);
  console.log(`Images skipped:     ${report.imagesSkipped} (already local)`);
  console.log(`Images failed:      ${report.imagesFailed}`);
  console.log(`Product links OK:   ${report.linksAlive}`);
  console.log(`Product links DEAD: ${report.linksDead}`);
  console.log('='.repeat(40));

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
    console.log(`\n📄 Full report saved to data/image-report.json`);
  }

  console.log('\n✨ Done!\n');
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });
