const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Opening SNS...');
  await page.goto('https://www.sneakersnstuff.com/en-eu/products/puma-all-pro-nitro-2-e-t-312313-01', {
    waitUntil: 'domcontentloaded',
  });

  for (let i = 1; i <= 8; i++) {
    await page.waitForTimeout(2000);
    const check = await page.evaluate(() => {
      const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
      const h1 = document.querySelector('h1');
      const title = document.title;
      const metaDesc = document.querySelector('meta[name="description"]');
      const ogImage = document.querySelector('meta[property="og:image"]');
      const priceEl = document.querySelector('[class*="price"], [class*="Price"], [data-testid*="price"]');
      const sizeEls = document.querySelectorAll('[class*="size"] button, [class*="Size"] button, [class*="size"] a, [class*="Size"] a');
      return {
        title,
        h1Text: h1 ? h1.textContent.trim().substring(0, 100) : null,
        jsonLdCount: jsonLd.length,
        jsonLdTypes: [...jsonLd].map(s => {
          try { return JSON.parse(s.textContent)['@type']; }
          catch { return 'parse-error'; }
        }),
        metaDesc: metaDesc ? metaDesc.getAttribute('content')?.substring(0, 100) : null,
        ogImage: ogImage ? ogImage.getAttribute('content')?.substring(0, 120) : null,
        priceText: priceEl ? priceEl.textContent.trim().substring(0, 60) : null,
        sizeCount: sizeEls.length,
        sizeTexts: [...sizeEls].slice(0, 10).map(el => el.textContent.trim()),
      };
    });
    console.log(`\n--- ${i * 2}s ---`);
    console.log(JSON.stringify(check, null, 2));

    if (check.jsonLdCount > 0) {
      const allLd = await page.evaluate(() => {
        return [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => {
          try { return JSON.parse(s.textContent); }
          catch { return 'parse-error'; }
        });
      });
      console.log('\n--- ALL JSON-LD ---');
      console.log(JSON.stringify(allLd, null, 2).substring(0, 3000));
      break;
    }
  }

  const finalUrl = page.url();
  console.log('\nFinal URL:', finalUrl);

  // Last resort: dump key HTML
  const html = await page.content();
  const bodyStart = html.indexOf('<body');
  const snippet = html.substring(bodyStart, bodyStart + 1000);
  console.log('\n--- BODY SNIPPET ---');
  console.log(snippet);

  await browser.close();
  console.log('\nDone.');
})();
