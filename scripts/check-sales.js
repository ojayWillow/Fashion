#!/usr/bin/env node
/**
 * FASHION. — Sale Checker
 * =========================
 * Re-visits every pick's product URL to check:
 *   - Is the sale still active? (page alive, not 404)
 *   - Has the price changed?
 *   - Which sizes are still available?
 *   - Should we mark it as ended/sold out?
 *
 * Adds tracking fields to each pick:
 *   status: 'active' | 'ended' | 'sold_out' | 'price_changed'
 *   lastChecked: ISO timestamp
 *   priceHistory: [{ date, salePrice, retailPrice }]
 *   sizesHistory: [{ date, available, total }]
 *   _linkDead: boolean (used by frontend for 'Unavailable' badge)
 *
 * Usage:
 *   node scripts/check-sales.js
 *   node scripts/check-sales.js --verbose
 *   node scripts/check-sales.js --id 5           (check single pick)
 *   node scripts/check-sales.js --brand Jordan   (check only Jordan)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { extractDomain, parsePrice } = require('../lib/helpers');
const { loadStoreConfig, isFootLocker } = require('../lib/stores');
const { scrapePage, closeBrowsers } = require('../lib/scraper');

const PICKS_PATH = path.join(__dirname, '..', 'data', 'picks.json');

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const SINGLE_ID = args.includes('--id') ? parseInt(args[args.indexOf('--id') + 1]) : null;
const BRAND_FILTER = args.includes('--brand') ? args[args.indexOf('--brand') + 1] : null;

function log(msg) { if (VERBOSE) console.log(`    [v] ${msg}`); }

async function checkPick(pick) {
  const domain = extractDomain(pick.url);
  const config = loadStoreConfig(domain);
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  // Initialize tracking fields if missing
  if (!pick.priceHistory) pick.priceHistory = [];
  if (!pick.sizesHistory) pick.sizesHistory = [];

  try {
    const scraped = await scrapePage(pick.url, config);

    const newSalePrice = parsePrice(scraped.salePrice);
    const newRetailPrice = parsePrice(scraped.retailPrice);
    const currentSalePrice = parsePrice(pick.salePrice);
    const newSizes = scraped.sizes || [];
    const oldSizeCount = pick.sizes ? pick.sizes.length : 0;

    // ===== STATUS DETERMINATION =====
    let status = 'active';
    let changes = [];

    // Price change detection
    if (newSalePrice && currentSalePrice && newSalePrice !== currentSalePrice) {
      status = 'price_changed';
      const direction = newSalePrice < currentSalePrice ? '📉 DROPPED' : '📈 INCREASED';
      changes.push(`${direction}: ${pick.salePrice} → ${scraped.salePrice}`);
    }

    // Size availability
    if (newSizes.length === 0 && oldSizeCount > 0) {
      status = 'sold_out';
      changes.push(`🚫 All sizes sold out (was ${oldSizeCount})`);
    } else if (newSizes.length < oldSizeCount) {
      changes.push(`📦 Sizes: ${oldSizeCount} → ${newSizes.length}`);
    } else if (newSizes.length > oldSizeCount) {
      changes.push(`📦 Sizes restocked: ${oldSizeCount} → ${newSizes.length}`);
    }

    // Name not found = probably 404 or page changed
    if (!scraped.name || scraped.name === 'Unknown Product') {
      status = 'ended';
      changes.push('⚠️  Product page may be gone');
    }

    // ===== UPDATE PICK =====
    pick.status = status;
    pick.lastChecked = now;
    pick._linkDead = (status === 'ended');

    // Update current data if we got valid new data
    if (newSalePrice) {
      pick.salePrice = scraped.salePrice || pick.salePrice;
    }
    if (newSizes.length > 0) {
      pick.sizes = newSizes;
    }

    // Price history (avoid duplicate entries for same day)
    const lastPrice = pick.priceHistory[pick.priceHistory.length - 1];
    if (!lastPrice || lastPrice.date !== today || lastPrice.salePrice !== (scraped.salePrice || pick.salePrice)) {
      pick.priceHistory.push({
        date: today,
        salePrice: scraped.salePrice || pick.salePrice,
        retailPrice: scraped.retailPrice || pick.retailPrice,
      });
    }

    // Size history
    const lastSizes = pick.sizesHistory[pick.sizesHistory.length - 1];
    const currentAvailable = newSizes.length || oldSizeCount;
    const currentTotal = scraped._totalSizes || currentAvailable;
    if (!lastSizes || lastSizes.date !== today || lastSizes.available !== currentAvailable) {
      pick.sizesHistory.push({
        date: today,
        available: currentAvailable,
        total: currentTotal,
      });
    }

    // Keep history manageable (last 30 entries)
    if (pick.priceHistory.length > 30) pick.priceHistory = pick.priceHistory.slice(-30);
    if (pick.sizesHistory.length > 30) pick.sizesHistory = pick.sizesHistory.slice(-30);

    return { status, changes };

  } catch (e) {
    log(`Error checking pick #${pick.id}: ${e.message}`);

    // Network/scraping error — might be temporary, don't mark as dead yet
    pick.lastChecked = now;
    if (!pick._checkFailCount) pick._checkFailCount = 0;
    pick._checkFailCount++;

    // After 3 consecutive failures, mark as potentially dead
    if (pick._checkFailCount >= 3) {
      pick.status = 'ended';
      pick._linkDead = true;
      return { status: 'ended', changes: ['❌ 3+ check failures — marked as ended'] };
    }

    return { status: 'error', changes: [`⚠️  Check failed: ${e.message}`] };
  }
}

async function main() {
  console.log('\n🔥 FASHION. — Sale Checker');
  console.log('='.repeat(50));

  const picksData = JSON.parse(fs.readFileSync(PICKS_PATH, 'utf-8'));
  let picks = picksData.picks;

  // Filter if requested
  if (SINGLE_ID) {
    picks = picks.filter(p => p.id === SINGLE_ID);
    if (picks.length === 0) {
      console.log(`\n  ⚠️  No pick with ID ${SINGLE_ID}`);
      return;
    }
  }
  if (BRAND_FILTER) {
    picks = picks.filter(p => p.brand && p.brand.toLowerCase().includes(BRAND_FILTER.toLowerCase()));
    if (picks.length === 0) {
      console.log(`\n  ⚠️  No picks matching brand "${BRAND_FILTER}"`);
      return;
    }
  }

  console.log(`\n  📦 Checking ${picks.length} pick${picks.length > 1 ? 's' : ''}...\n`);

  const results = { active: 0, price_changed: 0, sold_out: 0, ended: 0, error: 0 };

  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    console.log(`  [${i + 1}/${picks.length}] #${pick.id} ${pick.brand} — ${pick.name}`);

    const { status, changes } = await checkPick(pick);
    results[status] = (results[status] || 0) + 1;

    const icon = status === 'active' ? '✅'
      : status === 'price_changed' ? '💰'
      : status === 'sold_out' ? '🚫'
      : status === 'ended' ? '💀'
      : '⚠️';

    console.log(`  ${icon} ${status.toUpperCase()}`);
    for (const change of changes) {
      console.log(`     ${change}`);
    }

    // Reset fail count on successful check
    if (status !== 'error') {
      pick._checkFailCount = 0;
    }
  }

  await closeBrowsers();

  // Save updated picks
  fs.writeFileSync(PICKS_PATH, JSON.stringify(picksData, null, 2) + '\n');
  console.log('\n  💾 Updated picks.json');

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ✅ Active:        ${results.active}`);
  console.log(`  💰 Price Changed: ${results.price_changed}`);
  console.log(`  🚫 Sold Out:      ${results.sold_out}`);
  console.log(`  💀 Ended:         ${results.ended}`);
  console.log(`  ⚠️  Errors:        ${results.error}`);
  console.log('='.repeat(50));
  console.log('\n✨ Done!\n');
}

main().catch(async e => {
  console.error('\n❌ Fatal error:', e.message);
  if (VERBOSE) console.error(e);
  await closeBrowsers();
  process.exit(1);
});
