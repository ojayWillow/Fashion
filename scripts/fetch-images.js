#!/usr/bin/env node
/**
 * FASHION. — Automated Image Fetcher + Cloudinary Uploader
 * ==========================================================
 * 5-SOURCE IMAGE PIPELINE:
 *   1. END. Clothing media CDN
 *   2. GOAT sneaker database (by style code)
 *   3. Cloudinary remote fetch from original URL (Nike/NB CDN)
 *   4. Scrape og:image from store product page
 *   5. Construct alternative Nike URLs from style code
 *
 * Usage:
 *   node scripts/fetch-images.js
 *   node scripts/fetch-images.js --dry-run
 *   node scripts/fetch-images.js --force --verbose
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ===== CONFIG =====
const PICKS_JSON_PATH = path.join(__dirname, '..', 'data', 'picks.json');
const IMAGES_DIR = path.join(__dirname, '..', 'images', 'picks');
const TIMEOUT_MS = 20000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CLOUDINARY_FOLDER = 'picks';

// ===== CLI FLAGS =====
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const VERBOSE = args.includes('--verbose');
const LOCAL_ONLY = args.includes('--local');

// ===== CLOUDINARY SETUP =====
let cloudinary = null;
let CLOUD_ENABLED = false;
let CLOUD_NAME = '';

function initCloudinary() {
  if (LOCAL_ONLY) { console.log('📁 Local-only mode\n'); return; }

  const url = process.env.CLOUDINARY_URL;
  if (!url || url.includes('your_')) {
    console.log('⚠️  Cloudinary not configured — falling back to local\n');
    return;
  }

  const match = url.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/);
  if (!match) { console.log('⚠️  Invalid CLOUDINARY_URL\n'); return; }

  try {
    const [, apiKey, apiSecret, cloudName] = match;
    CLOUD_NAME = cloudName;
    cloudinary = require('cloudinary').v2;
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    CLOUD_ENABLED = true;
    console.log(`☁️  Cloudinary → ${cloudName}\n`);
  } catch (err) {
    console.log(`⚠️  Cloudinary init failed: ${err.message}\n`);
  }
}

// ===== HTTP HELPERS =====
function log(msg) { if (VERBOSE) console.log(`  [v] ${msg}`); }

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const maxRedirects = options.maxRedirects || 5;

    const req = client.get(url, {
      timeout: options.timeout || TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT, 'Accept': options.accept || '*/*', ...options.headers }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        const redir = new URL(res.headers.location, url).href;
        return fetchUrl(redir, { ...options, maxRedirects: maxRedirects - 1 }).then(resolve).catch(reject);
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

async function checkUrlAlive(url) {
  try {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    return new Promise((resolve) => {
      const req = client.request(url, { method: 'HEAD', timeout: TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          return checkUrlAlive(new URL(res.headers.location, url).href).then(resolve);
        }
        res.resume();
        resolve({ alive: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode });
      });
      req.on('timeout', () => { req.destroy(); resolve({ alive: false, status: 'timeout' }); });
      req.on('error', () => resolve({ alive: false, status: 'error' }));
      req.end();
    });
  } catch { return { alive: false, status: 'invalid-url' }; }
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
}

// ===== CLOUDINARY UPLOAD =====
async function uploadToCloudinary(source, filename) {
  if (!CLOUD_ENABLED) return null;
  try {
    const publicId = `${CLOUDINARY_FOLDER}/${path.parse(filename).name}`;

    let result;
    if (Buffer.isBuffer(source)) {
      result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { public_id: publicId, overwrite: true, resource_type: 'image' },
          (err, res) => { if (err) reject(err); else resolve(res); }
        );
        stream.end(source);
      });
    } else {
      // source is a URL string — Cloudinary fetches it from their servers
      result = await cloudinary.uploader.upload(source, {
        public_id: publicId, overwrite: true, resource_type: 'image',
      });
    }

    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${publicId}`;
  } catch (err) {
    log(`Cloudinary upload failed: ${err.message}`);
    return null;
  }
}

// =========================================================
// SOURCE 1: END. Clothing Media CDN
// =========================================================
async function tryEndClothing(pick) {
  log('Source 1: END. Clothing media CDN');

  // Extract slug from END. URL: /gb/air-jordan-5-retro-og-sneaker-hq7978-101.html
  try {
    const endUrl = new URL(pick.url);
    const pathParts = endUrl.pathname.split('/');
    const pageName = pathParts[pathParts.length - 1].replace('.html', '');
    
    // END. uses media.endclothing.com with the product slug
    const candidates = [
      `https://media.endclothing.com/media/f_auto,q_auto:eco,w_800/prodmedia/media/catalog/product/${pageName}_1.jpg`,
      `https://media.endclothing.com/media/f_auto,q_auto:eco,w_800/prodmedia/media/catalog/product/${pick.styleCode}_1.jpg`,
      `https://media.endclothing.com/media/f_auto,q_auto:eco,w_800/prodmedia/media/catalog/product/${pick.styleCode.toLowerCase()}_1.jpg`,
    ];

    for (const url of candidates) {
      log(`Trying: ${url}`);
      const check = await checkUrlAlive(url);
      if (check.alive) {
        log(`✓ Found at END.`);
        return url;
      }
    }
  } catch (e) {
    log(`END. source failed: ${e.message}`);
  }
  return null;
}

