#!/usr/bin/env node
/**
 * FASHION. — Remove Pick(s)
 * ===========================
 * Remove products from picks.json by ID, name (partial match), or URL.
 *
 * Usage:
 *   node scripts/remove-pick.js 5              # Remove pick #5
 *   node scripts/remove-pick.js 5 8 12         # Remove multiple by ID
 *   node scripts/remove-pick.js --name "Jordan" # Remove all picks matching name
 *   node scripts/remove-pick.js --url "footlocker.nl/..."  # Remove by URL
 *   node scripts/remove-pick.js --dry-run 5    # Preview without saving
 */

const fs = require('fs');
const path = require('path');

const PICKS_PATH = path.join(__dirname, '..', 'data', 'picks.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || args.includes('--dry');
const cleanArgs = args.filter(a => !a.startsWith('--'));

function showHelp() {
  console.log(`
🔥 FASHION. — Remove Pick
${'='.repeat(40)}

Usage:
  node scripts/remove-pick.js <id> [id2] [id3]    Remove by ID(s)
  node scripts/remove-pick.js --name "keyword"     Remove by name match
  node scripts/remove-pick.js --url "url-fragment"  Remove by URL match
  node scripts/remove-pick.js --list                List all picks

Flags:
  --dry-run    Preview what would be removed
`);
}

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

const picksData = JSON.parse(fs.readFileSync(PICKS_PATH, 'utf-8'));

// List mode
if (args.includes('--list')) {
  console.log(`\n📦 ${picksData.picks.length} picks:\n`);
  for (const p of picksData.picks) {
    const img = p.image ? '✅' : '❌';
    console.log(`  #${p.id}  ${img}  ${p.brand} — ${p.name}  (${p.store})`);
  }
  console.log();
  process.exit(0);
}

let toRemove = [];

// --name mode
const nameIdx = args.indexOf('--name');
if (nameIdx !== -1 && args[nameIdx + 1]) {
  const keyword = args[nameIdx + 1].toLowerCase();
  toRemove = picksData.picks.filter(p => p.name.toLowerCase().includes(keyword));
}

// --url mode
const urlIdx = args.indexOf('--url');
if (urlIdx !== -1 && args[urlIdx + 1]) {
  const fragment = args[urlIdx + 1].toLowerCase();
  toRemove = picksData.picks.filter(p => p.url.toLowerCase().includes(fragment));
}

// ID mode (default)
if (toRemove.length === 0 && cleanArgs.length > 0) {
  const ids = cleanArgs.map(Number).filter(n => !isNaN(n));
  toRemove = picksData.picks.filter(p => ids.includes(p.id));
}

if (toRemove.length === 0) {
  console.log('\n  ⚠️  No matching picks found.\n');
  process.exit(0);
}

console.log(`\n🔥 FASHION. — Remove Pick`);
console.log('='.repeat(50));
console.log(`\n  Found ${toRemove.length} pick(s) to remove:\n`);

for (const p of toRemove) {
  console.log(`  ❌ #${p.id}  ${p.brand} — ${p.name}  (${p.store})`);
}

if (DRY_RUN) {
  console.log('\n  🧪 DRY RUN — nothing removed.\n');
  process.exit(0);
}

const removeIds = new Set(toRemove.map(p => p.id));
picksData.picks = picksData.picks.filter(p => !removeIds.has(p.id));

fs.writeFileSync(PICKS_PATH, JSON.stringify(picksData, null, 2) + '\n');
console.log(`\n  ✅ Removed ${toRemove.length} pick(s). ${picksData.picks.length} remaining.`);
console.log('\n✨ Done!\n');
