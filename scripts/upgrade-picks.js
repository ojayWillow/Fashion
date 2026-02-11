#!/usr/bin/env node
/**
 * FASHION. — Upgrade Existing Picks
 * ===================================
 * One-time migration: adds category, subcategory, gender, and status
 * fields to all existing picks in picks.json.
 *
 * Also upgrades _originalImage URLs to highest resolution.
 *
 * Safe to run multiple times — skips picks that already have fields.
 *
 * Usage:
 *   node scripts/upgrade-picks.js
 *   node scripts/upgrade-picks.js --dry-run
 */

const fs = require('fs');
const path = require('path');

const { classify } = require('../lib/categories');
const { detectBrand, detectTags } = require('../lib/brands');
const { upgradeImageUrl } = require('../lib/images');

const PICKS_PATH = path.join(__dirname, '..', 'data', 'picks.json');
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('--dry');

console.log('\n🔥 FASHION. — Upgrade Picks');
console.log('='.repeat(50));
if (DRY_RUN) console.log('  🧪 DRY RUN\n');

const picksData = JSON.parse(fs.readFileSync(PICKS_PATH, 'utf-8'));
let upgraded = 0;

for (const pick of picksData.picks) {
  const changes = [];

  // Add category/subcategory/gender if missing
  if (!pick.category || !pick.subcategory) {
    const { category, subcategory, gender } = classify({
      name: pick.name,
      brand: pick.brand,
      description: pick.description,
      url: pick.url,
    });

    if (!pick.category) { pick.category = category; changes.push(`category: ${category}`); }
    if (!pick.subcategory) { pick.subcategory = subcategory; changes.push(`subcategory: ${subcategory}`); }
    if (!pick.gender) { pick.gender = gender; changes.push(`gender: ${gender || '(unknown)'}`); }
  }

  // Add status if missing
  if (!pick.status) {
    pick.status = 'active';
    changes.push('status: active');
  }

  // Ensure brand is detected
  if (!pick.brand) {
    const brand = detectBrand(pick.name);
    if (brand) { pick.brand = brand; changes.push(`brand: ${brand}`); }
  }

  // Regenerate tags with new data
  const oldTags = (pick.tags || []).join(', ');
  const newTags = detectTags(pick.name, pick.brand, pick.category);
  // Merge: keep existing unique tags + add new ones
  const merged = [...new Set([...newTags, ...(pick.tags || [])])];
  // Add subcategory as tag if it exists and isn't already there
  if (pick.subcategory && !merged.includes(pick.subcategory)) {
    merged.push(pick.subcategory);
  }
  if (JSON.stringify(merged) !== JSON.stringify(pick.tags)) {
    pick.tags = merged;
    changes.push(`tags: [${merged.join(', ')}]`);
  }

  // Upgrade _originalImage URL to highest res
  if (pick._originalImage) {
    const upgraded_url = upgradeImageUrl(pick._originalImage);
    if (upgraded_url !== pick._originalImage) {
      pick._originalImage = upgraded_url;
      changes.push('_originalImage: upgraded to HD');
    }
  }

  // Strip HTML from descriptions (FL descriptions had raw HTML)
  if (pick.description && pick.description.includes('<')) {
    pick.description = pick.description
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200);
    changes.push('description: cleaned HTML');
  }

  if (changes.length > 0) {
    console.log(`  #${pick.id} ${pick.brand} — ${pick.name}`);
    changes.forEach(c => console.log(`    + ${c}`));
    upgraded++;
  }
}

if (!DRY_RUN) {
  fs.writeFileSync(PICKS_PATH, JSON.stringify(picksData, null, 2) + '\n');
  console.log(`\n  💾 Saved. ${upgraded} picks upgraded.`);
} else {
  console.log(`\n  🧪 Would upgrade ${upgraded} picks.`);
}

console.log('\n✨ Done!\n');
