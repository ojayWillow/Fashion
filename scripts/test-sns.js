// Foot Locker NL recon #2 — find the retail/original price
const { chromium } = require('patchright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('Opening Foot Locker NL with Patchright...');
  await page.goto('https://www.footlocker.nl/nl/product/lacoste-spinor-heren-schoenen/314217718304.html', {
    waitUntil: 'domcontentloaded',
  });

  // Wait for Cloudflare
  for (let i = 1; i <= 15; i++) {
    await page.waitForTimeout(2000);
    const title = await page.title();
    if (title !== 'Just a moment...' && !title.includes('Attention')) {
      console.log(`Cloudflare bypassed at ${i * 2}s`);
      await page.waitForTimeout(3000);
      break;
    }
  }

  const data = await page.evaluate(() => {
    const result = {};

    // 1. Find ANY element containing a currency symbol or "EUR"
    const allEls = document.querySelectorAll('*');
    const priceTexts = [];
    for (const el of allEls) {
      if (el.children.length > 0) continue; // leaf nodes only
      const text = el.textContent.trim();
      if (text && (text.includes('€') || text.includes('EUR') || /^\d{2,3}[.,]\d{2}$/.test(text))) {
        priceTexts.push({
          tag: el.tagName,
          text: text.substring(0, 60),
          class: (el.className || '').substring(0, 100),
          parentClass: (el.parentElement?.className || '').substring(0, 100),
          grandparentClass: (el.parentElement?.parentElement?.className || '').substring(0, 100),
        });
      }
    }
    result.allPriceTexts = priceTexts.slice(0, 30);

    // 2. Check for data attributes containing price
    const dataEls = document.querySelectorAll('[data-price], [data-original-price], [data-sale-price], [data-list-price], [data-retail-price]');
    result.dataPriceElements = [...dataEls].slice(0, 10).map(el => ({
      tag: el.tagName,
      attributes: Object.fromEntries(
        [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value.substring(0, 50)])
      ),
      text: el.textContent.trim().substring(0, 50),
    }));

    // 3. Search ALL script tags for price data (inline JS, dataLayer, etc)
    const scripts = document.querySelectorAll('script:not([src])');
    const priceScripts = [];
    for (const script of scripts) {
      const text = script.textContent;
      if (text.includes('price') || text.includes('Price') || text.includes('PRICE')) {
        // Extract just the price-related lines
        const lines = text.split('\n').filter(l =>
          l.toLowerCase().includes('price') ||
          l.toLowerCase().includes('discount') ||
          l.toLowerCase().includes('original') ||
          l.toLowerCase().includes('retail') ||
          l.toLowerCase().includes('was') ||
          l.toLowerCase().includes('listprice') ||
          l.toLowerCase().includes('list_price')
        );
        if (lines.length > 0) {
          priceScripts.push({
            type: script.type || 'none',
            relevantLines: lines.slice(0, 10).map(l => l.trim().substring(0, 150)),
          });
        }
      }
    }
    result.priceInScripts = priceScripts.slice(0, 5);

    // 4. Check dataLayer
    if (window.dataLayer) {
      const dlStr = JSON.stringify(window.dataLayer);
      const priceMatch = dlStr.match(/"price"[^}]{0,200}/g);
      const discountMatch = dlStr.match(/"discount"[^}]{0,200}/g);
      const originalMatch = dlStr.match(/"original"[^}]{0,200}/g);
      result.dataLayerPrices = {
        priceMatches: priceMatch ? priceMatch.slice(0, 5) : [],
        discountMatches: discountMatch ? discountMatch.slice(0, 5) : [],
        originalMatches: originalMatch ? originalMatch.slice(0, 5) : [],
      };
    }

    // 5. Look for product container area specifically
    const productArea = document.querySelector('[class*="ProductDetails"], [class*="product-details"], [class*="pdp"], [class*="PDP"], main, [role="main"]');
    if (productArea) {
      result.productAreaHTML = productArea.innerHTML.substring(0, 2000);
    }

    return result;
  });

  console.log('\n=== ALL PRICE-LIKE TEXTS (leaf nodes with € or numbers) ===');
  console.log(JSON.stringify(data.allPriceTexts, null, 2));

  console.log('\n=== DATA-PRICE ATTRIBUTES ===');
  console.log(JSON.stringify(data.dataPriceElements, null, 2));

  console.log('\n=== PRICE IN INLINE SCRIPTS ===');
  console.log(JSON.stringify(data.priceInScripts, null, 2));

  console.log('\n=== DATALAYER PRICES ===');
  console.log(JSON.stringify(data.dataLayerPrices, null, 2));

  if (data.productAreaHTML) {
    console.log('\n=== PRODUCT AREA HTML (first 2000 chars) ===');
    console.log(data.productAreaHTML);
  }

  await browser.close();
  console.log('\nDone.');
})();
