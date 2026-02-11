#!/usr/bin/env node
/**
 * FASHION. — Picks Health Check (lightweight)
 * =============================================
 * Validates all product URLs and image URLs in picks.json
 * without downloading anything. Outputs a quick health report.
 *
 * Usage:
 *   node scripts/validate-picks.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const PICKS_JSON_PATH = path.join(__dirname, '..', 'data', 'picks.json');
const TIMEOUT_MS = 10000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function headCheck(url) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const req = client.request(url, {
        method: 'HEAD',
        timeout: TIMEOUT_MS,
        headers: { 'User-Agent': USER_AGENT }
      }, (res) => {
        res.resume();
        // Follow one redirect
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          return headCheck(new URL(res.headers.location, url).href).then(resolve);
        }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode });
      });
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 'timeout' }); });
      req.on('error', (e) => resolve({ ok: false, status: e.code || 'error' }));
      req.end();
    } catch {
      resolve({ ok: false, status: 'invalid-url' });
    }
  });
}

async function main() {
  console.log('\n🏥 FASHION. Picks Health Check\n' + '='.repeat(40) + '\n');

  const data = JSON.parse(fs.readFileSync(PICKS_JSON_PATH, 'utf-8'));
  const picks = data.picks;

  let healthy = 0, issues = 0;

  for (const pick of picks) {
    process.stdout.write(`[${pick.id}/${picks.length}] ${pick.name.substring(0, 40).padEnd(40)} `);

    const [imgResult, linkResult] = await Promise.all([
      pick.image.startsWith('http') ? headCheck(pick.image) : Promise.resolve({ ok: true, status: 'local' }),
      headCheck(pick.url)
    ]);

    const imgIcon = imgResult.ok ? '🖼️ ✅' : '🖼️ ❌';
    const linkIcon = linkResult.ok ? '🔗✅' : '🔗❌';

    console.log(`${imgIcon}(${imgResult.status})  ${linkIcon}(${linkResult.status})`);

    if (imgResult.ok && linkResult.ok) healthy++;
    else issues++;
  }

  console.log('\n' + '='.repeat(40));
  console.log(`✅ Healthy: ${healthy}/${picks.length}`);
  console.log(`⚠️  Issues:  ${issues}/${picks.length}`);
  console.log('='.repeat(40) + '\n');

  if (issues > 0) {
    console.log('💡 Run "node scripts/fetch-images.js" to fix image issues');
    console.log('   Dead product links need manual replacement in picks.json\n');
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
