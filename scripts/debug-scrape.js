#!/usr/bin/env node
/**
 * FASHION. — Debug Scrape
 * =======================
 * Diagnostic tool: loads a product page and dumps EVERYTHING it finds.
 * Paste the output so we can see exactly what the page provides.
 *
 * Usage:
 *   node scripts/debug-scrape.js https://www.footlocker.nl/nl/product/~/314217525204.html
 */

const { chromium } = require('playwright');

const url = process.argv[2];
if (!url) {
  console.log('Usage: node scripts/debug-scrape.js <product-url>');
  process.exit(1);
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

async function main() {
  console.log(`\n🔍 DEBUG SCRAPE: ${url}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8' });

  const apiCalls = [];
  page.on('response', async (response) => {
    const reqUrl = response.url();
    if (reqUrl.includes('ProductVariation') || reqUrl.includes('/api/') ||
        reqUrl.includes('product') || reqUrl.includes('inventory')) {
      try {
        const body = await response.text().catch(() => '');
        apiCalls.push({ url: reqUrl.substring(0, 150), status: response.status(), bodyPreview: body.substring(0, 500) });
      } catch (e) {}
    }
  });

  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
  catch (e) { console.log('Page load timeout, continuing...'); }

  await page.waitForTimeout(6000);

  try {
    const cookieBtn = await page.$('#onetrust-accept-btn-handler');
    if (cookieBtn) { await cookieBtn.click(); await page.waitForTimeout(1500); }
  } catch (e) {}

  const dump = await page.evaluate(() => {
    const data = {};

    // META TAGS
    data.metaTags = {};
    const metaSels = [
      'meta[property="og:title"]', 'meta[property="og:image"]',
      'meta[property="product:price:amount"]', 'meta[property="product:price:currency"]',
      'meta[property="product:sale_price:amount"]', 'meta[property="product:sale_price:currency"]',
      'meta[name="description"]', 'meta[property="product:brand"]',
    ];
    for (const sel of metaSels) {
      const el = document.querySelector(sel);
      if (el) data.metaTags[sel] = el.getAttribute('content') || '';
    }

    // JSON-LD
    data.jsonLd = [];
    try {
      document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
        try { data.jsonLd.push(JSON.parse(s.textContent)); } catch (e) {}
      });
    } catch (e) {}

    data.h1 = document.querySelector('h1')?.textContent?.trim() || '';
    data.title = document.title;

    // ALL PRICE ELEMENTS
    data.priceElements = [];
    const priceSels = [
      '[class*="price"]', '[class*="Price"]', 's', 'del', 'strike',
      '[style*="line-through"]', '[class*="LineThrough"]', '[class*="crossed"]',
      '[class*="original"]', '[class*="was"]', '[class*="sale"]', '[class*="Sale"]',
      '[class*="reduced"]', '[class*="discount"]', '[class*="FinalPrice"]',
    ];
    const seen = new Set();
    for (const sel of priceSels) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          const text = el.textContent.trim().substring(0, 100);
          if (!text || seen.has(text + el.className)) return;
          seen.add(text + el.className);
          const style = window.getComputedStyle(el);
          data.priceElements.push({
            selector: sel, tag: el.tagName, text: text,
            class: (el.className || '').toString().substring(0, 100),
            textDecoration: style.textDecoration || '', opacity: style.opacity,
            parentClass: (el.parentElement?.className || '').toString().substring(0, 80),
          });
        });
      } catch (e) {}
    }

    // SIZE BUTTONS
    data.sizeButtons = [];
    const sizeAreaSels = [
      '[data-testid="SizeSelector"]', '[class*="SizeSelector"]',
      '[class*="size-selector"]', '[class*="SizeList"]', '[class*="size-list"]',
      '[class*="SizeButtons"]', '[class*="size-buttons"]', '[class*="SizeWrapper"]',
      '[class*="ProductSize"]', '[class*="product-size"]', '[id*="size"]', '[id*="Size"]',
    ];
    let sizeArea = null; let sizeAreaSelector = '';
    for (const sel of sizeAreaSels) {
      const el = document.querySelector(sel);
      if (el) { sizeArea = el; sizeAreaSelector = sel; break; }
    }
    data.sizeAreaFound = sizeAreaSelector || 'NONE';
    data.sizeAreaHTML = sizeArea ? sizeArea.innerHTML.substring(0, 3000) : '';

    if (sizeArea) {
      sizeArea.querySelectorAll('button, a, li, span, div, label, input').forEach((el, idx) => {
        const text = el.textContent.trim();
        if (!text || text.length > 15) return;
        if (!/\d/.test(text) && !/^(XXS|XS|S|M|L|XL|XXL|2XL|3XL)$/i.test(text)) return;
        const style = window.getComputedStyle(el);
        data.sizeButtons.push({
          index: idx, tag: el.tagName, text: text,
          class: (el.className || '').toString().substring(0, 120),
          ariaDisabled: el.getAttribute('aria-disabled'),
          disabled: el.disabled || false,
          dataOutOfStock: el.getAttribute('data-out-of-stock'),
          dataSoldOut: el.getAttribute('data-sold-out'),
          dataAvailable: el.getAttribute('data-available'),
          dataVariation: el.getAttribute('data-variation') || el.getAttribute('data-sku') || '',
          opacity: style.opacity, cursor: style.cursor, pointerEvents: style.pointerEvents,
          textDecoration: style.textDecoration || '',
          color: style.color, backgroundColor: style.backgroundColor, borderColor: style.borderColor,
          parentTag: el.parentElement?.tagName || '',
          parentClass: (el.parentElement?.className || '').toString().substring(0, 80),
        });
      });
    }
    if (!sizeArea) {
      const allBtns = document.querySelectorAll('button');
      const sizeBtns = [];
      allBtns.forEach(btn => { const t = btn.textContent.trim(); if (/^\d{2}(\.\d)?$/.test(t)) sizeBtns.push(btn); });
      if (sizeBtns.length >= 3) {
        data.sizeAreaFound = 'FALLBACK: generic buttons';
        sizeBtns.forEach((el, idx) => {
          const style = window.getComputedStyle(el);
          data.sizeButtons.push({
            index: idx, tag: 'BUTTON', text: el.textContent.trim(),
            class: (el.className || '').toString().substring(0, 120),
            ariaDisabled: el.getAttribute('aria-disabled'), disabled: el.disabled || false,
            opacity: style.opacity, cursor: style.cursor, textDecoration: style.textDecoration || '',
            color: style.color, backgroundColor: style.backgroundColor,
          });
        });
      }
    }

    // IMAGES
    data.images = [];
    const imgSels = ['meta[property="og:image"]', '[class*="ProductImage"] img', '[class*="product-image"] img', 'main img'];
    for (const sel of imgSels) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          const src = el.tagName === 'META' ? el.getAttribute('content') : (el.src || el.getAttribute('data-src'));
          if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('.svg')) {
            data.images.push({ selector: sel, src: src.substring(0, 200) });
          }
        });
      } catch (e) {}
    }
    return data;
  });

  // PRINT
  section('META TAGS');
  for (const [sel, val] of Object.entries(dump.metaTags)) console.log(`  ${sel}\n    -> ${val}`);

  section('JSON-LD');
  for (const ld of dump.jsonLd) console.log(JSON.stringify(ld, null, 2).substring(0, 1500));

  section('PAGE TITLE');
  console.log(`  H1: ${dump.h1}`);
  console.log(`  Title: ${dump.title}`);

  section('PRICE ELEMENTS');
  for (const el of dump.priceElements) {
    console.log(`  [${el.selector}] <${el.tag}> "${el.text}"`);
    console.log(`    class: "${el.class}"`);
    console.log(`    textDecoration: ${el.textDecoration} | opacity: ${el.opacity}`);
    console.log(`    parentClass: "${el.parentClass}"\n`);
  }

  section(`SIZE BUTTONS (area: ${dump.sizeAreaFound})`);
  console.log(`  Total: ${dump.sizeButtons.length}\n`);
  for (const btn of dump.sizeButtons) {
    const flags = [];
    if (btn.ariaDisabled === 'true') flags.push('ARIA-DISABLED');
    if (btn.disabled) flags.push('DISABLED');
    if (btn.dataOutOfStock === 'true') flags.push('OUT-OF-STOCK');
    if (btn.dataSoldOut === 'true') flags.push('SOLD-OUT');
    if (btn.dataAvailable === 'false') flags.push('NOT-AVAILABLE');
    if (parseFloat(btn.opacity) < 0.5) flags.push(`LOW-OPACITY(${btn.opacity})`);
    if (btn.cursor === 'not-allowed') flags.push('CURSOR-NOT-ALLOWED');
    if (btn.pointerEvents === 'none') flags.push('NO-POINTER');
    if ((btn.textDecoration || '').includes('line-through')) flags.push('LINE-THROUGH');
    const status = flags.length > 0 ? `❌ ${flags.join(', ')}` : '✅ AVAILABLE';
    console.log(`  Size ${btn.text.padEnd(6)} ${status}`);
    console.log(`    class: "${btn.class}"`);
    console.log(`    color: ${btn.color} | bg: ${btn.backgroundColor} | border: ${btn.borderColor || '-'}`);
    if (btn.dataVariation) console.log(`    variation: ${btn.dataVariation}`);
    console.log('');
  }

  section('SIZE AREA RAW HTML');
  console.log(dump.sizeAreaHTML.substring(0, 2000));

  section('NETWORK API CALLS');
  if (apiCalls.length === 0) console.log('  No product/inventory API calls detected');
  for (const call of apiCalls) { console.log(`  [${call.status}] ${call.url}\n    ${call.bodyPreview.substring(0, 300)}\n`); }

  section('IMAGES');
  for (const img of dump.images) console.log(`  [${img.selector}] ${img.src}`);

  await browser.close();
  console.log('\n✨ Debug complete!\n');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
