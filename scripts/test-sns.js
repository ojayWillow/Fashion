const { chromium } = require('patchright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('Opening SNS with Patchright...');
  await page.goto('https://www.sneakersnstuff.com/en-eu/products/puma-all-pro-nitro-2-e-t-312313-01', {
    waitUntil: 'domcontentloaded',
  });

  // Wait for page to load past Cloudflare
  for (let i = 1; i <= 10; i++) {
    await page.waitForTimeout(2000);
    const title = await page.title();
    if (title !== 'Just a moment...') {
      console.log(`Cloudflare bypassed at ${i * 2}s`);
      await page.waitForTimeout(2000); // extra settle time
      break;
    }
  }

  const data = await page.evaluate(() => {
    const result = {};

    // 1. ALL price-related elements
    const allEls = document.querySelectorAll('*');
    const priceEls = [];
    for (const el of allEls) {
      const cls = el.className || '';
      const text = el.textContent.trim();
      if (typeof cls === 'string' && (cls.toLowerCase().includes('price') || cls.toLowerCase().includes('compare'))) {
        if (text.length < 80 && text.length > 0) {
          priceEls.push({
            tag: el.tagName,
            class: cls.substring(0, 100),
            text: text.substring(0, 80),
            html: el.innerHTML.substring(0, 200),
          });
        }
      }
    }
    result.priceElements = priceEls.slice(0, 15);

    // 2. Look for <s>, <del>, <strike> (strikethrough = retail price)
    const strikeEls = document.querySelectorAll('s, del, strike, [style*="line-through"]');
    result.strikethroughElements = [...strikeEls].slice(0, 5).map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().substring(0, 50),
      parent: el.parentElement?.className?.substring(0, 80) || null,
    }));

    // 3. Full JSON-LD variants (all of them)
    const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of jsonLd) {
      try {
        const ld = JSON.parse(s.textContent);
        if (ld['@type'] === 'ProductGroup' && ld.hasVariant) {
          result.totalVariants = ld.hasVariant.length;
          result.inStockVariants = ld.hasVariant.filter(v =>
            v.offers?.availability?.includes('InStock')
          ).length;
          result.allSizes = ld.hasVariant.map(v => ({
            name: v.name,
            sku: v.sku,
            price: v.offers?.price,
            inStock: v.offers?.availability?.includes('InStock') || false,
          }));
          // Check if any variant has priceSpecification
          const firstVariant = ld.hasVariant[0];
          result.offerStructure = firstVariant?.offers || null;
        }
      } catch {}
    }

    // 4. Size selector elements (buttons, dropdowns)
    const sizeSelectors = document.querySelectorAll(
      'select option, [class*="size"] li, [class*="Size"] li, ' +
      'button[data-option], [class*="variant"] button, ' +
      '[class*="swatch"] button, [data-size], [data-value]'
    );
    result.sizeElements = [...sizeSelectors].slice(0, 20).map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().substring(0, 30),
      value: el.value || el.getAttribute('data-value') || el.getAttribute('data-size') || null,
      disabled: el.disabled || el.classList.contains('disabled') || el.classList.contains('sold-out') || false,
      class: (el.className || '').substring(0, 80),
    }));

    return result;
  });

  console.log('\n=== PRICE ELEMENTS ===');
  console.log(JSON.stringify(data.priceElements, null, 2));

  console.log('\n=== STRIKETHROUGH (retail price) ===');
  console.log(JSON.stringify(data.strikethroughElements, null, 2));

  console.log('\n=== JSON-LD VARIANTS ===');
  console.log(`Total: ${data.totalVariants}, In Stock: ${data.inStockVariants}`);
  console.log(JSON.stringify(data.allSizes, null, 2));

  console.log('\n=== OFFER STRUCTURE (first variant) ===');
  console.log(JSON.stringify(data.offerStructure, null, 2));

  console.log('\n=== SIZE SELECTOR ELEMENTS ===');
  console.log(JSON.stringify(data.sizeElements, null, 2));

  await browser.close();
  console.log('\nDone.');
})();
