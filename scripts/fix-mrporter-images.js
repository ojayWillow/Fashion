#!/usr/bin/env node
/**
 * fix-mrporter-images.js
 *
 * Updates all Mr. Porter product image URLs in data/products/*P.json
 * - Replaces: f_auto,q_auto,w_800,h_800,c_pad,b_white
 * - With:     f_auto,q_auto/e_trim/w_800,h_800,c_pad,b_rgb:F5F5F7
 *
 * Usage:  node scripts/fix-mrporter-images.js
 */

const fs = require('fs');
const path = require('path');

const PRODUCTS_DIR = path.join(__dirname, '..', 'data', 'products');
const OLD_TRANSFORM = 'f_auto,q_auto,w_800,h_800,c_pad,b_white';
const NEW_TRANSFORM = 'f_auto,q_auto/e_trim/w_800,h_800,c_pad,b_rgb:F5F5F7';

const files = fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith('P.json'));

console.log(`Found ${files.length} Mr. Porter product files.\n`);

let updated = 0;
let skipped = 0;

for (const file of files) {
  const filePath = path.join(PRODUCTS_DIR, file);
  const raw = fs.readFileSync(filePath, 'utf-8');

  if (raw.includes(OLD_TRANSFORM)) {
    const fixed = raw.replace(OLD_TRANSFORM, NEW_TRANSFORM);
    fs.writeFileSync(filePath, fixed, 'utf-8');
    console.log(`  ✅ ${file}`);
    updated++;
  } else if (raw.includes(NEW_TRANSFORM)) {
    console.log(`  ⏭️  ${file} (already fixed)`);
    skipped++;
  } else {
    console.log(`  ⚠️  ${file} (no matching transform found)`);
    skipped++;
  }
}

console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}, Total: ${files.length}`);
console.log('\nNow run:');
console.log('  git add data/products/');
console.log('  git commit -m "fix: update Cloudinary image URLs in Mr. Porter products"');
console.log('  git push');
