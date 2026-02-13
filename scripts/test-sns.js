// Foot Locker recon #3 — debug why line-through span isn't found
const { chromium } = require('patchright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto('https://www.footlocker.nl/nl/product/lacoste-spinor-heren-schoenen/314217718304.html', {
    waitUntil: 'domcontentloaded',
  });

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

    // 1. Try the exact selectors from our adapter
    const lineThrough = document.querySelectorAll('span.line-through');
    result.spanLineThrough = lineThrough.length;

    // 2. Try querySelector with contains
    const allSpans = document.querySelectorAll('span');
    const ltSpans = [];
    for (const span of allSpans) {
      const cls = span.className || '';
      const text = span.textContent.trim();
      if (cls.includes('line-through') || cls.includes('linethrough') || cls.includes('crossed')) {
        ltSpans.push({ text: text.substring(0, 60), class: cls.substring(0, 120) });
      }
    }
    result.lineThruByClass = ltSpans;

    // 3. Check computed styles for line-through
    const priceSpans = [];
    for (const span of allSpans) {
      const text = span.textContent.trim();
      if (text.includes('\u20ac') && text.length < 20 && span.children.length === 0) {
        const style = window.getComputedStyle(span);
        priceSpans.push({
          text,
          class: (span.className || '').substring(0, 120),
          textDecoration: style.textDecorationLine || style.textDecoration || 'none',
          color: style.color,
          parentClass: (span.parentElement?.className || '').substring(0, 120),
          parentParentClass: (span.parentElement?.parentElement?.className || '').substring(0, 120),
        });
      }
    }
    result.allEuroSpans = priceSpans;

    // 4. Find the "Bespaar" element and its siblings/parent
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      if (el.children.length === 0 && el.textContent.trim().includes('Bespaar')) {
        result.bespaarEl = {
          text: el.textContent.trim(),
          tag: el.tagName,
          class: (el.className || '').substring(0, 120),
          parentHTML: el.parentElement?.innerHTML?.substring(0, 500) || '',
          grandparentHTML: el.parentElement?.parentElement?.innerHTML?.substring(0, 1000) || '',
        };
        break;
      }
    }

    // 5. Specifically look at the ProductPrice area
    const ppEls = document.querySelectorAll('[class*="ProductPrice"]');
    result.productPriceElements = [...ppEls].slice(0, 5).map(el => ({
      tag: el.tagName,
      class: (el.className || '').substring(0, 120),
      text: el.textContent.trim().substring(0, 80),
      html: el.innerHTML.substring(0, 300),
    }));

    return result;
  });

  console.log('\n=== span.line-through count ===');
  console.log(data.spanLineThrough);

  console.log('\n=== Spans with line-through in className ===');
  console.log(JSON.stringify(data.lineThruByClass, null, 2));

  console.log('\n=== ALL € spans with computed styles ===');
  console.log(JSON.stringify(data.allEuroSpans, null, 2));

  console.log('\n=== Bespaar element & parent ===');
  console.log(JSON.stringify(data.bespaarEl, null, 2));

  console.log('\n=== ProductPrice elements ===');
  console.log(JSON.stringify(data.productPriceElements, null, 2));

  await browser.close();
  console.log('\nDone.');
})();
