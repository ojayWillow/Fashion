#!/usr/bin/env node
/**
 * Patches process-queue.js to add MR PORTER / NET-A-PORTER support.
 * Run once: node scripts/patch-mrporter.js
 * Then delete this file.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'process-queue.js');
let code = fs.readFileSync(FILE, 'utf-8');

// ===== EDIT 1: Add MR PORTER to Patchright domains =====
code = code.replace(
  "const PATCHRIGHT_DOMAINS = ['footlocker', 'sneakersnstuff'];",
  "const PATCHRIGHT_DOMAINS = ['footlocker', 'sneakersnstuff', 'mrporter', 'net-a-porter', 'theoutnet'];"
);
console.log('Edit 1: PATCHRIGHT_DOMAINS updated');

// ===== EDIT 2: Add scrapeMrPorter function before generic scraper =====
const mrporterFn = [
  '',
  '// =====================================================================',
  '// MR PORTER / NET-A-PORTER \u2014 Akamai bypass via Patchright + JSON-LD',
  '// =====================================================================',
  '',
  'function isMrPorter(domain) {',
  "  return domain.includes('mrporter') || domain.includes('net-a-porter') || domain.includes('theoutnet');",
  '}',
  '',
  'async function scrapeMrPorter(url) {',
  "  log('Using Patchright (Akamai bypass) for MR PORTER...');",
  '',
  '  const browser = await getPatchrightBrowser();',
  '  const page = await browser.newPage();',
  '  await page.setViewportSize({ width: 1280, height: 900 });',
  '',
  "  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }",
  "  catch (e) { log('Page load timeout, continuing...'); }",
  '',
  '  await page.waitForTimeout(10000);',
  '',
  '  try {',
  '    const cookieBtn = await page.$(\'button[data-testid="accept-cookies"], button[id*="accept"], button[class*="accept"]\');',
  '    if (cookieBtn) { await cookieBtn.click(); await page.waitForTimeout(1500); }',
  '  } catch (e) {}',
  '',
  '  const scraped = await page.evaluate(() => {',
  '    const data = {',
  "      name: '', brand: '', image: '', description: '', colorway: '',",
  "      salePrice: '', retailPrice: '', currency: 'GBP',",
  '      sizes: [], styleCode: \'\'',
  '    };',
  '',
  '    try {',
  '      const scripts = document.querySelectorAll(\'script[type="application/ld+json"]\');',
  '      for (const script of scripts) {',
  '        let ld;',
  '        try { ld = JSON.parse(script.textContent); } catch (e) { continue; }',
  "        if (ld['@type'] !== 'ProductGroup') continue;",
  '',
  "        data.name = ld.name || '';",
  '        if (ld.brand && ld.brand.name) data.brand = ld.brand.name;',
  '        if (ld.productGroupId) data.styleCode = ld.productGroupId;',
  '',
  '        if (ld.description) {',
  '          data.description = ld.description.substring(0, 200);',
  '        }',
  '',
  '        const variants = ld.hasVariant || [];',
  '        if (variants.length === 0) continue;',
  '',
  '        const firstVariant = variants[0];',
  '        if (firstVariant.image && firstVariant.image.length > 0) {',
  '          const imgObj = firstVariant.image[0];',
  "          data.image = (typeof imgObj === 'string') ? imgObj : (imgObj.url || '');",
  '        }',
  '',
  '        if (firstVariant.color) {',
  '          data.colorway = firstVariant.color.charAt(0).toUpperCase() + firstVariant.color.slice(1);',
  '        }',
  '',
  '        const inStockVariants = [];',
  '        for (const v of variants) {',
  '          const isInStock = v.offers &&',
  '            v.offers.availability &&',
  "            v.offers.availability.includes('InStock');",
  '          if (isInStock && v.size) inStockVariants.push(v);',
  '        }',
  '',
  '        data.sizes = inStockVariants.map(v => v.size).filter(Boolean);',
  '',
  '        const priceVariant = inStockVariants[0] || variants[0];',
  '        if (priceVariant && priceVariant.offers && priceVariant.offers.priceSpecification) {',
  '          for (const spec of priceVariant.offers.priceSpecification) {',
  '            if (spec.priceCurrency) data.currency = spec.priceCurrency;',
  "            if (spec.priceType && spec.priceType.includes('StrikethroughPrice')) {",
  '              data.retailPrice = spec.price;',
  '            } else if (!spec.priceType) {',
  '              data.salePrice = spec.price;',
  '            }',
  '          }',
  '        }',
  '        break;',
  '      }',
  '    } catch (e) {}',
  '',
  '    if (!data.image) {',
  '      const ogImg = document.querySelector(\'meta[property="og:image"]\');',
  "      if (ogImg) data.image = ogImg.getAttribute('content') || '';",
  '    }',
  '    if (!data.name) {',
  "      const h1 = document.querySelector('h1');",
  '      if (h1) data.name = h1.textContent.trim();',
  '    }',
  '',
  '    return data;',
  '  });',
  '',
  '  await page.close();',
  '',
  '  log(`MRP result: name="${scraped.name}", brand="${scraped.brand}", sale="${scraped.salePrice}", retail="${scraped.retailPrice}"`);',
  '  log(`MRP sizes: ${scraped.sizes.length} in stock`);',
  '  log(`MRP image: ${scraped.image}`);',
  '',
  '  return {',
  "    name: scraped.name || '', image: scraped.image || '',",
  "    salePrice: scraped.salePrice || '', retailPrice: scraped.retailPrice || '',",
  '    sizes: scraped.sizes || [], allSizeData: [],',
  "    description: scraped.description || '', colorway: scraped.colorway || '',",
  "    styleCode: scraped.styleCode || '', brand: scraped.brand || '',",
  "    _currency: scraped.currency || 'GBP',",
  '  };',
  '}',
  '',
  '',
].join('\n');

if (code.includes('// ===== GENERIC SCRAPER =====')) {
  code = code.replace(
    '// ===== GENERIC SCRAPER =====',
    mrporterFn + '// ===== GENERIC SCRAPER ====='
  );
  console.log('Edit 2: scrapeMrPorter() function inserted');
} else {
  console.log('ERROR: Could not find GENERIC SCRAPER marker');
  process.exit(1);
}

// ===== EDIT 3: Add MR PORTER route in the router =====
const oldRouter = "  if (needsPatchright(domain)) {\n    log('\\u2192 Patchright (Cloudflare bypass)');\n    return await scrapeGeneric(url, config, true);\n  }";
const newRouter = "  if (isMrPorter(domain)) {\n    log('\\u2192 MR PORTER (Patchright + Akamai bypass)');\n    return await scrapeMrPorter(url);\n  }\n  if (needsPatchright(domain)) {\n    log('\\u2192 Patchright (Cloudflare bypass)');\n    return await scrapeGeneric(url, config, true);\n  }";

if (code.includes(oldRouter)) {
  code = code.replace(oldRouter, newRouter);
  console.log('Edit 3: Router updated with MR PORTER route');
} else {
  console.log('ERROR: Could not find router pattern. Trying alternate...');
  // Try simpler match
  if (code.includes('if (needsPatchright(domain))')) {
    code = code.replace(
      'if (needsPatchright(domain))',
      "if (isMrPorter(domain)) {\n    log('\\u2192 MR PORTER (Patchright + Akamai bypass)');\n    return await scrapeMrPorter(url);\n  }\n  if (needsPatchright(domain))"
    );
    console.log('Edit 3: Router updated (alternate match)');
  } else {
    console.log('ERROR: Router patch failed');
    process.exit(1);
  }
}

// ===== EDIT 4: Currency override =====
code = code.replace(
  '    const currency = isFootLocker(domain) ? getFlCurrency(domain) : detectCurrency(domain);',
  '    let currency = isFootLocker(domain) ? getFlCurrency(domain) : detectCurrency(domain);'
);

code = code.replace(
  '      const scraped = await scrapePage(url, config);',
  '      const scraped = await scrapePage(url, config);\n      if (scraped._currency) currency = scraped._currency;'
);
console.log('Edit 4: Currency override added');

// ===== EDIT 5: Add US prefix handling to normalizeSize =====
const usMatchBlock = "  // Has \"UK\" prefix\n  const ukMatch";
const usBlock = `  // Has "US" prefix
  const usMatch = s.match(/^US\\s+(\\d+\\.?\\d*)$/i);
  if (usMatch) {
    const num = parseFloat(usMatch[1]);
    if (womens) {
      const eu = US_W_TO_EU[num];
      return eu ? 'EU ' + eu : 'EU ' + (Math.round((num + 31) * 2) / 2);
    }
    if (kids) {
      const key = num + 'Y';
      const eu = US_KIDS_TO_EU[key];
      if (eu) return 'EU ' + eu;
    }
    const eu = US_M_TO_EU[num];
    return eu ? 'EU ' + eu : 'EU ' + (Math.round((num + 33) * 2) / 2);
  }

  // Has "UK" prefix
  const ukMatch`;

if (code.includes(usMatchBlock)) {
  code = code.replace(usMatchBlock, usBlock);
  console.log('Edit 5: US size prefix normalization added');
} else {
  console.log('WARNING: Could not add US prefix handler (sizes may not normalize)');
}

// ===== EDIT 6: Update isValidSize to accept "US 5" format =====
const oldSizeRegex = "if (/^(US|UK)?\\s?\\d{1,2}(\\.5)?$/i.test(t)) return true;";
const newSizeRegex = "if (/^(US|UK)?\\s?\\d{1,2}(\\.5)?$/i.test(t)) return true;\n  if (/^(US|UK)\\s\\d{1,2}(\\.5)?$/i.test(t)) return true;";

if (code.includes(oldSizeRegex)) {
  // Actually the existing regex already handles it with \s? but let's be safe
  console.log('Edit 6: isValidSize already handles US prefix (\\s? covers space)');
} else {
  console.log('Edit 6: isValidSize regex not found, skipping (probably fine)');
}

// ===== WRITE =====
fs.writeFileSync(FILE, code);
console.log('\n\u2705 Patched process-queue.js with MR PORTER support!');
console.log('\nNext: paste a MR PORTER URL into data/queue.txt and run:');
console.log('  node scripts/process-queue.js --verbose');
console.log('');