// =========================================================
// SOURCE 2: GOAT sneaker database
// =========================================================
async function tryGoat(pick) {
  log('Source 2: GOAT sneaker database');
  if (!pick.styleCode) { log('No style code, skipping GOAT'); return null; }

  try {
    // GOAT's Algolia-powered search API
    const searchQuery = encodeURIComponent(pick.styleCode.replace('-', ' '));
    const goatSearchUrl = `https://2fwotdvm2o-dsn.algolia.net/1/indexes/product_variants_v2/query`;
    
    const postData = JSON.stringify({
      params: `query=${searchQuery}&hitsPerPage=1`
    });

    const result = await new Promise((resolve, reject) => {
      const req = https.request(goatSearchUrl, {
        method: 'POST',
        timeout: TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'X-Algolia-Application-Id': '2FWOTDVM2O',
          'X-Algolia-API-Key': 'ac96c6e3c0512ada84a85662fed37294',
          'User-Agent': USER_AGENT,
        }
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch { reject(new Error('JSON parse failed')); }
        });
        res.on('error', reject);
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    if (result.hits && result.hits.length > 0) {
      const hit = result.hits[0];
      const imageUrl = hit.main_picture_url || hit.original_picture_url || hit.grid_picture_url;
      if (imageUrl) {
        // Get highest quality version
        const hqUrl = imageUrl.replace(/\/\d+\/attachments/, '/1000/attachments');
        log(`✓ Found on GOAT: ${hqUrl}`);
        return hqUrl;
      }
    }
  } catch (e) {
    log(`GOAT search failed: ${e.message}`);
  }
  return null;
}

// =========================================================
// SOURCE 3: Cloudinary remote fetch from original URL
// =========================================================
async function tryCloudinaryFetch(pick, filename) {
  log('Source 3: Cloudinary remote fetch from original URL');
  if (!CLOUD_ENABLED) return null;

  const imageUrl = pick._originalImage || pick.image;
  if (!imageUrl || imageUrl.includes('res.cloudinary.com')) return null;

  try {
    const cdnUrl = await uploadToCloudinary(imageUrl, filename);
    if (cdnUrl) { log(`✓ Cloudinary fetched from original URL`); }
    return cdnUrl;
  } catch (e) {
    log(`Cloudinary fetch failed: ${e.message}`);
    return null;
  }
}

// =========================================================
// SOURCE 4: Scrape og:image from product page
// =========================================================
async function tryOgImage(pick) {
  log('Source 4: Scraping og:image from product page');

  try {
    const html = (await fetchUrl(pick.url, { accept: 'text/html' })).toString('utf-8');

    // Try og:image
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch && ogMatch[1]) { log(`✓ Found og:image: ${ogMatch[1]}`); return ogMatch[1]; }

    // Try twitter:image
    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twMatch && twMatch[1]) { log(`✓ Found twitter:image`); return twMatch[1]; }

    // Try JSON-LD
    const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const block of jsonLdMatch) {
        try {
          const jsonStr = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
          const data = JSON.parse(jsonStr);
          if (data.image) {
            const img = Array.isArray(data.image) ? data.image[0] : (typeof data.image === 'object' ? data.image.url : data.image);
            if (img) { log(`✓ Found JSON-LD image`); return img; }
          }
        } catch {}
      }
    }

    // Try any high-res product image in the HTML
    const imgMatches = html.match(/https?:\/\/media\.endclothing\.com[^"'\s]+/gi);
    if (imgMatches && imgMatches.length > 0) {
      log(`✓ Found END media URL in HTML`);
      return imgMatches[0];
    }

  } catch (e) {
    log(`Page scrape failed: ${e.message}`);
  }
  return null;
}

