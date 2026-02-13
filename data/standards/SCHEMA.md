# Product Data Schema

This document defines the data model for product files stored under `data/products/`.

## Product File

Each product is a single JSON file named `{productId}.json` stored in `data/products/`.

The `productId` is the item's style code (e.g., `HQ7978-101`, `U1906ROE`). If no style code exists, use a generated slug like `puma-speedcat-og-398846-56`.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `productId` | string | ✅ | Unique identifier — style code or slug |
| `name` | string | ✅ | Product name (English, no HTML) |
| `brand` | string | ✅ | Brand name (e.g., "Jordan", "Nike", "adidas") |
| `colorway` | string | ✅ | Colorway description (e.g., "White / Fire Red / Black") |
| `category` | string | ✅ | One of: `Sneakers`, `Clothing`, `Accessories`, `Footwear` |
| `tags` | string[] | ✅ | Searchable tags (brand, sale, collab name, etc.) |
| `image` | string | ✅ | Cloudinary URL with transforms (see IMAGE_STANDARDS.md) |
| `originalImage` | string | ⬚ | Source image URL from brand/store CDN |
| `imageStatus` | string | ✅ | One of: `ok`, `needs-review`, `non-standard`, `missing` |
| `description` | string | ⬚ | Plain text description (no HTML, max 300 chars) |
| `listings` | Listing[] | ✅ | Array of store listings (at least one) |

### Listing Object

Each listing represents one store's offer for this product.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `store` | string | ✅ | Store slug (matches filename in `data/stores/`) |
| `url` | string | ✅ | Direct product page URL |
| `retailPrice` | Price | ✅ | Original retail price |
| `salePrice` | Price | ✅ | Current sale price |
| `discount` | number | ✅ | Discount percentage (0–100, integer) |
| `sizes` | string[] | ✅ | Available sizes (EU sizing preferred) |
| `lastScraped` | string | ✅ | ISO 8601 timestamp of last scrape |
| `available` | boolean | ✅ | Whether the item is currently in stock |

### Price Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | ✅ | Numeric value (e.g., 210) |
| `currency` | string | ✅ | ISO 4217 code: `EUR`, `GBP`, `USD` |

## Store Metadata File

Each store has a metadata file in `data/stores/{slug}.json`.

| Field | Type | Description |
|-------|------|-------------|
| `slug` | string | URL-safe identifier |
| `name` | string | Display name |
| `url` | string | Store homepage |
| `flag` | string | Country flag emoji |
| `country` | string | Country name |
| `currency` | string | Default currency (ISO 4217) |
| `shipsTo` | string[] | Countries/regions they ship to |
| `scrapeMethod` | string | How we scrape: `api`, `browser`, `manual` |

## Index File (`data/index.json`)

A lightweight index for fast catalog loading. Generated from product files.

```json
{
  "products": [
    {
      "productId": "HQ7978-101",
      "name": "Air Jordan 5 Retro OG \"Fire Red\"",
      "brand": "Jordan",
      "category": "Sneakers",
      "image": "https://res.cloudinary.com/...",
      "bestPrice": { "amount": 126, "currency": "EUR" },
      "storeCount": 2,
      "tags": ["Jordan", "Sale"]
    }
  ],
  "generatedAt": "2026-02-13T07:00:00Z"
}
```

## Validation Rules

1. `retailPrice.amount` must be ≥ `salePrice.amount` (if on sale)
2. `discount` must equal `round((retail - sale) / retail * 100)`
3. `image` URL must use the Cloudinary transform format from IMAGE_STANDARDS.md
4. `description` must be plain text — strip all HTML tags
5. `sizes` must use EU sizing format where possible (e.g., "EU 42", not "US 9")
6. `name` must not contain HTML entities (e.g., use `'` not `&#39;`)
