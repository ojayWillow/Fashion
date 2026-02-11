#!/usr/bin/env node
/**
 * FASHION. — One-Command Product Scraper
 * ==========================================
 * Paste any product URL → Playwright opens it → extracts everything →
 * adds it to picks.json with the correct store, image, prices, sizes.
 *
 * Usage:
 *   node scripts/add-pick.js "https://www.footlocker.nl/nl/product/~/314217367904.html"
 *   node scripts/add-pick.js URL --verbose
 *   node scripts/add-pick.js URL --dry-run   (preview without saving)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// ===== SHARED LIB =====
const { extractDomain, slugify, parsePrice, formatPrice, detectCurrency, calcDiscount, isValidSize, nextPickId } = require('../lib/helpers');
const { detectBrand, detectTags } = require('../lib/brands');
const { loadStoreConfig, matchStore, isFootLocker } = require('../lib/stores');
const { findDuplicate } = require('../lib/duplicates');
const cloud = require('../lib/cloudinary');
const { scrapePage, closeBrowsers } = require('../lib/scraper');

// ===== PATHS =====
const PICKS_PATH = path.join(__dirname, '..', 'data', 'picks.json');
const IMAGES_DIR = path.join(__dirname, '..', 'images', 'picks');

// ===== CLI =====
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const DRY_RUN = args.includes('--dry-run') || args.includes('--dry');
const productUrl = args.find(a => a.startsWith('http'));

if (!productUrl) {
  console.log(`
🔥 FASHION. — Add Pick
${'='.repeat(40)}

Usage:
  node scripts/add-pick.js <product-url>
  node scripts/add-pick.js <product-url> --verbose
  node scripts/add-pick.js <product-url> --dry-run

Examples:
  node scripts/add-pick.js "https://www.footlocker.nl/nl/product/~/314217367904.html"
  node scripts/add-pick.js "https://www.endclothing.com/gb/some-product.html"
  node scripts/add-pick.js "https://www.zalando.com/some-product.html" --verbose
`);
  process.exit(0);
}

function log(msg) { if (VERBOSE) console.log(`  [v] ${msg}`); }

async function main() {
  console.log(`\n\ud83d\udd25 FASHION. \u2014 Add Pick`);
  console.log('='.repeat(50));
  console.log(`  URL: ${productUrl}`);
  if (DRY_RUN) console.log('  \ud83e\uddea DRY RUN \u2014 nothing will be saved');
  console.log();

  cloud.init();
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  // 1. Detect store
  const domain = extractDomain(productUrl);
  const storeInfo = matchStore(domain);
  const config = loadStoreConfig(domain);
  const currency = isFootLocker(domain) ? detectCurrency(domain) : detectCurrency(domain);

  console.log(`  \ud83c\udfea Store: ${storeInfo.flag} ${storeInfo.name} (${storeInfo.category})`);
  console.log(`  \u2699\ufe0f  Config: ${config.name} [${config.renderMode}, ${config.waitTime}ms]`);
  console.log();

  // Check for duplicates
  const picksData = JSON.parse(fs.readFileSync(PICKS_PATH, 'utf-8'));
  const existing = findDuplicate(productUrl, picksData.picks);
  if (existing) {
    console.log(`  \u23ed\ufe0f  DUPLICATE \u2014 already exists as #${existing.id}: ${existing.name}`);
    console.log('  Use --force to add anyway.\n');
    if (!args.includes('--force')) process.exit(0);
  }

  // 2. Scrape the page
  const scraped = await scrapePage(productUrl, config);

  // 3. Process results
  const name = scraped.name || 'Unknown Product';
  const brand = scraped.brand || detectBrand(name) || '';
  const colorway = scraped.colorway || '';
  const salePrice = parsePrice(scraped.salePrice);
  const retailPrice = parsePrice(scraped.retailPrice);
  const discount = calcDiscount(salePrice, retailPrice);
  const sizes = (scraped.sizes || []).filter(s => isValidSize(s));
  const description = scraped.description || '';
  const styleCode = scraped.styleCode || '';
  const tags = detectTags(name, brand, storeInfo.category);

  // 4. Handle image
  let imageUrl = scraped.image || '';
  const nextId = nextPickId(picksData.picks);
  const filename = `${nextId}-${slugify(name)}`;

  if (imageUrl && cloud.isEnabled()) {
    console.log('  \u2601\ufe0f  Uploading image to Cloudinary...');
    const cdnUrl = await cloud.upload(imageUrl, `picks/${filename}`);
    if (cdnUrl) {
      log(`Cloudinary URL: ${cdnUrl}`);
      imageUrl = cdnUrl;
    }
  } else if (scraped._screenshotBuffer) {
    const buffer = Buffer.from(scraped._screenshotBuffer, 'base64');
    if (cloud.isEnabled()) {
      const cdnUrl = await cloud.upload(buffer, `picks/${filename}`);
      if (cdnUrl) imageUrl = cdnUrl;
    } else {
      const localPath = path.join(IMAGES_DIR, `${filename}.png`);
      fs.writeFileSync(localPath, buffer);
      imageUrl = `images/picks/${filename}.png`;
    }
  }

  // 5. Build the pick
  const newPick = {
    id: nextId,
    name, brand, styleCode, colorway,
    retailPrice: retailPrice ? formatPrice(retailPrice, currency) : '',
    salePrice: salePrice ? formatPrice(salePrice, currency) : '',
    discount,
    store: storeInfo.name,
    storeFlag: storeInfo.flag,
    image: imageUrl,
    url: productUrl,
    description: description.substring(0, 200),
    tags, sizes,
  };

  if (scraped.image && imageUrl !== scraped.image) {
    newPick._originalImage = scraped.image;
  }

  // 6. Display results
  console.log();
  console.log('  \ud83d\udce6 SCRAPED PRODUCT');
  console.log('  ' + '='.repeat(48));
  console.log(`  Name:        ${newPick.name}`);
  console.log(`  Brand:       ${newPick.brand || '(not detected)'}`);
  console.log(`  Colorway:    ${newPick.colorway || '(not found)'}`);
  console.log(`  Style Code:  ${newPick.styleCode || '(not found)'}`);
  console.log(`  Retail:      ${newPick.retailPrice || '\u26a0\ufe0f  not found'}`);
  console.log(`  Sale:        ${newPick.salePrice || '\u26a0\ufe0f  not found'}`);
  console.log(`  Discount:    ${newPick.discount}`);
  console.log(`  Store:       ${newPick.storeFlag} ${newPick.store}`);
  console.log(`  Category:    ${storeInfo.categoryIcon} ${storeInfo.category}`);
  console.log(`  Sizes:       ${newPick.sizes.length > 0 ? newPick.sizes.join(', ') : '\u26a0\ufe0f  none found'}`);
  console.log(`  Tags:        ${newPick.tags.join(', ')}`);
  console.log(`  Image:       ${newPick.image ? '\u2705' : '\u274c'} ${newPick.image ? newPick.image.substring(0, 60) + '...' : 'none'}`);
  console.log(`  Description: ${newPick.description.substring(0, 80)}...`);
  console.log(`  Pick ID:     #${newPick.id}`);
  console.log('  ' + '='.repeat(48));

  // 7. Save
  if (DRY_RUN) {
    console.log('\n  \ud83e\uddea DRY RUN \u2014 not saving. Run without --dry-run to save.');
    console.log('\n  Full JSON:');
    console.log(JSON.stringify(newPick, null, 2));
  } else {
    picksData.picks.push(newPick);
    fs.writeFileSync(PICKS_PATH, JSON.stringify(picksData, null, 2) + '\n');
    console.log(`\n  \u2705 Saved as pick #${newPick.id} in picks.json`);
    console.log(`  \ud83c\udfea Will appear under: ${storeInfo.flag} ${storeInfo.name}`);

    const warnings = [];
    if (!newPick.salePrice) warnings.push('Sale price not found \u2014 edit picks.json manually');
    if (!newPick.retailPrice) warnings.push('Retail price not found \u2014 edit picks.json manually');
    if (!newPick.image) warnings.push('Image not found \u2014 run: node scripts/fetch-images.js');
    if (newPick.sizes.length === 0) warnings.push('Sizes not found \u2014 edit picks.json manually');
    if (!newPick.brand) warnings.push('Brand not detected \u2014 edit picks.json manually');

    if (warnings.length > 0) {
      console.log('\n  \u26a0\ufe0f  Warnings:');
      warnings.forEach(w => console.log(`     \u2022 ${w}`));
    }
  }

  await closeBrowsers();
  console.log('\n\u2728 Done!\n');
}

main().catch(async e => {
  console.error('\n\u274c Fatal error:', e.message);
  if (VERBOSE) console.error(e);
  await closeBrowsers();
  process.exit(1);
});
