#!/usr/bin/env node
/**
 * reprocess-images.js
 * ====================
 * Goes through ALL product JSONs in data/products/
 * and re-fetches images using brand CDN (or normalizes store images).
 *
 * This fixes inconsistent image sizing/framing across stores.
 *
 * Usage:
 *   node scripts/reprocess-images.js
 *   node scripts/reprocess-images.js --brand Nike
 *   node scripts/reprocess-images.js --store mr-porter
 *   node scripts/reprocess-images.js --dry-run
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { processImage } = require('./lib/image');
const { log, slugify } = require('./lib/helpers');

const PRODUCTS_DIR = path.join(__dirname, '..', 'data', 'products');

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const brandIdx = args.indexOf('--brand');
const BRAND_FILTER = brandIdx !== -1 ? args[brandIdx + 1] : null;
const storeIdx = args.indexOf('--store');
const STORE_FILTER = storeIdx !== -1 ? args[storeIdx + 1] : null;
const FORCE = args.includes('--force');

async function main() {
  console.log('\n\uD83D\uDDBC\uFE0F  FASHION. \u2014 Reprocess Images');
  console.log('='.repeat(50));
  if (DRY_RUN) console.log('  \uD83E\uDDEA DRY RUN \u2014 nothing will be saved\n');
  if (BRAND_FILTER) console.log(`  \uD83C\uDFF7\uFE0F  Brand filter: ${BRAND_FILTER}`);
  if (STORE_FILTER) console.log(`  \uD83C\uDFEC Store filter: ${STORE_FILTER}`);
  if (FORCE) console.log('  \u26A1 Force mode \u2014 reprocess even if imageStatus is ok');
  console.log('');

  const files = fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith('.json') && f !== '.gitkeep');
  console.log(`  Found ${files.length} product files\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let noChange = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(PRODUCTS_DIR, file);
    let product;

    try {
      product = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      console.log(`  \u274C ${file} \u2014 invalid JSON`);
      failed++;
      continue;
    }

    // Apply filters
    if (BRAND_FILTER && product.brand && product.brand.toLowerCase() !== BRAND_FILTER.toLowerCase()) {
      skipped++;
      continue;
    }

    if (STORE_FILTER) {
      const hasStore = (product.listings || []).some(l => l.store === STORE_FILTER);
      if (!hasStore) {
        skipped++;
        continue;
      }
    }

    // Skip if already ok (unless --force)
    if (!FORCE && product.imageStatus === 'ok' && product.image && product.image.includes('cloudinary')) {
      // Still reprocess \u2014 the point is to get better images
      // Only skip if we want to be conservative
    }

    const styleCode = product.productId || '';
    const originalImage = product.originalImage || product.image || '';

    // Find the store image URL from listings if we need fallback
    let storeImageUrl = originalImage;
    if (!storeImageUrl || storeImageUrl.includes('cloudinary')) {
      // Try to find the original store image from any listing
      // If not available, we'll rely on brand CDN
      storeImageUrl = '';
    }

    console.log(`  [${i + 1}/${files.length}] ${product.brand || '?'} \u2014 ${product.name || file}`);
    console.log(`    Style: ${styleCode}`);

    try {
      const result = await processImage({
        imageUrl: storeImageUrl,
        brand: product.brand,
        productId: product.productId,
        name: product.name,
        styleCode,
      });

      if (result.image && result.image !== product.image) {
        console.log(`    \u2705 New image: ${result.imageStatus}`);
        console.log(`    \u2192 ${result.image.substring(0, 80)}...`);

        if (!DRY_RUN) {
          product.image = result.image;
          product.originalImage = result.originalImage || product.originalImage;
          product.imageStatus = result.imageStatus;
          fs.writeFileSync(filePath, JSON.stringify(product, null, 2), 'utf-8');
        }
        updated++;
      } else if (result.image) {
        console.log(`    \u2796 No change (same image)`);
        noChange++;
      } else {
        console.log(`    \u26A0\uFE0F  No image found`);
        failed++;
      }
    } catch (e) {
      console.log(`    \u274C Error: ${e.message}`);
      failed++;
    }

    // Small delay between products
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  \u2705 Updated: ${updated}`);
  console.log(`  \u2796 No change: ${noChange}`);
  console.log(`  \u23ED\uFE0F  Skipped: ${skipped}`);
  console.log(`  \u274C Failed: ${failed}`);
  console.log('='.repeat(50));

  if (updated > 0 && !DRY_RUN) {
    console.log('\n  Now run:');
    console.log('    git add data/products/');
    console.log('    git commit -m "fix: reprocessed product images via brand CDN"');
    console.log('    git push');
  }

  console.log('\n\u2728 Done!\n');
}

main().catch(e => {
  console.error('\n\u274C Fatal:', e.message);
  console.error(e);
  process.exit(1);
});