// =========================================================
// SOURCE 5: Construct Nike URLs from style code
// =========================================================
async function tryNikeStyleCode(pick) {
  log('Source 5: Nike style code URL patterns');
  if (!pick.styleCode) return null;

  // Nike has multiple URL patterns based on style code
  const code = pick.styleCode;
  const codeLower = code.toLowerCase();
  const codeNoDash = code.replace('-', '_');

  const candidates = [
    // Nike SNKRS-style direct URLs
    `https://secure-images.nike.com/is/image/DotCom/${code}`,
    `https://secure-images.nike.com/is/image/DotCom/${codeNoDash}`,
    // Nike product imagery service
    `https://static.nike.com/a/images/t_PDP_1280_v1/f_auto,q_auto:eco/${codeLower}.png`,
    // scene7 (Nike's image service)
    `https://images.nike.com/is/image/DotCom/${code}_A_PREM?wid=800`,
    `https://images.nike.com/is/image/DotCom/${codeNoDash}_A_PREM?wid=800`,
  ];

  // For New Balance
  if (pick.brand === 'New Balance' || pick.brand?.includes('New Balance')) {
    const nbCode = pick.styleCode.toLowerCase();
    candidates.push(
      `https://nb.scene7.com/is/image/NB/${nbCode}_nb_02_i?$dw_detail_main_lg$`,
      `https://nb.scene7.com/is/image/NB/${nbCode}_nb_02_i?$pdpflexf2$&wid=800&hei=800`,
    );
  }

  for (const url of candidates) {
    log(`Trying: ${url}`);
    try {
      const check = await checkUrlAlive(url);
      if (check.alive) {
        log(`✓ Found at Nike/NB: ${url}`);
        return url;
      }
    } catch {}
  }

  return null;
}

