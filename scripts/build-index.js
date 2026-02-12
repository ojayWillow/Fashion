#!/usr/bin/env node
/**
 * FASHION. — Build Catalog Index
 * ================================
 * Scans all inventory files in data/inventory/ and generates
 * data/catalog-index.json with aggregated counts.
 *
 * Usage:
 *   node scripts/build-index.js
 *   node scripts/build-index.js --verbose
 *
 * Run this after:
 *   - Adding new products via process-queue.js
 *   - Manually editing inventory files
 *   - Removing or archiving products
 */

const fs = require('fs');
const path = require('path');

const INVENTORY_DIR = path.join(__dirname, '..', 'data', 'inventory');
const INDEX_PATH = path.join(__dirname, '..', 'data', 'catalog-index.json');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

function log(msg) { if (VERBOSE) console.log(`  [v] ${msg}`); }

function main() {
  console.log('\n📊 FASHION. — Build Catalog Index');
  console.log('='.repeat(45));

  if (!fs.existsSync(INVENTORY_DIR)) {
    console.log('  ❌ No inventory directory found.');
    process.exit(1);
  }

  const files = fs.readdirSync(INVENTORY_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('  ❌ No inventory files found.');
    process.exit(1);
  }

  let totalProducts = 0;
  const stores = [];
  const categoryCounts = {};
  const brandCounts = {};
  const categoryIcons = {
    sneakers: '👟', hoodies: '🧥', shorts: '🩳', jackets: '🧥',
    boots: '🥾', clothing: '👕', accessories: '👜', pants: '👖',
    tshirts: '👕', sweaters: '🧶'
  };

  for (const file of files) {
    const filePath = path.join(INVENTORY_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const slug = file.replace('.json', '');

    // Count only active products
    const activeProducts = data.products.filter(p => p.status === 'active');
    const count = activeProducts.length;
    totalProducts += count;

    stores.push({
      slug,
      name: data.store,
      flag: data.storeFlag,
      count
    });

    log(`${data.storeFlag} ${data.store}: ${count} active products`);

    for (const product of activeProducts) {
      // Count categories
      const cat = product.category || 'other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      // Count brands
      const brand = product.brand;
      if (brand) {
        brandCounts[brand] = (brandCounts[brand] || 0) + 1;
      }
    }
  }

  // Sort stores by product count (descending)
  stores.sort((a, b) => b.count - a.count);

  // Build categories array sorted by count
  const categories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([slug, count]) => ({
      slug,
      name: slug.charAt(0).toUpperCase() + slug.slice(1),
      count,
      icon: categoryIcons[slug] || '🏷️'
    }));

  // Build brands array sorted by count
  const brands = Object.entries(brandCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  // Write index
  const index = {
    lastBuilt: new Date().toISOString(),
    totalProducts,
    stores,
    categories,
    brands
  };

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n');

  // Summary
  console.log(`\n  📦 Total: ${totalProducts} active products`);
  console.log(`  🏪 Stores: ${stores.length}`);
  stores.forEach(s => console.log(`     ${s.flag} ${s.name}: ${s.count}`));
  console.log(`  📂 Categories: ${categories.length}`);
  categories.forEach(c => console.log(`     ${c.icon} ${c.name}: ${c.count}`));
  console.log(`  🏷️  Brands: ${brands.length}`);
  brands.slice(0, 10).forEach(b => console.log(`     ${b.name}: ${b.count}`));
  if (brands.length > 10) console.log(`     ... and ${brands.length - 10} more`);
  console.log(`\n  💾 Saved to data/catalog-index.json`);
  console.log('\n✨ Done!\n');
}

main();
