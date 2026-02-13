// END. recon #2 — find the size selector elements
const { chromium } = require('patchright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('Opening END. with Patchright...');
  await page.goto('https://www.endclothing.com/gb/adidas-tahiti-marine-sneaker-jr4773.html', {
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

  // Look for any element with "size" in its attributes or data-test-id
  const sizeData = await page.evaluate(() => {
    const result = {};

    // 1. Find ALL elements with data-test-id containing size
    const testIdEls = document.querySelectorAll('[data-test-id*="ize"], [data-test-id*="SIZE"]');
    result.dataTestIdElements = [...testIdEls].slice(0, 20).map(el => ({
      tag: el.tagName,
      testId: el.getAttribute('data-test-id'),
      text: el.textContent.trim().substring(0, 50),
      class: (el.className || '').substring(0, 80),
      childCount: el.children.length,
    }));

    // 2. Find ALL buttons inside the product details area
    const pdpButtons = document.querySelectorAll('button');
    const sizeButtons = [];
    for (const btn of pdpButtons) {
      const text = btn.textContent.trim();
      // Look for buttons that look like sizes (numbers, UK sizes, etc)
      if (/^(UK\s?)?\d{1,2}(\.5)?$/.test(text) || /^EU\s?\d{2}/.test(text)) {
        sizeButtons.push({
          text,
          class: (btn.className || '').substring(0, 80),
          disabled: btn.disabled,
          ariaLabel: btn.getAttribute('aria-label') || null,
          dataTestId: btn.getAttribute('data-test-id') || null,
        });
      }
    }
    result.sizeButtons = sizeButtons.slice(0, 20);

    // 3. Find any <select> elements
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

    // 4. Find any element with aria-label containing "size"
    const ariaEls = document.querySelectorAll('[aria-label*="ize"], [aria-label*="SIZE"]');
    result.ariaElements = [...ariaEls].slice(0, 10).map(el => ({
      tag: el.tagName,
      ariaLabel: el.getAttribute('aria-label'),
      text: el.textContent.trim().substring(0, 80),
      class: (el.className || '').substring(0, 80),
      childCount: el.children.length,
    }));

    // 5. Look for a size container via common patterns
    const containers = document.querySelectorAll(
      '[class*="SizeSelector"], [class*="sizeSelector"], [class*="size-selector"], ' +
      '[class*="SizeGrid"], [class*="sizeGrid"], [class*="size-grid"], ' +
      '[class*="SizeList"], [class*="sizeList"], [class*="size-list"], ' +
      '[class*="SizePicker"], [class*="sizePicker"]'
    );
    result.sizeContainers = [...containers].slice(0, 5).map(el => ({
      tag: el.tagName,
      class: (el.className || '').substring(0, 120),
      childCount: el.children.length,
      firstChildTag: el.firstElementChild?.tagName || null,
      innerHTML: el.innerHTML.substring(0, 500),
    }));

    // 6. Broad search: any element whose text is just a shoe size number
    const allSpans = document.querySelectorAll('span, div, a, li, p');
    const possibleSizes = [];
    for (const el of allSpans) {
      const text = el.textContent.trim();
      if (/^\d{1,2}(\.5)?$/.test(text) && el.children.length === 0) {
        possibleSizes.push({
          tag: el.tagName,
          text,
          class: (el.className || '').substring(0, 80),
          parentClass: (el.parentElement?.className || '').substring(0, 80),
          parentTag: el.parentElement?.tagName || null,
        });
      }
    }
    result.possibleSizeTexts = possibleSizes.slice(0, 20);

    return result;
  });

  console.log('\n=== DATA-TEST-ID with "size" ===');
  console.log(JSON.stringify(sizeData.dataTestIdElements, null, 2));

  console.log('\n=== SIZE BUTTONS (numeric) ===');
  console.log(JSON.stringify(sizeData.sizeButtons, null, 2));

  console.log('\n=== SELECT ELEMENTS ===');
  console.log(JSON.stringify(sizeData.selectElements, null, 2));

  console.log('\n=== ARIA "size" ELEMENTS ===');
  console.log(JSON.stringify(sizeData.ariaElements, null, 2));

  console.log('\n=== SIZE CONTAINERS (class match) ===');
  console.log(JSON.stringify(sizeData.sizeContainers, null, 2));

  console.log('\n=== POSSIBLE SIZE TEXTS (bare numbers) ===');
  console.log(JSON.stringify(sizeData.possibleSizeTexts, null, 2));

  await browser.close();
  console.log('\nDone.');
})();