// ===== MAIN =====
async function main() {
  console.log('\n🔍 FASHION. Image Fetcher (5-source pipeline)\n' + '='.repeat(50));
  if (DRY_RUN) console.log('📋 DRY RUN\n');

  initCloudinary();
  console.log(`Storage: ${CLOUD_ENABLED ? '☁️  Cloudinary' : '📁 Local'}\n`);

  if (!fs.existsSync(PICKS_JSON_PATH)) {
    console.error('❌ picks.json not found'); process.exit(1);
  }
  const picksData = JSON.parse(fs.readFileSync(PICKS_JSON_PATH, 'utf-8'));
  const picks = picksData.picks;
  console.log(`📦 ${picks.length} picks to process\n`);

  if (!DRY_RUN) fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const report = { total: picks.length, uploaded: 0, skipped: 0, failed: 0, linksAlive: 0, linksDead: 0, items: [] };

  for (const pick of picks) {
    console.log(`\n[${pick.id}/${picks.length}] ${pick.brand} — ${pick.name}`);
    const item = { id: pick.id, name: pick.name, source: '', status: '' };

    // --- Check product link ---
    const linkCheck = await checkUrlAlive(pick.url);
    if (linkCheck.alive) {
      console.log(`  🔗 Product page ✅`);
      report.linksAlive++;
      if (pick._linkDead) delete pick._linkDead;
    } else {
      console.log(`  🔗 Product page ❌ (${linkCheck.status})`);
      report.linksDead++;
      if (!DRY_RUN) pick._linkDead = true;
    }

    // --- Already on Cloudinary? ---
    const slug = slugify(pick.name);
    const filename = `${pick.id}-${slug}.png`;
    const alreadyDone = CLOUD_ENABLED && pick.image && pick.image.includes('res.cloudinary.com');

    if (alreadyDone && !FORCE) {
      console.log(`  ☁️  Already on Cloudinary ✅`);
      item.status = 'skipped'; report.skipped++;
      report.items.push(item); continue;
    }

    if (DRY_RUN) {
      console.log(`  📋 Would process`); report.items.push(item); continue;
    }

    // ===== TRY ALL 5 SOURCES =====
    let imageSource = null;
    let sourceName = '';

    // Source 1: END. Clothing CDN
    console.log(`  [1/5] END. Clothing CDN...`);
    imageSource = await tryEndClothing(pick);
    if (imageSource) { sourceName = 'END. CDN'; }

    // Source 2: GOAT
    if (!imageSource) {
      console.log(`  [2/5] GOAT database...`);
      imageSource = await tryGoat(pick);
      if (imageSource) { sourceName = 'GOAT'; }
    }

    // Source 3: Cloudinary remote fetch from original URL
    if (!imageSource && CLOUD_ENABLED) {
      console.log(`  [3/5] Cloudinary remote fetch...`);
      const directCdn = await tryCloudinaryFetch(pick, filename);
      if (directCdn) {
        // This already returns a Cloudinary CDN URL, so we're done
        console.log(`  ✅ ${directCdn} (via Cloudinary fetch)`);
        pick._originalImage = pick._originalImage || pick.image;
        pick.image = directCdn;
        item.source = 'Cloudinary fetch'; item.status = 'uploaded';
        report.uploaded++; report.items.push(item); continue;
      }
    }

    // Source 4: og:image from store page
    if (!imageSource && linkCheck.alive) {
      console.log(`  [4/5] Scraping product page...`);
      imageSource = await tryOgImage(pick);
      if (imageSource) { sourceName = 'og:image'; }
    }

    // Source 5: Nike/NB style code URLs
    if (!imageSource) {
      console.log(`  [5/5] Nike/NB direct URLs...`);
      imageSource = await tryNikeStyleCode(pick);
      if (imageSource) { sourceName = 'Nike/NB direct'; }
    }

    // ===== UPLOAD RESULT =====
    if (imageSource) {
      console.log(`  📸 Found via: ${sourceName}`);

      if (CLOUD_ENABLED) {
        console.log(`  ☁️  Uploading to Cloudinary...`);
        const cdnUrl = await uploadToCloudinary(imageSource, filename);
        if (cdnUrl) {
          console.log(`  ✅ ${cdnUrl}`);
          pick._originalImage = pick._originalImage || pick.image;
          pick.image = cdnUrl;
          item.source = sourceName; item.status = 'uploaded';
          report.uploaded++;
        } else {
          // Cloudinary upload failed — try downloading and saving locally
          console.log(`  ⚠️  Cloudinary upload failed, trying local save...`);
          try {
            const buffer = await fetchUrl(imageSource);
            if (buffer && buffer.length > 1000) {
              const localPath = path.join(IMAGES_DIR, filename);
              fs.writeFileSync(localPath, buffer);
              pick._originalImage = pick._originalImage || pick.image;
              pick.image = `images/picks/${filename}`;
              console.log(`  ✅ Saved locally: ${pick.image}`);
              item.source = sourceName; item.status = 'local';
              report.uploaded++;
            } else {
              throw new Error('Image too small');
            }
          } catch (e) {
            console.log(`  ❌ All uploads failed`);
            item.source = sourceName; item.status = 'failed'; report.failed++;
          }
        }
      } else {
        // Local-only mode
        try {
          const buffer = await fetchUrl(imageSource);
          const localPath = path.join(IMAGES_DIR, filename);
          fs.writeFileSync(localPath, buffer);
          pick._originalImage = pick._originalImage || pick.image;
          pick.image = `images/picks/${filename}`;
          console.log(`  ✅ ${pick.image}`);
          item.source = sourceName; item.status = 'local';
          report.uploaded++;
        } catch (e) {
          console.log(`  ❌ Download failed: ${e.message}`);
          item.status = 'failed'; report.failed++;
        }
      }
    } else {
      console.log(`  ❌ No image found from any source`);
      item.status = 'failed'; report.failed++;
    }

    report.items.push(item);
  }

  // Save
  if (!DRY_RUN) {
    fs.writeFileSync(PICKS_JSON_PATH, JSON.stringify(picksData, null, 2) + '\n');
    console.log('\n💾 Updated picks.json');
  }

  // Report
  console.log('\n' + '='.repeat(50));
  console.log('📊 REPORT');
  console.log('='.repeat(50));
  console.log(`Total:          ${report.total}`);
  console.log(`✅ Uploaded:     ${report.uploaded}`);
  console.log(`⏭️  Skipped:      ${report.skipped}`);
  console.log(`❌ Failed:       ${report.failed}`);
  console.log(`Links alive:    ${report.linksAlive}`);
  console.log(`Links dead:     ${report.linksDead}`);
  console.log('='.repeat(50));

  // Detail per item
  console.log('\nDetails:');
  for (const item of report.items) {
    const icon = item.status === 'uploaded' ? '✅' : item.status === 'skipped' ? '⏭️' : item.status === 'local' ? '📁' : '❌';
    console.log(`  ${icon} #${item.id} ${item.name} → ${item.source || item.status}`);
  }

  if (report.failed > 0) {
    console.log('\n⚠️  Failed items need manual image URLs in picks.json');
  }

  const reportPath = path.join(__dirname, '..', 'data', 'image-report.json');
  if (!DRY_RUN) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  }

  console.log('\n✨ Done!\n');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
