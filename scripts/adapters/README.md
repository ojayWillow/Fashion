# Store Adapters

Each adapter handles store-specific extraction quirks.

## How It Works

1. `base.js` opens the page and extracts **raw data** via JSON-LD + meta tags
2. If a store-specific adapter exists, it:
   - Can override extraction (e.g. Foot Locker DOM fallback)
   - Runs `postProcess()` to normalize store-specific data
3. If no adapter exists, base applies generic normalization

## Adapter Registry

| Store | File | Method | JSON-LD Type | Notes |
|-------|------|--------|-------------|-------|
| SNS | `sns.js` | Playwright | ProductGroup | Style code in name, EU sizes |
| END. | `end.js` | Playwright | ProductGroup | priceSpecification, UK/EU sizes |
| Foot Locker | `footlocker.js` | Patchright | Product (weak) | DOM fallback required, anti-bot |
| MR PORTER | `mrporter.js` | Patchright | ProductGroup | Designer = brand, GBP default |

## Adding a New Adapter

1. Create `scripts/adapters/{store-slug}.js`
2. Export `postProcess(raw, store)` — receives raw JSON-LD data
3. Optionally export `extractFromDOM(page)` — for DOM fallback
4. Optionally export `scrapeSalePage(page)` — for bulk URL scraping
5. Register the domain in `base.js` → `ADAPTER_MAP`
6. Register the store in `scrape.js` → `STORE_MAP`

## postProcess Signature

```js
function postProcess(raw, store) {
  // raw = { name, brand, image, description, colorway,
  //         salePrice, retailPrice, currency, sizes[], styleCode }
  // store = { name, flag, country, currency, scrapeMethod, slug }

  return {
    name, brand, styleCode, colorway, category, tags,
    image, description, retailPrice, salePrice, discount, sizes
  };
}
```

## Browser Requirements

- **Playwright** (`browser`): Standard headless Chrome. Works for most stores.
- **Patchright** (`patchright`): Anti-bot bypass Chrome. Required for Foot Locker, MR PORTER.

```bash
npm install playwright patchright
npx playwright install chromium
```
