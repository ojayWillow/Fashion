// Foot Locker NL recon — Patchright (already working partially)
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
      const testId = el.getAttribute('data-testid') || '';
      if (typeof cls === 'string' && (
        cls.toLowerCase().includes('price') ||
        testId.toLowerCase().includes('price')
      )) {
        const text = el.textContent.trim();
        if (text.length < 80 && text.length > 0) {
          priceEls.push({
            tag: el.tagName,
            class: cls.substring(0, 100),
            testId: testId || null,
            text: text.substring(0, 80),
            html: el.innerHTML.substring(0, 200),
          });
        }
      }
    }
    result.priceElements = priceEls.slice(0, 15);

    // 4. Strikethrough / crossed out prices
    const strikeEls = document.querySelectorAll('s, del, strike, [style*="line-through"], [class*="crossed"], [class*="Crossed"], [class*="was"], [class*="Was"], [class*="original"], [class*="Original"]');
    result.strikethroughElements = [...strikeEls].slice(0, 5).map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().substring(0, 50),
      class: (el.className || '').substring(0, 80),
      parent: el.parentElement?.className?.substring(0, 80) || null,
    }));

    // 5. Size elements — broad search
    const sizeByTestId = document.querySelectorAll('[data-testid*="ize"], [data-testid*="SIZE"]');
    result.sizeTestIdElements = [...sizeByTestId].slice(0, 20).map(el => ({
      tag: el.tagName,
      testId: el.getAttribute('data-testid'),
      text: el.textContent.trim().substring(0, 50),
      class: (el.className || '').substring(0, 80),
      childCount: el.children.length,
    }));

    // Size buttons (numeric)
    const allButtons = document.querySelectorAll('button, a');
    const sizeButtons = [];
    for (const btn of allButtons) {
      const text = btn.textContent.trim();
      if (/^(EU\s?)?\d{2}(\.5)?$/.test(text) || /^(UK\s?)?\d{1,2}(\.5)?$/.test(text)) {
        sizeButtons.push({
          tag: btn.tagName,
          text,
          class: (btn.className || '').substring(0, 80),
          testId: btn.getAttribute('data-testid') || null,
          disabled: btn.disabled || btn.classList.contains('disabled') || false,
        });
      }
    }
    result.sizeButtons = sizeButtons.slice(0, 20);

    // Size containers
    const containers = document.querySelectorAll(
      '[class*="SizeSelector"], [class*="sizeSelector"], [class*="size-selector"], ' +
      '[class*="SizeGrid"], [class*="sizeGrid"], [class*="size-grid"], ' +
      '[class*="SizeList"], [class*="sizeList"], [class*="size-list"]'
    );
    result.sizeContainers = [...containers].slice(0, 3).map(el => ({
      tag: el.tagName,
      class: (el.className || '').substring(0, 120),
      childCount: el.children.length,
      innerHTML: el.innerHTML.substring(0, 500),
    }));

    // 6. Any XHR/fetch data in window (Foot Locker often stores product data in JS)
    result.windowKeys = Object.keys(window).filter(k =>
      k.toLowerCase().includes('product') ||
      k.toLowerCase().includes('pdp') ||
      k.toLowerCase().includes('data') ||
      k.toLowerCase().includes('state') ||
      k.toLowerCase().includes('__')
    ).slice(0, 20);

    // Check for __NEXT_DATA__ or similar
    if (window.__NEXT_DATA__) {
      result.nextData = JSON.stringify(window.__NEXT_DATA__).substring(0, 500);
    }
    if (window.__INITIAL_STATE__) {
      result.initialState = JSON.stringify(window.__INITIAL_STATE__).substring(0, 500);
    }

    // 7. Meta tags
    const ogImage = document.querySelector('meta[property="og:image"]');
    result.ogImage = ogImage ? ogImage.getAttribute('content')?.substring(0, 150) : null;

    return result;
  });

  console.log('\n=== PAGE INFO ===');
  console.log(`Title: ${data.title}`);
  console.log(`H1: ${data.h1}`);
  console.log(`OG Image: ${data.ogImage}`);

  console.log('\n=== JSON-LD ===');
  console.log(`Count: ${data.jsonLdCount}`);
  console.log(JSON.stringify(data.jsonLdData, null, 2).substring(0, 3000));

  console.log('\n=== PRICE ELEMENTS ===');
  console.log(JSON.stringify(data.priceElements, null, 2));

  console.log('\n=== STRIKETHROUGH ===');
  console.log(JSON.stringify(data.strikethroughElements, null, 2));

  console.log('\n=== SIZE ELEMENTS (data-testid) ===');
  console.log(JSON.stringify(data.sizeTestIdElements, null, 2));

  console.log('\n=== SIZE BUTTONS (numeric) ===');
  console.log(JSON.stringify(data.sizeButtons, null, 2));

  console.log('\n=== SIZE CONTAINERS ===');
  console.log(JSON.stringify(data.sizeContainers, null, 2));

  console.log('\n=== WINDOW KEYS ===');
  console.log(JSON.stringify(data.windowKeys, null, 2));
  if (data.nextData) console.log('\n__NEXT_DATA__:', data.nextData);
  if (data.initialState) console.log('\n__INITIAL_STATE__:', data.initialState);

  await browser.close();
  console.log('\nDone.');
})();
