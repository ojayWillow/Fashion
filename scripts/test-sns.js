// MR PORTER recon #2 — Patchright (Access Denied with standard Playwright)
const { chromium } = require('patchright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('Opening MR PORTER with Patchright...');
  await page.goto('https://www.mrporter.com/en-nl/mens/product/nike/shoes/low-top-sneakers/dunk-low-retro-leather-sneakers/46353151655503704', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Check for Cloudflare / anti-bot
  for (let i = 1; i <= 15; i++) {
    await page.waitForTimeout(2000);
    const title = await page.title();
    console.log(`${i * 2}s — title: "${title}"`);
    if (title !== 'Just a moment...' && !title.includes('Attention') && title !== 'Access Denied') {
      console.log('Page loaded!');
      await page.waitForTimeout(3000);
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

    // 2. Page info
    result.title = document.title;
    const h1 = document.querySelector('h1');
    result.h1 = h1 ? h1.textContent.trim().substring(0, 100) : null;

    // 3. Price elements
    const allEls = document.querySelectorAll('*');
    const priceEls = [];
    for (const el of allEls) {
      const cls = el.className || '';
      if (typeof cls === 'string' && cls.toLowerCase().includes('price')) {
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
    result.priceElements = priceEls.slice(0, 15);

    // 4. Strikethrough
    const strikeEls = document.querySelectorAll('s, del, strike, [style*="line-through"]');
    result.strikethroughElements = [...strikeEls].slice(0, 5).map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().substring(0, 50),
      class: (el.className || '').substring(0, 80),
    }));

    // 5. Size selectors — broad search
    const selects = document.querySelectorAll('select');
    result.selectElements = [...selects].slice(0, 5).map(sel => ({
      name: sel.name || null,
      id: sel.id || null,
      class: (sel.className || '').substring(0, 80),
      options: [...sel.options].slice(0, 15).map(o => ({
        text: o.text.trim().substring(0, 30),
        value: o.value,
        disabled: o.disabled,
      })),
    }));

    // Size by data-testid
    const sizeByTestId = document.querySelectorAll('[data-testid*="ize"], [data-testid*="SIZE"]');
    result.sizeTestIdElements = [...sizeByTestId].slice(0, 15).map(el => ({
      tag: el.tagName,
      testId: el.getAttribute('data-testid'),
      text: el.textContent.trim().substring(0, 50),
      class: (el.className || '').substring(0, 80),
    }));

    // Size buttons
    const allBtns = document.querySelectorAll('button, a');
    const sizeBtns = [];
    for (const btn of allBtns) {
      const text = btn.textContent.trim();
      if (/^(IT\s?|EU\s?|UK\s?|US\s?)?\d{1,2}(\.5)?$/.test(text)) {
        sizeBtns.push({
          tag: btn.tagName,
          text,
          class: (btn.className || '').substring(0, 80),
        });
      }
    }
    result.sizeButtons = sizeBtns.slice(0, 20);

    // 6. Meta tags
    const ogImage = document.querySelector('meta[property="og:image"]');
    result.ogImage = ogImage ? ogImage.getAttribute('content')?.substring(0, 200) : null;

    return result;
  });

  console.log('\n=== PAGE INFO ===');
  console.log(`Title: ${data.title}`);
  console.log(`H1: ${data.h1}`);
  console.log(`OG Image: ${data.ogImage}`);

  console.log('\n=== JSON-LD ===');
  console.log(`Count: ${data.jsonLdCount}`);
  console.log(JSON.stringify(data.jsonLdData, null, 2).substring(0, 4000));

  console.log('\n=== PRICE ELEMENTS ===');
  console.log(JSON.stringify(data.priceElements, null, 2));

  console.log('\n=== STRIKETHROUGH ===');
  console.log(JSON.stringify(data.strikethroughElements, null, 2));

  console.log('\n=== SIZE ELEMENTS (data-testid) ===');
  console.log(JSON.stringify(data.sizeTestIdElements, null, 2));

  console.log('\n=== SIZE BUTTONS ===');
  console.log(JSON.stringify(data.sizeButtons, null, 2));

  console.log('\n=== SELECT ELEMENTS ===');
  console.log(JSON.stringify(data.selectElements, null, 2));

  console.log('\nFinal URL:', page.url());

  await browser.close();
  console.log('Done.');
})();
