#!/usr/bin/env node
/**
 * fetch-images.js
 * ===============
 * Downloads product images and removes white backgrounds.
 * Saves transparent PNGs to data/images/{store}/ for review.
 *
 * Usage:
 *   node scripts/fetch-images.js
 *   node scripts/fetch-images.js --store mr-porter
 *   node scripts/fetch-images.js --store end-clothing
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('Missing dependency: npm install sharp');
  process.exit(1);
}

// ===== CONFIG =====

const STORES = {
  'mr-porter': 'data/inventory/mr-porter.json',
  'end-clothing': 'data/inventory/end-clothing.json',
};

const OUT_DIR = path.join(__dirname, '..', 'data', 'images');

// ===== HTTP =====

function download(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, { timeout, headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }}, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return download(new URL(res.headers.location, url).href, timeout).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

// ===== BACKGROUND REMOVAL =====

async function removeBackground(buffer) {
  // unflatten: makes near-white pixels transparent
  // Then pad to 800x800 with transparent background
  return sharp(buffer)
    .unflatten()
    .resize(800, 800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

// ===== MAIN =====

async function processStore(storeName, jsonPath) {
  const fullPath = path.join(__dirname, '..', jsonPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`  ✗ ${jsonPath} not found, skipping`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const products = data.products || [];
  const outDir = path.join(OUT_DIR, storeName);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n${data.store || storeName} — ${products.length} products`);
  console.log(`Output → ${outDir}\n`);

  let ok = 0, fail = 0;

  for (const p of products) {
    const id = p.id || p.picksId || p.name;
    const imageUrl = p.image;

    if (!imageUrl) {
      console.log(`  ✗ ${id} — no image URL`);
      fail++;
      continue;
    }

    const filename = `${p.picksId || p.id}-${slugify(p.name)}.png`;
    const outPath = path.join(outDir, filename);

    // Skip if already processed
    if (fs.existsSync(outPath)) {
      console.log(`  ⊘ ${filename} — already exists, skip`);
      ok++;
      continue;
    }

    try {
      process.stdout.write(`  ↓ ${filename}...`);
      const raw = await download(imageUrl);
      const transparent = await removeBackground(raw);
      fs.writeFileSync(outPath, transparent);
      console.log(` ✓ ${(transparent.length / 1024).toFixed(0)}KB`);
      ok++;
    } catch (e) {
      console.log(` ✗ ${e.message}`);
      fail++;
    }

    // Small delay to avoid hammering CDN
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n  Done: ${ok} ok, ${fail} failed`);
}

function slugify(str) {
  return (str || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

async function main() {
  const args = process.argv.slice(2);
  const storeFlag = args.indexOf('--store');
  const targetStore = storeFlag !== -1 ? args[storeFlag + 1] : null;

  console.log('=== FASHION. Image Fetcher ===');
  console.log(`Output: ${OUT_DIR}`);

  for (const [name, jsonPath] of Object.entries(STORES)) {
    if (targetStore && name !== targetStore) continue;
    await processStore(name, jsonPath);
  }

  console.log('\n✓ Done. Review images in data/images/ then re-upload good ones.');
}

main().catch(e => { console.error(e); process.exit(1); });
