#!/usr/bin/env node
/**
 * FASHION. — Migrate Stores to Folder Structure
 * ================================================
 * Splits data/stores.json into individual data/stores/{slug}/meta.json files
 * and generates data/store-index.json.
 *
 * Usage:
 *   node scripts/migrate-stores.js
 *   node scripts/migrate-stores.js --verbose
 *
 * This is a one-time migration script. After running, the old
 * data/stores.json can be deleted once all JS files are updated.
 */

const fs = require('fs');
const path = require('path');

const STORES_JSON = path.join(__dirname, '..', 'data', 'stores.json');
const STORES_DIR = path.join(__dirname, '..', 'data', 'stores');
const INDEX_PATH = path.join(__dirname, '..', 'data', 'store-index.json');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

function log(msg) { if (VERBOSE) console.log(`  [v] ${msg}`); }

// Known slug overrides (names that don't slugify cleanly)
const KNOWN_SLUGS = {
  'END. Clothing': 'end-clothing',
  'Foot Locker': 'foot-locker',
  'SNS (Sneakersnstuff)': 'sns',
  'MR PORTER': 'mr-porter'
};

function toSlug(name) {
  if (KNOWN_SLUGS[name]) return KNOWN_SLUGS[name];
  return name.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+$/, '');
}

function main() {
  console.log('\n🏪 FASHION. — Migrate Stores to Folders');
  console.log('='.repeat(45));

  if (!fs.existsSync(STORES_JSON)) {
    console.log('  ❌ data/stores.json not found.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(STORES_JSON, 'utf-8'));
  const indexEntries = [];
  let count = 0;

  for (const cat of data.categories) {
    for (const store of cat.stores) {
      const slug = toSlug(store.name);
      const storeDir = path.join(STORES_DIR, slug);

      // Create folder
      fs.mkdirSync(storeDir, { recursive: true });

      // Build meta.json — merge with existing scraper data if present
      const meta = {
        slug,
        name: store.name,
        url: store.url || '',
        saleUrl: store.saleUrl || '',
        flag: store.flag,
        country: store.country,
        category: cat.name,
        categoryIcon: cat.icon,
        description: store.description || '',
        currentDeal: store.currentDeal || ''
      };

      // Merge existing scraper metadata if it exists
      const oldMetaPath = path.join(STORES_DIR, `${slug}.json`);
      if (fs.existsSync(oldMetaPath)) {
        const scraperData = JSON.parse(fs.readFileSync(oldMetaPath, 'utf-8'));
        if (scraperData.currency) meta.currency = scraperData.currency;
        if (scraperData.shipsTo) meta.shipsTo = scraperData.shipsTo;
        if (scraperData.scrapeMethod) meta.scrapeMethod = scraperData.scrapeMethod;
        log(`Merged scraper data from ${slug}.json`);
      }

      // Add coordinates if present
      if (store.lat !== undefined) {
        meta.lat = store.lat;
        meta.lng = store.lng;
      }

      fs.writeFileSync(
        path.join(storeDir, 'meta.json'),
        JSON.stringify(meta, null, 2) + '\n'
      );

      indexEntries.push({
        slug,
        name: store.name,
        flag: store.flag,
        country: store.country,
        category: cat.name,
        categoryIcon: cat.icon
      });

      count++;
      log(`✅ ${store.flag} ${store.name} → data/stores/${slug}/meta.json`);
    }
  }

  // Build store-index.json
  const categories = [...new Set(indexEntries.map(e => e.category))];
  const index = {
    generated: new Date().toISOString(),
    totalStores: indexEntries.length,
    categories,
    stores: indexEntries
  };

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n');

  console.log(`\n  🏪 Migrated: ${count} stores`);
  console.log(`  📂 Categories: ${categories.length}`);
  console.log(`  💾 Index saved to data/store-index.json`);
  console.log('\n✨ Done! You can now delete data/stores.json and the old data/stores/*.json flat files.\n');
}

main();
