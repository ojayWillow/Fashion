#!/usr/bin/env node
/**
 * FASHION. — Process Queue
 * =========================
 * One command to rule them all.
 * Paste URLs into data/queue.txt, run this script, done.
 *
 * Improvements over v1:
 * - Failed items stay in queue (only success + duplicates are cleared)
 * - Shared lib/ modules (no duplicated code)
 * - Better error reporting
 *
 * Usage:
 *   node scripts/process-queue.js
 *   node scripts/process-queue.js --verbose
 *   node scripts/process-queue.js --dry-run
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ===== SHARED LIB =====
const { extractDomain, slugify, parsePrice, formatPrice, detectCurrency, calcDiscount, isValidSize, nextPickId } = require('../lib/helpers');
const { detectBrand, detectTags } = require('../lib/brands');
const { loadStoreConfig, matchStore, isFootLocker } = require('../lib/stores');
const { findDuplicate } = require('../lib/duplicates');
const cloud = require('../lib/cloudinary');
const { scrapePage, closeBrowsers } = require('../lib/scraper');

// ===== PATHS =====
const QUEUE_PATH = path.join(__dirname, '..', 'data', 'queue.txt');
const DONE_PATH = path.join(__dirname, '..', 'data', 'queue-done.txt');
const PICKS_PATH = path.join(__dirname, '..', 'data', 'picks.json');
const IMAGES_DIR = path.join(__dirname, '..', 'images', 'picks');

// ===== CLI =====
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const DRY_RUN = args.includes('--dry-run') || args.includes('--dry');

function log(msg) { if (VERBOSE) console.log(`    [v] ${msg}`); }

function readQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  return fs.readFileSync(QUEUE_PATH, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && l.startsWith('http'));
}

async function main() {
  console.log(`\n\ud83d\udd25 FASHION. \u2014 Process Queue`);
  console.log('='.repeat(50));
  if (DRY_RUN) console.log('  \ud83e\uddea DRY RUN');

  cloud.init();
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const urls = readQueue();
  if (urls.length === 0) {
    console.log('\n  \ud83d\udcea Queue is empty! Paste URLs into data/queue.txt\n');
    return;
  }

  console.log(`\n  \ud83d\udce6 ${urls.length} product${urls.length > 1 ? 's' : ''} in queue\n`);

  const picksData = JSON.parse(fs.readFileSync(PICKS_PATH, 'utf-8'));
  const results = { success: 0, failed: 0, skipped: 0, items: [] };
  const successUrls = []; // Only clear successful + skipped from queue
  const failedUrls = [];  // Keep failed in queue for retry

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const domain = extractDomain(url);
    const storeInfo = matchStore(domain);
    const config = loadStoreConfig(domain);
    const currency = isFootLocker(domain) ? detectCurrency(domain) : detectCurrency(domain);

    console.log(`\n  [${i + 1}/${urls.length}] ${storeInfo.flag} ${storeInfo.name}`);
    console.log(`  ${url}`);

    // ===== DUPLICATE CHECK =====
    const existing = findDuplicate(url, picksData.picks);
    if (existing) {
      console.log(`  \u23ed\ufe0f  SKIPPED \u2014 already exists as #${existing.id}: ${existing.name}`);
      results.skipped++;
      results.items.push({ url, name: existing.name, status: 'duplicate', id: existing.id });
      successUrls.push(url);
      continue;
    }

    try {
      const scraped = await scrapePage(url, config);

      const name = scraped.name || 'Unknown Product';
      const brand = scraped.brand || detectBrand(name);
      const salePrice = parsePrice(scraped.salePrice);
      const retailPrice = parsePrice(scraped.retailPrice);
      const discount = calcDiscount(salePrice, retailPrice);

      const newId = nextPickId(picksData.picks);
      const filename = `${newId}-${slugify(name)}`;

      let imageUrl = scraped.image || '';
      if (imageUrl && cloud.isEnabled()) {
        const cdnUrl = await cloud.upload(imageUrl, `picks/${filename}`);
        if (cdnUrl) imageUrl = cdnUrl;
      }

      const validSizes = (scraped.sizes || []).filter(s => isValidSize(s));

      const newPick = {
        id: newId, name, brand,
        styleCode: scraped.styleCode || '', colorway: scraped.colorway || '',
        retailPrice: retailPrice ? formatPrice(retailPrice, currency) : '',
        salePrice: salePrice ? formatPrice(salePrice, currency) : '',
        discount, store: storeInfo.name, storeFlag: storeInfo.flag,
        image: imageUrl, url,
        description: (scraped.description || '').substring(0, 200),
        tags: detectTags(name, brand),
        sizes: validSizes,
      };

      if (!DRY_RUN) picksData.picks.push(newPick);

      const priceStr = newPick.salePrice
        ? `${newPick.retailPrice || '?'} \u2192 ${newPick.salePrice} (${newPick.discount})`
        : '\u26a0\ufe0f  price not found';

      console.log(`  \u2705 ${name}`);
      console.log(`     ${brand} | ${priceStr}`);
      console.log(`     Sizes: ${validSizes.length > 0 ? validSizes.join(', ') : 'none found'}`);
      if (scraped._totalSizes) {
        console.log(`     Stock: ${validSizes.length} available, ${scraped._soldOut || 0} sold out of ${scraped._totalSizes} total`);
      }
      console.log(`     Image: ${newPick.image ? '\u2705' : '\u274c'}`);
      console.log(`     Color: ${newPick.colorway || '-'}`);

      results.success++;
      results.items.push({ url, name, status: 'success', id: newId });
      successUrls.push(url);

    } catch (e) {
      console.log(`  \u274c Failed: ${e.message}`);
      if (VERBOSE) console.error(e);
      results.failed++;
      results.items.push({ url, name: '', status: 'failed', error: e.message });
      failedUrls.push(url);
    }
  }

  await closeBrowsers();

  // Auto-fetch images for items that are missing them
  const missingImages = picksData.picks.filter(p => !p.image);
  if (missingImages.length > 0 && !DRY_RUN) {
    console.log(`\n  \ud83d\udcf8 ${missingImages.length} picks need images, running fetch-images.js...`);
    try {
      execSync('node scripts/fetch-images.js', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    } catch {
      console.log('  \u26a0\ufe0f  Image fetcher had issues');
    }
  }

  // Save picks
  if (!DRY_RUN) {
    fs.writeFileSync(PICKS_PATH, JSON.stringify(picksData, null, 2) + '\n');
    console.log('\n  \ud83d\udcbe Saved picks.json');
  }

  // Update queue: only remove successful items, keep failed for retry
  if (!DRY_RUN && successUrls.length > 0) {
    const timestamp = new Date().toISOString().split('T')[0];
    fs.appendFileSync(DONE_PATH, `\n# Processed ${timestamp}\n${successUrls.join('\n')}\n`);

    // Rebuild queue with header + any failed URLs
    const header = fs.readFileSync(QUEUE_PATH, 'utf-8')
      .split('\n')
      .filter(l => l.startsWith('#') || l.trim() === '')
      .join('\n');

    if (failedUrls.length > 0) {
      fs.writeFileSync(QUEUE_PATH, header + '\n# Failed (will retry next run)\n' + failedUrls.join('\n') + '\n');
      console.log(`  \ud83d\udcea Queue updated: ${failedUrls.length} failed item(s) kept for retry`);
    } else {
      fs.writeFileSync(QUEUE_PATH, header + '\n');
      console.log('  \ud83d\udcea Queue cleared');
    }
  }

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  \u2705 Added: ${results.success}  |  \u23ed\ufe0f Skipped: ${results.skipped}  |  \u274c Failed: ${results.failed}`);
  console.log('='.repeat(50));
  for (const item of results.items) {
    const icon = item.status === 'success' ? '\u2705' : item.status === 'duplicate' ? '\u23ed\ufe0f' : '\u274c';
    console.log(`  ${icon} #${item.id || '?'} ${item.name || item.url}`);
  }
  console.log('\n\u2728 Done!\n');
}

main().catch(async e => {
  console.error('\n\u274c Fatal error:', e.message);
  if (VERBOSE) console.error(e);
  await closeBrowsers();
  process.exit(1);
});
