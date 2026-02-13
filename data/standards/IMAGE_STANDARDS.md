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
https://res.cloudinary.com/dykocdlgk/image/upload/f_auto,q_auto,w_800,h_800,c_pad,b_white/picks/{name}
```

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `f_auto` | automatic | Serves WebP where supported, JPEG otherwise |
| `q_auto` | automatic | Optimizes quality/size balance |
| `w_800` | 800px | Canvas width |
| `h_800` | 800px | Canvas height |
| `c_pad` | pad | Fits image into canvas without cropping |
| `b_white` | #FFFFFF | White background fill |

## 3. Visual Standard

| Property | Requirement |
|----------|-------------|
| **Aspect ratio** | 1:1 square |
| **Background** | Pure white `#FFFFFF` |
| **Product placement** | Centered, occupying ~80% of the frame |
| **Footwear angle** | 3/4 lateral view (standard industry angle) |
| **Clothing angle** | Flat-lay or mannequin (no on-model for primary) |
| **Accessories angle** | Front-facing, centered |
| **Overlays** | None — no text, watermarks, or store branding |
| **Minimum resolution** | 800×800px for the hosted version |

## 4. Processing Pipeline

When a scraper fetches a new product:

1. Save `originalImage` URL in the product JSON
2. Upload to Cloudinary with the naming convention above
3. Apply the Cloudinary transform URL as the `image` field
4. Validate the result:
   - If image meets standards → `"imageStatus": "ok"`
   - If too small, wrong angle, or has watermarks → `"imageStatus": "needs-review"`
   - If source blocked or unavailable → `"imageStatus": "missing"`
   - If only lifestyle/on-model available → `"imageStatus": "non-standard"`

## 5. Fallback Rules

| Situation | Action |
|-----------|--------|
| Store blocks image scraping | Flag `"imageStatus": "missing"`, try brand CDN as fallback |
| Only lifestyle image available | Use it, flag `"imageStatus": "non-standard"` |
| Image too small (<400px) | Flag `"imageStatus": "needs-review"`, look for higher-res source |
| Multiple colorways in one shot | Crop to single product, or find per-colorway image |

## 6. Examples

### ✅ Good: Brand CDN, white background, 3/4 view
```
https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/.../JORDAN+5+RETRO+OG.png
```

### ❌ Bad: Store lifestyle shot, non-white background
```
https://www.footlocker.nl/product-images/lifestyle-shot-on-model.jpg
```

### ❌ Bad: Low resolution, store watermark
```
https://cdn.store.com/thumb_150x150/product.jpg
```
