// END. Clothing recon — Patchright (Cloudflare Turnstile expected)
const { chromium } = require('patchright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('Opening END. with Patchright...');
  await page.goto('https://www.endclothing.com/gb/adidas-tahiti-marine-sneaker-jr4773.html', {
    waitUntil: 'domcontentloaded',
  });

  // Wait for Cloudflare to resolve
  for (let i = 1; i <= 15; i++) {
    await page.waitForTimeout(2000);
    const title = await page.title();
    console.log(`${i * 2}s — title: "${title}"`);
    if (title !== 'Just a moment...' && !title.includes('Attention')) {
      console.log('Cloudflare bypassed!');
      await page.waitForTimeout(3000); // settle
      break;
    }
  }

  const data = await page.evaluate(() => {
    const result = {};

    // 1. JSON-LD
    const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
    result.jsonLdCount = jsonLd.length;
    result.jsonLdData = [...jsonLd].map(s => {
      try { return JSON.parse(s.textContent); }
      catch { return 'parse-error'; }
    });

    // 2. Basic page info
    const h1 = document.querySelector('h1');
    result.title = document.title;
    result.h1 = h1 ? h1.textContent.trim().substring(0, 100) : null;

    // 3. Price elements
    const allEls = document.querySelectorAll('*');
    const priceEls = [];
    for (const el of allEls) {
      const cls = el.className || '';
      if (typeof cls === 'string' && (cls.toLowerCase().includes('price') || cls.toLowerCase().includes('compare'))) {
        const text = el.textContent.trim();
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
    result.priceElements = priceEls.slice(0, 10);

    // 4. Strikethrough elements
    const strikeEls = document.querySelectorAll('s, del, strike, [style*="line-through"]');
    result.strikethroughElements = [...strikeEls].slice(0, 5).map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().substring(0, 50),
      parent: el.parentElement?.className?.substring(0, 80) || null,
    }));

    // 5. Size elements
    const sizeSelectors = document.querySelectorAll(
      'select option, [class*="size"] li, [class*="Size"] li, ' +
      'button[data-option], [class*="variant"] button, ' +
      '[class*="swatch"] button, [data-size], [data-value], ' +
      '[class*="size"] button, [class*="Size"] button'
    );
    result.sizeElements = [...sizeSelectors].slice(0, 20).map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().substring(0, 30),
      value: el.value || el.getAttribute('data-value') || el.getAttribute('data-size') || null,
      disabled: el.disabled || el.classList.contains('disabled') || el.classList.contains('sold-out') || false,
      class: (el.className || '').substring(0, 80),
    }));

    // 6. Meta tags
    const ogImage = document.querySelector('meta[property="og:image"]');
    const metaDesc = document.querySelector('meta[name="description"]');
    result.ogImage = ogImage ? ogImage.getAttribute('content')?.substring(0, 150) : null;
    result.metaDesc = metaDesc ? metaDesc.getAttribute('content')?.substring(0, 150) : null;

    return result;
  });

  console.log('\n=== PAGE INFO ===');
  console.log(`Title: ${data.title}`);
  console.log(`H1: ${data.h1}`);
  console.log(`OG Image: ${data.ogImage}`);
  console.log(`Meta Desc: ${data.metaDesc}`);

  console.log('\n=== JSON-LD ===');
  console.log(`Count: ${data.jsonLdCount}`);
  console.log(JSON.stringify(data.jsonLdData, null, 2).substring(0, 4000));

  console.log('\n=== PRICE ELEMENTS ===');
  console.log(JSON.stringify(data.priceElements, null, 2));

  console.log('\n=== STRIKETHROUGH ===');
  console.log(JSON.stringify(data.strikethroughElements, null, 2));

  console.log('\n=== SIZE ELEMENTS ===');
  console.log(JSON.stringify(data.sizeElements, null, 2));

  const finalUrl = page.url();
  console.log('\nFinal URL:', finalUrl);

  await browser.close();
  console.log('Done.');
})();
