const { chromium } = require('patchright');

(async () => {
  console.log('Launching Patchright browser...');
  const b = await chromium.launch({ headless: false });
  const p = await b.newPage();

  console.log('Loading FL page...');
  await p.goto('https://www.footlocker.nl/nl/product/~/314217525204.html');
  await p.waitForTimeout(10000);

  const t = await p.title();
  console.log('Title:', t);

  const h1 = await p.evaluate(() => {
    const el = document.querySelector('h1');
    return el ? el.textContent.trim() : 'none';
  });
  console.log('H1:', h1);

  const metaCount = await p.evaluate(() => document.querySelectorAll('meta').length);
  console.log('Meta tags found:', metaCount);

  const bodyLength = await p.evaluate(() => document.body.innerHTML.length);
  console.log('Body HTML length:', bodyLength);

  await b.close();
  console.log('Done!');
})();
