// SNS uses Cloudflare Turnstile — need Patchright to bypass
const { chromium } = require('patchright');

(async () => {
  // Patchright needs headless: false to bypass Cloudflare Turnstile
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('Opening SNS with Patchright (non-headless)...');
  await page.goto('https://www.sneakersnstuff.com/en-eu/products/puma-all-pro-nitro-2-e-t-312313-01', {
    waitUntil: 'domcontentloaded',
  });

  for (let i = 1; i <= 10; i++) {
    await page.waitForTimeout(3000);
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
    console.log(`\n--- ${i * 3}s ---`);
    console.log(JSON.stringify(check, null, 2));

    // Stop if we got past Cloudflare
    if (check.title !== 'Just a moment...' && check.jsonLdCount > 0) {
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

    // Stop if we got past Cloudflare but no JSON-LD
    if (check.title !== 'Just a moment...' && check.h1Text && !check.h1Text.includes('sneakersnstuff')) {
      console.log('\n--- PAGE LOADED but no JSON-LD, dumping DOM info ---');
      const domDump = await page.evaluate(() => {
        const scripts = [...document.querySelectorAll('script')].map(s => ({
          type: s.type || 'none',
          src: s.src ? s.src.substring(0, 80) : null,
          contentSnippet: !s.src ? s.textContent.substring(0, 200) : null,
        }));
        const allMeta = [...document.querySelectorAll('meta')].map(m => ({
          name: m.name || m.getAttribute('property') || null,
          content: (m.content || '').substring(0, 100),
        })).filter(m => m.name);
        return { scripts: scripts.slice(0, 20), meta: allMeta.slice(0, 20) };
      });
      console.log(JSON.stringify(domDump, null, 2).substring(0, 2000));
      break;
    }
  }

  const finalUrl = page.url();
  console.log('\nFinal URL:', finalUrl);

  await browser.close();
  console.log('Done.');
})();
