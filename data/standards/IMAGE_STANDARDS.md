# Image Standards

Every product image on the site must look consistent — regardless of which store it was scraped from. This document defines the rules.

## 1. Source Image (`originalImage`)

- Always save the original source URL from the brand or store
- Prefer brand-direct CDN URLs over store-hosted versions
- Priority order:
  1. Brand CDN (Nike, adidas, New Balance, etc.)
  2. Store product page image
  3. Manual screenshot (last resort)

## 2. Hosted Image (`image`) — Cloudinary

### Naming Convention

```
picks/{productId}-{slug}
```

Examples:
- `picks/HQ7978-101-air-jordan-5-retro-og-fire-red`
- `picks/U1906ROE-new-balance-1906r-black`

### Transform URL

```
https://res.cloudinary.com/dykocdlgk/image/upload/f_auto,q_auto,w_800,h_800,c_pad,b_rgb:f5f5f7,e_shadow:40/picks/{name}
```

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `f_auto` | automatic | Serves WebP where supported, JPEG otherwise |
| `q_auto` | automatic | Optimizes quality/size balance |
| `w_800` | 800px | Canvas width |
| `h_800` | 800px | Canvas height |
| `c_pad` | pad | Fits image into canvas without cropping |
| `b_rgb:f5f5f7` | #f5f5f7 | Card-matching background — blends with `.pick-card-image` |
| `e_shadow:40` | 40% intensity | Subtle professional drop shadow |

### Why `#f5f5f7` not white?

The product card image area uses `background: #f5f5f7` in the CSS. Using pure white (`b_white`) creates a visible white rectangle sitting on the gray card — breaking the seamless look. Matching the Cloudinary background to the card background makes images blend perfectly into their containers.

## 3. Visual Standard

| Property | Requirement |
|----------|-------------|
| **Aspect ratio** | 1:1 square |
| **Background** | `#f5f5f7` — matches card image area |
| **Shadow** | Subtle drop shadow via `e_shadow:40` |
| **Product placement** | Centered, occupying ~80% of the frame |
| **Footwear angle** | 3/4 lateral view (standard industry angle) |
| **Clothing angle** | Flat-lay or mannequin (no on-model for primary) |
| **Accessories angle** | Front-facing, centered |
| **Overlays** | None — no text, watermarks, or store branding |
| **Minimum resolution** | 800×800px for the hosted version |

## 4. Color Reference

These values must stay in sync:

| Location | Property | Value |
|----------|----------|-------|
| `sales.css` | `.pick-card-image { background }` | `#f5f5f7` |
| Cloudinary transform | `b_rgb:` | `f5f5f7` |
| This doc | Visual standard background | `#f5f5f7` |

If the card background changes, update the Cloudinary transform to match.

## 5. Processing Pipeline

When a scraper fetches a new product:

1. Save `originalImage` URL in the product JSON
2. Upload to Cloudinary with the naming convention above
3. Apply the Cloudinary transform URL as the `image` field
4. Validate the result:
   - If image meets standards → `"imageStatus": "ok"`
   - If too small, wrong angle, or has watermarks → `"imageStatus": "needs-review"`
   - If source blocked or unavailable → `"imageStatus": "missing"`
   - If only lifestyle/on-model available → `"imageStatus": "non-standard"`

## 6. Fallback Rules

| Situation | Action |
|-----------|--------|
| Store blocks image scraping | Flag `"imageStatus": "missing"`, try brand CDN as fallback |
| Only lifestyle image available | Use it, flag `"imageStatus": "non-standard"` |
| Image too small (<400px) | Flag `"imageStatus": "needs-review"`, look for higher-res source |
| Multiple colorways in one shot | Crop to single product, or find per-colorway image |

## 7. Examples

### ✅ Good: Brand CDN, matching background, shadow, 3/4 view
```
https://res.cloudinary.com/dykocdlgk/image/upload/f_auto,q_auto,w_800,h_800,c_pad,b_rgb:f5f5f7,e_shadow:40/picks/HQ7978-101-air-jordan-5-retro
```

### ❌ Bad: Pure white background (creates visible box on card)
```
https://res.cloudinary.com/dykocdlgk/image/upload/f_auto,q_auto,w_800,h_800,c_pad,b_white/picks/some-product
```

### ❌ Bad: Store lifestyle shot, non-standard background
```
https://www.footlocker.nl/product-images/lifestyle-shot-on-model.jpg
```

### ❌ Bad: Low resolution, store watermark
```
https://cdn.store.com/thumb_150x150/product.jpg
```
