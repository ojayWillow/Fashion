const { chromium } = require('patchright');
const fs = require('fs');

async function main() {
  const picks = JSON.parse(fs.readFileSync('data/picks.json', 'utf-8'));
  const need = picks.picks.filter(p => (!p.sizes || p.sizes.length === 0) && p.url);
  console.log(need.length + ' picks need sizes');

  const browser = await chromium.launch({ headless: false });

  for (const pick of need) {
    console.log('\n#' + pick.id + ' ' + pick.name);
    const page = await browser.newPage();
    try {
      await page.goto(pick.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(8000);

      try {
        const cookieBtn = await page.$('[id="onetrust-accept-btn-handler"]');
        if (cookieBtn) { await cookieBtn.click(); await page.waitForTimeout(1000); }
      } catch (e) {}

      const sizes = await page.evaluate(() => {
        // Try JSON-LD first (Shopify ProductGroup)
        var scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (var i = 0; i < scripts.length; i++) {
          try {
            var d = JSON.parse(scripts[i].textContent);
            if (d['@type'] === 'ProductGroup' && d.hasVariant) {
              var inStock = d.hasVariant.filter(function(v) {
                return v.offers && v.offers.availability && v.offers.availability.indexOf('InStock') !== -1;
              });
              return inStock.map(function(v) {
                if (v.sku) {
                  var parts = v.sku.split('-');
                  if (parts.length > 1) return parts[parts.length - 1];
                }
                if (v.name) {
                  var m = v.name.match(/\s-\s(.+)$/);
                  if (m) return m[1].trim();
                }
                return v.title || '';
              }).filter(function(s) { return s; });
            }
            // Standard Product with offers array
            if (d['@type'] === 'Product' && d.offers) {
              var offers = Array.isArray(d.offers) ? d.offers : [d.offers];
              var available = offers.filter(function(o) {
                return !o.availability || o.availability.indexOf('InStock') !== -1;
              });
              return available.map(function(o) {
                if (o.sku) {
                  var parts = o.sku.split('-');
                  return parts[parts.length - 1];
                }
                return '';
              }).filter(function(s) { return s; });
            }
          } catch (e) {}
        }

        // Try Foot Locker size buttons
        var sizeArea = document.querySelector('[class*="SizeSelector"]');
        if (sizeArea) {
          var buttons = sizeArea.querySelectorAll('button');
          var found = [];
          buttons.forEach(function(btn) {
            var t = btn.textContent.trim();
            if (!t || t.length > 12) return;
            var cls = (btn.className || '').toString();
            if (cls.indexOf('--d') !== -1) return;
            if (btn.getAttribute('aria-disabled') === 'true') return;
            if (btn.disabled) return;
            found.push(t);
          });
          if (found.length > 0) return found;
        }

        // Try generic size buttons
        var selectors = [
          'button[class*="size"]', '[class*="size"] button',
          '[class*="Size"] button', '[data-testid*="size"]',
          '[class*="variant"] button', '[class*="option"] button'
        ];
        for (var j = 0; j < selectors.length; j++) {
          var els = document.querySelectorAll(selectors[j]);
          var vals = [];
          els.forEach(function(el) {
            var t = el.textContent.trim();
            if (t && t.length < 15 && !el.disabled && el.getAttribute('aria-disabled') !== 'true') {
              vals.push(t);
            }
          });
          if (vals.length > 0) return vals;
        }

        return [];
      });

      if (sizes.length > 0) {
        pick.sizes = sizes;
        console.log('  Found ' + sizes.length + ' sizes: ' + sizes.join(', '));
      } else {
        console.log('  No sizes found');
      }
    } catch (e) {
      console.log('  Error: ' + e.message);
    }
    await page.close();
  }

  await browser.close();
  fs.writeFileSync('data/picks.json', JSON.stringify(picks, null, 2) + '\n');
  console.log('\nSaved picks.json');
}

main().catch(function(e) {
  console.error('Fatal:', e.message);
  process.exit(1);
});
