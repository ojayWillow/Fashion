#!/usr/bin/env node
/**
 * FASHION. — Build Index
 * =======================
 * Rebuilds data/index.json from all product files.
 * Can be run standalone after manual edits.
 *
 * Usage:
 *   node scripts/build-index.js
 *   node scripts/build-index.js --verbose
 */

const { setVerbose } = require('./lib/helpers');
const { rebuildIndex } = require('./lib/writer');

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
setVerbose(VERBOSE);

console.log('\n📊 FASHION. — Build Index');
console.log('='.repeat(40));
rebuildIndex();
console.log('\n✨ Done!\n');
