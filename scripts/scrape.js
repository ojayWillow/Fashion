#!/usr/bin/env node
/**
 * FASHION. — Scrape
 * ==================
 * Single entry point. Reads URLs from data/queue.txt,
 * scrapes each product, saves to the correct locations,
 * and rebuilds the catalog index.
 *
 * Data flow:
 *   queue.txt → adapter.extract() → image pipeline → writer
 *     → data/products/{productId}.json    (catalog)
 *     → data/inventory/{store-slug}.json  (per-store)
 *     → data/index.json                   (rebuilt)
 *
 * Usage:
 *   node scripts/scrape.js
 *   node scripts/scrape.js --verbose
 *   node scripts/scrape.js --dry-run
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { extractDomain, slugify, storeSlug, log, setVerbose } = require('./lib/helpers');
const { processImage } = require('./lib/image');
const { saveProduct, saveToInventory, rebuildIndex } = require('./lib/writer');
const { extractWithAdapter } = require('./adapters/base');

// ===== PATHS =====
const QUEUE_PATH = path.join(__dirname, '..', 'data', 'queue.txt');
const DONE_PATH = path.join(__dirname, '..', 'data', 'queue-done.txt');
const PRODUCTS_DIR = path.join(__dirname, '..', 'data', 'products');

// ===== CLI =====
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const DRY_RUN = args.includes('--dry-run') || args.includes('--dry');

setVerbose(VERBOSE);

// ===== STORE REGISTRY =====
// Maps domains to store metadata. Add new stores here.
const STORE_MAP = {
  'endclothing.com':         { name: 'END. Clothing', flag: '🇬🇧', country: 'UK', currency: 'GBP', scrapeMethod: 'browser' },
  'sneakersnstuff.com':      { name: 'SNS', flag: '🇸🇪', country: 'Sweden', currency: 'EUR', scrapeMethod: 'browser' },
  'footlocker.nl':           { name: 'Foot Locker', flag: '🇪🇺', country: 'Netherlands', currency: 'EUR', scrapeMethod: 'patchright' },
  'footlocker.co.uk':        { name: 'Foot Locker UK', flag: '🇬🇧', country: 'UK', currency: 'GBP', scrapeMethod: 'patchright' },
  'footlocker.com':          { name: 'Foot Locker US', flag: '🇺🇸', country: 'US', currency: 'USD', scrapeMethod: 'patchright' },
  'footlocker.de':           { name: 'Foot Locker DE', flag: '🇩🇪', country: 'Germany', currency: 'EUR', scrapeMethod: 'patchright' },
  'footlocker.fr':           { name: 'Foot Locker FR', flag: '🇫🇷', country: 'France', currency: 'EUR', scrapeMethod: 'patchright' },
  'mrporter.com':            { name: 'MR PORTER', flag: '🇬🇧', country: 'UK', currency: 'GBP', scrapeMethod: 'patchright' },
  'net-a-porter.com':        { name: 'NET-A-PORTER', flag: '🇬🇧', country: 'UK', currency: 'GBP', scrapeMethod: 'patchright' },
  'nike.com':                { name: 'Nike', flag: '🇺🇸', country: 'US', currency: 'USD', scrapeMethod: 'browser' },
  'adidas.com':              { name: 'adidas', flag: '🇩🇪', country: 'Germany', currency: 'EUR', scrapeMethod: 'browser' },
  'newbalance.com':          { name: 'New Balance', flag: '🇺🇸', country: 'US', currency: 'USD', scrapeMethod: 'browser' },
};

function matchStore(domain) {
  const domainLower = domain.toLowerCase();
  // Exact match
  if (STORE_MAP[domainLower]) return { ...STORE_MAP[domainLower], slug: storeSlug(STORE_MAP[domainLower].name) };
  // Partial match (e.g. www.endclothing.com → endclothing.com)
  for (const [key, store] of Object.entries(STORE_MAP)) {
    if (domainLower.includes(key.split('.')[0])) {
      return { ...store, slug: storeSlug(store.name) };
    }
  }
  // Unknown store
  const name = domainLower.split('.')[0];
  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    flag: '🌐', country: 'Unknown', currency: 'EUR',
    scrapeMethod: 'browser',
    slug: storeSlug(name),
  };
}

// ===== DUPLICATE CHECK =====
function isDuplicate(url, productId) {
  // Check by product file existence
  if (productId) {
    const productPath = path.join(PRODUCTS_DIR, `${productId}.json`);
    if (fs.existsSync(productPath)) {
      // Check if this exact store URL is already a listing
      const existing = JSON.parse(fs.readFileSync(productPath, 'utf-8'));
      const hasListing = existing.listings.some(l => l.url === url);
      if (hasListing) return { duplicate: true, reason: 'exact URL exists', existing };
      // Same product, new store → will add listing
      return { duplicate: false, addListing: true, existing };
    }
  }
  return { duplicate: false };
}

// ===== QUEUE =====
function readQueue() {
  if (!fs.existsSync(QUEUE_PATH)) {
    console.log('  ❌ No queue file found at data/queue.txt');
    return [];
  }
  const content = fs.readFileSync(QUEUE_PATH, 'utf-8');
  return content.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && l.startsWith('http'));
}

// ===== MAIN =====
async function main() {
  console.log('\n🔥 FASHION. — Scrape');
  console.log('='.repeat(50));
  if (DRY_RUN) console.log('  🧪 DRY RUN — nothing will be saved\n');

  fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

  const urls = readQueue();
  if (urls.length === 0) {
    console.log('\n  📪 Queue is empty. Paste URLs into data/queue.txt\n');
    return;
  }

  console.log(`  📦 ${urls.length} URL${urls.length > 1 ? 's' : ''} in queue\n`);

  const results = { success: 0, skipped: 0, failed: 0, items: [] };
  const processedUrls = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const domain = extractDomain(url);
    const store = matchStore(domain);

    console.log(`\n  [${i + 1}/${urls.length}] ${store.flag} ${store.name}`);
    console.log(`  ${url}`);

    try {
      // 1. Extract product data via adapter
      const scraped = await extractWithAdapter(url, domain, store);

      if (!scraped || !scraped.name) {
        console.log('  ❌ Adapter returned no data');
        results.failed++;
        results.items.push({ url, status: 'failed', error: 'no data' });
        processedUrls.push(url);
        continue;
      }

      // 2. Check for duplicates
      const productId = scraped.styleCode || slugify(scraped.name);
      const dupeCheck = isDuplicate(url, productId);

      if (dupeCheck.duplicate) {
        console.log(`  ⏭️  SKIP — ${dupeCheck.reason}`);
        results.skipped++;
        results.items.push({ url, status: 'duplicate', productId });
        processedUrls.push(url);
        continue;
      }

      // 3. Process image
      const imageResult = await processImage({
        imageUrl: scraped.image,
        brand: scraped.brand,
        productId,
        name: scraped.name,
        styleCode: scraped.styleCode,
      });

      // 4. Build listing for this store
      const listing = {
        store: store.slug,
        url,
        retailPrice: scraped.retailPrice,
        salePrice: scraped.salePrice,
        discount: scraped.discount,
        sizes: scraped.sizes,
        lastScraped: new Date().toISOString(),
        available: true,
      };

      // 5. Build or update product
      let product;
      if (dupeCheck.addListing && dupeCheck.existing) {
        // Add new listing to existing product
        product = dupeCheck.existing;
        product.listings.push(listing);
        // Update image if the new one is better
        if (imageResult.imageStatus === 'ok' && product.imageStatus !== 'ok') {
          product.image = imageResult.image;
          product.originalImage = imageResult.originalImage;
          product.imageStatus = imageResult.imageStatus;
        }
        console.log(`  ➕ Added listing to existing product ${productId}`);
      } else {
        // New product
        product = {
          productId,
          name: scraped.name,
          brand: scraped.brand,
          colorway: scraped.colorway || '',
          category: scraped.category || 'Sneakers',
          tags: scraped.tags || [],
          image: imageResult.image,
          originalImage: imageResult.originalImage,
          imageStatus: imageResult.imageStatus,
          description: (scraped.description || '').substring(0, 300),
          listings: [listing],
        };
      }

      // 6. Save
      if (!DRY_RUN) {
        saveProduct(product);
        saveToInventory(store, product, listing);
      }

      // 7. Log result
      const priceStr = listing.salePrice
        ? `${listing.retailPrice?.amount || '?'} → ${listing.salePrice.amount} ${listing.salePrice.currency} (${listing.discount}%)`
        : '⚠️ no price';

      console.log(`  ✅ ${scraped.name}`);
      console.log(`     ${scraped.brand} | ${priceStr}`);
      console.log(`     Sizes: ${scraped.sizes.length > 0 ? scraped.sizes.join(', ') : 'none'}`);
      console.log(`     Image: ${imageResult.imageStatus} | ${imageResult.image ? '✅' : '❌'}`);
      console.log(`     → products/${productId}.json + inventory/${store.slug}.json`);

      results.success++;
      results.items.push({ url, status: 'success', productId });
      processedUrls.push(url);

    } catch (err) {
      console.log(`  ❌ ${err.message}`);
      if (VERBOSE) console.error(err);
      results.failed++;
      results.items.push({ url, status: 'failed', error: err.message });
      processedUrls.push(url);
    }
  }

  // Rebuild index
  if (!DRY_RUN && results.success > 0) {
    console.log('\n  📊 Rebuilding index...');
    rebuildIndex();
    console.log('  💾 Saved data/index.json');
  }

  // Move processed URLs to done
  if (!DRY_RUN && processedUrls.length > 0) {
    const timestamp = new Date().toISOString().split('T')[0];
    fs.appendFileSync(DONE_PATH, `\n# Processed ${timestamp}\n${processedUrls.join('\n')}\n`);
    // Clear queue (keep comments)
    const header = fs.readFileSync(QUEUE_PATH, 'utf-8')
      .split('\n')
      .filter(l => l.startsWith('#') || l.trim() === '')
      .join('\n');
    fs.writeFileSync(QUEUE_PATH, header + '\n');
  }

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ✅ ${results.success}  |  ⏭️ ${results.skipped}  |  ❌ ${results.failed}`);
  console.log('='.repeat(50));
  for (const item of results.items) {
    const icon = item.status === 'success' ? '✅' : item.status === 'duplicate' ? '⏭️' : '❌';
    console.log(`  ${icon} ${item.productId || item.error || '?'} — ${item.url}`);
  }
  console.log('\n✨ Done!\n');
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  if (VERBOSE) console.error(err);
  process.exit(1);
});
