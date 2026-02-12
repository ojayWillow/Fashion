# 🔥 FASHION. — Scraper Knowledge Base

> **Purpose**: Documents how each store is scraped so we never have to figure it out again.
> Last updated: 2026-02-12

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Store: Foot Locker](#store-foot-locker)
- [Store: SNS (Sneakersnstuff)](#store-sns-sneakersnstuff)
- [Store: END.](#store-end)
- [Store: Solebox](#store-solebox)
- [Store: Nike](#store-nike)
- [Store: Generic Shopify](#store-generic-shopify)
- [Adding a New Store](#adding-a-new-store)

---

## Architecture Overview

The scraper (`scripts/process-queue.js`) has three browser paths:

| Path | Browser | Mode | Used For |
|------|---------|------|----------|
| `scrapeFootLocker()` | **Patchright** | Non-headless | Foot Locker (Kasada bot protection) |
| `scrapeGeneric(url, config, true)` | **Patchright** | Non-headless | Cloudflare-protected stores (SNS) |
| `scrapeGeneric(url, config, false)` | **Playwright** | Headless | Everything else (END., Solebox, etc.) |

### Router Logic (`scrapePage()`)

```
1. isFootLocker(domain)?     → scrapeFootLocker()      [dedicated FL scraper]
2. needsPatchright(domain)?  → scrapeGeneric(patchright) [generic + Cloudflare bypass]
3. else                      → scrapeGeneric(playwright)  [standard headless]
```

### Bot Protection Registry

Domains that need Patchright are listed in `PATCHRIGHT_DOMAINS`:

```js
const PATCHRIGHT_DOMAINS = ['footlocker', 'sneakersnstuff'];
```

To add a new protected store, just add its domain keyword here.

### Data Extraction Priority

For all stores, data is extracted in this order:
1. **JSON-LD** (`<script type="application/ld+json">`) — most reliable
2. **CSS selectors** from `store-configs.json` — fallback
3. **Meta tags** (`og:image`, `product:price:amount`) — last resort

---

## Store: Foot Locker

| Property | Value |
|----------|-------|
| **Domains** | `footlocker.nl`, `footlocker.co.uk`, `footlocker.com`, `footlocker.de`, etc. |
| **Platform** | Custom (not Shopify) |
| **Bot Protection** | **Kasada** — blocks all headless browsers |
| **Browser** | Patchright (non-headless, dedicated scraper) |
| **Wait Time** | 8 seconds (Kasada challenge) |

### URL Format
```
https://www.footlocker.nl/en/product/nike-air-max-plus/314205904404.html
                                                        └── SKU (10-15 digits)
```

### How Data is Extracted

| Field | Method |
|-------|--------|
| **Name** | JSON-LD `Product.name` → fallback `h1` |
| **Price (sale)** | JSON-LD `offers[0].price` → `.text-sale_red` |
| **Price (retail)** | CSS `line-through` computed style on spans → `<s>` / `<del>` → meta `product:price:amount` |
| **Sizes** | JSON-LD `offers[].sku` (split by `-`, last part = size) with `InStock` check → fallback `SizeSelector` buttons |
| **Image** | JSON-LD `Product.image` → append `?wid=763&hei=538&fmt=png-alpha` → fallback construct from SKU |
| **Brand** | JSON-LD `Product.brand` |

### Size Availability Logic
- JSON-LD offers have `availability: "InStock"` or `"OutOfStock"`
- Sold-out sizes are tracked separately (`_soldOut` count)
- Fallback: DOM buttons with class `--d` or grey color `rgb(117, 117, 117)` = sold out

### Image URL Pattern
```
https://images.footlocker.com/is/image/FLEU/{SKU}?wid=763&hei=538&fmt=png-alpha
```

### Known Quirks
- Cookie banner (`#onetrust-accept-btn-handler`) must be dismissed
- Page needs 8s wait minimum for Kasada to resolve
- SKU is extracted from the URL before scraping (required)
- Different TLDs = different currencies (`.nl` = EUR, `.co.uk` = GBP, `.com` = USD)

---

## Store: SNS (Sneakersnstuff)

| Property | Value |
|----------|-------|
| **Domain** | `sneakersnstuff.com` |
| **Platform** | **Shopify** |
| **Bot Protection** | **Cloudflare** — blocks headless Playwright completely (empty page) |
| **Browser** | Patchright (non-headless, via generic scraper) |
| **Wait Time** | 7 seconds minimum (Cloudflare challenge) |

### URL Format
```
https://www.sneakersnstuff.com/products/puma-wmns-speedcat-ballet-cow-407787-01
                                         └── slug with style code
```

> ⚠️ Old URLs with `/en-eu/products/` are 404 now. Current format is just `/products/`.

### How Data is Extracted

| Field | Method |
|-------|--------|
| **Name** | JSON-LD `ProductGroup.hasVariant[0].name` (strip size suffix like ` - XS`) → fallback `ProductGroup.name` |
| **Brand** | JSON-LD `ProductGroup.brand.name` |
| **Price (sale)** | JSON-LD `hasVariant[0].offers.price` (from InStock variants) |
| **Price (retail)** | CSS `.price__original` or `[class*="price"] s` (strikethrough) |
| **Sizes** | JSON-LD `hasVariant[].sku` — split by `-`, last part = size (e.g. `JV7479-XS` → `XS`) — filtered by `offers.availability: InStock` |
| **Image** | JSON-LD `hasVariant[0].image` → fallback `og:image` |

### Shopify ProductGroup JSON-LD Structure
```json
{
  "@type": "ProductGroup",
  "name": "Puma Speedcat",
  "brand": { "@type": "Brand", "name": "Puma" },
  "hasVariant": [
    {
      "@type": "Product",
      "name": "Puma Speedcat - 6.5",
      "sku": "407787-01-6.5",
      "image": "https://cdn.shopify.com/...",
      "offers": {
        "price": "68.00",
        "availability": "https://schema.org/InStock"
      }
    }
  ]
}
```

### Known Quirks
- **Cloudflare blocks headless browsers** — page returns empty HTML, scraper only sees hostname
- Must use Patchright (non-headless) — Chrome window pops up briefly
- `/en-eu/` prefix in URLs is dead, use `/products/` directly
- Size extraction from SKU: split by `-`, take last segment
- Variant names include size suffix (` - 6.5`) which needs to be stripped from product name
- Currency is EUR for `.com` domain (EU store)

---

## Store: END.

| Property | Value |
|----------|-------|
| **Domain** | `endclothing.com` |
| **Platform** | Custom |
| **Bot Protection** | **None significant** — headless Playwright works fine |
| **Browser** | Playwright (headless) |
| **Wait Time** | Default (4s) |

### URL Format
```
https://www.endclothing.com/gb/nike-air-max-plus-drift-fd4290-004.html
                             └── region    └── slug with style code
```

### How Data is Extracted

| Field | Method |
|-------|--------|
| **Name** | CSS selectors from `store-configs.json` (`h1`, `[data-testid="product-title"]`) |
| **Price** | CSS selectors for sale/retail prices |
| **Sizes** | DOM size selector buttons |
| **Image** | `og:image` meta tag |

### Known Quirks
- Cookie consent popup needs dismissing
- Style code can be extracted from URL (slug before `.html`)
- Region prefix in URL (`/gb/`, `/us/`) affects currency
- Standard headless scraping works — no special browser needed

---

## Store: Solebox

| Property | Value |
|----------|-------|
| **Domain** | `solebox.com` |
| **Platform** | Shopify |
| **Bot Protection** | **None significant** — headless Playwright works |
| **Browser** | Playwright (headless) |
| **Wait Time** | Default (4s) |

### How Data is Extracted
- Uses generic Shopify extraction (JSON-LD `Product` type)
- Standard CSS selectors from `store-configs.json`

---

## Store: Nike

| Property | Value |
|----------|-------|
| **Domain** | `nike.com` |
| **Platform** | Custom |
| **Bot Protection** | Moderate — may need investigation |
| **Browser** | Playwright (headless) — may need Patchright if blocked |

### Known Quirks
- Nike has aggressive bot detection that may evolve
- If scraping starts failing, add `'nike'` to `PATCHRIGHT_DOMAINS`

---

## Store: Generic Shopify

Many stores run on Shopify and share the same JSON-LD structure. The scraper handles two Shopify JSON-LD formats:

### Format 1: `ProductGroup` (newer Shopify themes — SNS, etc.)
```json
{ "@type": "ProductGroup", "hasVariant": [...] }
```
- Variants contain individual sizes with SKU, price, availability
- Size extracted from SKU or variant name

### Format 2: `Product` (standard Shopify)
```json
{ "@type": "Product", "offers": { "price": "..." } }
```
- Single price, sizes from DOM buttons

### Format 3: `@graph` wrapper
```json
{ "@graph": [{ "@type": "Product", ... }] }
```
- Same as Format 2 but wrapped in a graph array

---

## Adding a New Store

### Step 1: Check if it loads in headless Playwright

Run with `--verbose` and check the output. If name comes back as the hostname or empty → it's bot-protected.

### Step 2: If bot-protected, add to Patchright

In `process-queue.js`:
```js
const PATCHRIGHT_DOMAINS = ['footlocker', 'sneakersnstuff', 'newstore'];
```

### Step 3: Check JSON-LD

Open the product page in a real browser, view source, search for `application/ld+json`. Check if it's:
- `Product` type → standard extraction works
- `ProductGroup` with `hasVariant` → Shopify variant extraction works
- Something else → may need custom selectors

### Step 4: Add selectors to `store-configs.json`

```json
"newstore.com": {
  "nameSelectors": ["h1", ".product-title"],
  "priceSelectors": [".sale-price", ".current-price"],
  "retailPriceSelectors": [".original-price", ".was-price"],
  "sizeSelectors": [".size-option", "button[data-size]"],
  "imageSelectors": [".product-image img"],
  "waitTime": 5000
}
```

### Step 5: Add to `stores.json`

```json
{
  "name": "New Store",
  "url": "https://www.newstore.com",
  "country": "Country",
  "flag": "🏳️"
}
```

### Step 6: Test

```bash
echo "https://www.newstore.com/products/some-product" > data/queue.txt
node scripts/process-queue.js --dry-run --verbose
```

Check: name ✅, price ✅, sizes ✅, image ✅

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Name = hostname (e.g. `www.store.com`) | Bot protection blocking headless | Add domain to `PATCHRIGHT_DOMAINS` |
| Price not found | JSON-LD doesn't have price, CSS selectors wrong | Check JSON-LD structure, update `store-configs.json` |
| Sizes empty | Size buttons use non-standard classes | Add size selectors to `store-configs.json` |
| Image missing | `og:image` not set, product images lazy-loaded | Add image selectors, increase wait time |
| 404 on product URL | Store changed URL format | Check current URL structure in browser |
| Timeout errors | Slow store or heavy page | Increase `waitTime` in config |
| Duplicate not detected | URL format changed (params, trailing slash) | Check `normalizeUrl()` and `extractSkuFromUrl()` |
