# Image Standard

> **One look. Every store. No exceptions.**
>
> Every product card on FASHION. must look like it came from the same photoshoot — same background, same framing, same direction. The user should never be able to tell which store an image came from just by looking at the photo style.

---

## The Target

The **Foot Locker shoe grid** is the gold standard. Every card should match this:

- Product on a clean, uniform `#F5F5F7` background (matches the card)
- Product centered, occupying ~75% of the image area
- All shoes facing **left** (toe pointing left)
- Consistent visual weight — no image feels bigger or smaller than the others
- No visible borders, frames, studio backdrops, or color differences between cards

---

## Current Problems

### What's broken today

| Problem | Stores affected | What it looks like |
|---|---|---|
| **Grey/dark studio background** baked into image | MR PORTER | Product sits in a grey box inside the light card — looks off |
| **White frame** baked into image (double border effect) | END Clothing | Product appears smaller because of the extra white padding inside the image |
| **Lifestyle/model shots** instead of product cutouts | SNS (clothing) | Model with cut-off legs, body parts visible — doesn't match product-only grid |
| **Inconsistent shoe direction** | All stores | Some shoes face left, some face right — grid looks messy |
| **Zoomed-in or oversized product** | Various (kids shoes) | Product fills entire image with no breathing room |
| **Tiny product in large canvas** | MR PORTER (sandals, small items) | Product is a small item floating in a huge empty space |

### Why it's broken

The current `normalizeImage()` function does a simple string replace:

```js
// Current — too basic, doesn't solve background issues
function normalizeImage(url) {
    return url.replace(
        'f_auto,q_auto,w_800,h_800,c_pad,b_white',
        'f_auto,q_auto/e_trim/w_800,h_800,c_pad,b_rgb:F5F5F7'
    );
}
```

This only trims whitespace and pads. It **cannot** fix:
- Non-white backgrounds (grey, colored)
- Frames baked into the image
- Lifestyle shots with models

---

## The Solution: One Universal Pipeline

**Every image goes through the exact same pipeline. No store-specific logic. No special cases.**

### Pipeline (at Cloudinary upload time)

```
Step 1: background_removal: "cloudinary_ai"   → AI removes ANY background
Step 2: e_trim                                  → Strip leftover transparent edges
Step 3: f_auto,q_auto                           → Optimize format + quality
Step 4: w_800,h_800,c_pad,b_rgb:F5F5F7         → Pad to 800×800, card-matching bg
```

### Why background removal on ALL images

Even images that already have a white background get `background_removal`. This guarantees:
- White-bg images → still clean (transparent cutout padded to `#F5F5F7`)
- Grey-bg images (MR PORTER) → grey removed, now clean
- Framed images (END) → frame removed, product isolated
- Any future store with any background → handled automatically

One pipeline. Zero exceptions.

### At upload (scraper)

```js
cloudinary.uploader.upload(imageUrl, {
    public_id: `picks/${productId}`,
    background_removal: "cloudinary_ai"
});
```

Background removal happens **once at upload**, not on every page load. This is cheaper and faster — the processed result is cached by Cloudinary.

### At display (frontend)

```js
function normalizeImage(url) {
    if (!url || url === '/favicon.png') return '';
    // Background already removed at upload — just trim, optimize, and pad
    return url.replace(
        'f_auto,q_auto,w_800,h_800,c_pad,b_white',
        'e_trim/f_auto,q_auto/w_800,h_800,c_pad,b_rgb:F5F5F7'
    );
}
```

---

## Non-Negotiable Rules

These apply to every product image in the system. No exceptions.

### 1. Background

All product images must display on `#F5F5F7` — matching the card background. No visible white boxes, grey patches, or colored areas around the product.

### 2. Shoe Direction

All shoes must face **left** (toe pointing left). If the source image has the shoe facing right, apply `e_hflip` in the Cloudinary transform chain to mirror it.

### 3. Framing

The product must occupy approximately **75% of the 800×800 canvas**, centered both horizontally and vertically. Not so tight it crops details, not so small it floats in empty space.

### 4. Completeness

The **full product** must be visible:
- Shoes: entire shoe including sole, no cropping
- Clothing: full garment visible, no cut-off sleeves or hems
- Accessories: complete item, no edges clipped

### 5. Product shots only

Only **product cutout images** are accepted for the card grid. These are images showing the product alone, isolated from any context.

**Not accepted:**
- Model/lifestyle shots (person wearing the item)
- On-foot photos
- Flat-lay scenes with multiple items
- Marketing images with text overlays or watermarks

---

## Product JSON Fields

Each product JSON file includes these image-related fields:

```json
{
    "image": "https://res.cloudinary.com/dykocdlgk/image/upload/...",
    "originalImage": "",
    "imageStatus": "ok",
    "imageType": "product-cutout",
    "shoeDirection": "left"
}
```

### `imageStatus`

| Value | Meaning | Action |
|---|---|---|
| `ok` | Image meets all rules above | Display normally |
| `needs-review` | Auto-flagged — may have issues | Manual check required before displaying |
| `rejected` | Does not meet standard | Do not display, show fallback instead |
| `processing` | Background removal in progress | Show loading placeholder |

### `imageType`

| Value | Description | Accepted? |
|---|---|---|
| `product-cutout` | Product only, no model, isolated on background | ✅ Yes |
| `product-lifestyle` | Product on a model or in a scene | ❌ No — flag as `needs-review` |
| `product-framed` | Product cutout but inside a visible border/frame | ⚠️ Accepted after `e_trim` + bg removal |

### `shoeDirection`

| Value | Meaning |
|---|---|
| `left` | Toe points left — correct, no transform needed |
| `right` | Toe points right — apply `e_hflip` at display time |
| `unknown` | Direction unclear — flag for manual review |

---

## Cloudinary Cost Note

`background_removal: "cloudinary_ai"` is a paid Cloudinary add-on:
- Free tier: ~15 removals
- After that: billed per transformation

To keep costs manageable:
- Apply bg removal **at upload time only** (one-time cost per image)
- Never apply `e_background_removal` in the delivery URL (would bill on every unique request)
- Already-processed images are served from Cloudinary's CDN cache at no extra AI cost

---

## Implementation Checklist

- [ ] Update scraper to apply `background_removal: "cloudinary_ai"` at Cloudinary upload
- [ ] Update scraper to detect and set `imageType` field on each product
- [ ] Update scraper to detect and set `shoeDirection` field (default: `left`, flag `unknown` if unsure)
- [ ] Update `normalizeImage()` in `sales.js` to use the new transform chain
- [ ] Add `e_hflip` logic for right-facing shoes in `normalizeImage()`
- [ ] Re-upload all existing product images with background removal applied
- [ ] Review and fix all products currently flagged `needs-review`
- [ ] Add fallback UI for `rejected` / `processing` image states
