const {chromium} = require('patchright');
(async () => {
  const b = await chromium.launch({headless: false});
  const p = await b.newPage();
  await p.goto('https://www.mrporter.com/en-gb/mens/product/nike/shoes/low-top-sneakers/air-max-dn-rubber-trimmed-mesh-sneakers/1647597336438635', {waitUntil: 'domcontentloaded', timeout: 30000});
  await p.waitForTimeout(10000);

  const data = await p.evaluate(() => {
    const result = { jsonLd: [], nextData: null, meta: {}, sizes: [], prices: {} };

    // JSON-LD
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try { result.jsonLd.push(JSON.parse(s.textContent)); } catch(e) {}
    });

    // __NEXT_DATA__
    const nd = document.querySelector('#__NEXT_DATA__');
    if (nd) { try { result.nextData = JSON.parse(nd.textContent); } catch(e) {} }

    // Meta tags
    ['og:title','og:image','og:price:amount','og:price:currency','product:price:amount','product:price:currency'].forEach(name => {
      const el = document.querySelector('meta[property="' + name + '"]') || document.querySelector('meta[name="' + name + '"]');
      if (el) result.meta[name] = el.getAttribute('content');
    });

    // Size buttons
    document.querySelectorAll('button, [class*="size"], [class*="Size"]').forEach(el => {
      const text = el.textContent.trim();
      if (/^\d{1,2}(\.\d)?$/.test(text) || /^(IT|EU|UK|US)\s?\d/i.test(text)) {
        const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true' || el.className.toString().includes('disabled') || el.className.toString().includes('unavailable');
        result.sizes.push({ text, disabled });
      }
    });

    // Price elements
    const allEls = document.querySelectorAll('[class*="rice"], [class*="Rice"]');
    allEls.forEach((el, i) => {
      const text = el.textContent.trim();
      if (text && /[\d£€$]/.test(text) && text.length < 50) {
        result.prices['price_' + i] = { text, classes: el.className.toString().substring(0, 100) };
      }
    });

    return result;
  });

  console.log('\n=== JSON-LD ===');
  console.log(JSON.stringify(data.jsonLd, null, 2).substring(0, 3000));
  console.log('\n=== META ===');
  console.log(JSON.stringify(data.meta, null, 2));
  console.log('\n=== SIZES ===');
  console.log(JSON.stringify(data.sizes, null, 2));
  console.log('\n=== PRICES ===');
  console.log(JSON.stringify(data.prices, null, 2));
  console.log('\n=== NEXT_DATA keys ===');
  if (data.nextData) {
    console.log('Top keys:', Object.keys(data.nextData));
    if (data.nextData.props) console.log('Props keys:', Object.keys(data.nextData.props));
  } else {
    console.log('No __NEXT_DATA__ found');
  }

  await b.close();
})();
