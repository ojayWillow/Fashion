# FASHION. — Luxury Streetwear & Sneakers Hub

> **The definitive weekly guide to high-end streetwear sales, luxury sneaker drops, and premium fashion promotions.**

![Theme: Purple/Black](https://img.shields.io/badge/Theme-Purple%20%2F%20Black-7c3aed?style=flat-square)
![Status: Live](https://img.shields.io/badge/Status-Live-a855f7?style=flat-square)
![Updated: Weekly](https://img.shields.io/badge/Updated-Weekly-6d28d9?style=flat-square)

---

## ✦ What is FASHION.?

FASHION. is a curated advertising & sales hub for **high-end streetwear and luxury sneakers**. It showcases handpicked deals from Europe's top fashion retailers — complete with product images, pricing, discount percentages, and direct buy links.

### Core Features

- **Weekly Picks Grid** — Curated products from END. Clothing, Foot Locker, SNS, and other premium stores, loaded dynamically from `picks.json`
- **Automated Scraper Pipeline** — Paste a product URL, run one command, and the scraper extracts everything: name, brand, prices, sizes, images, and stores it all
- **Dual Storage System** — Products save to both `picks.json` (site display) and per-store inventory files (catalog management)
- **Size Normalization** — All sizes auto-convert to EU format regardless of source store (UK, US, kids, women's)
- **Horizontal Ad Banners** — Interactive promotional banners with cursor-tracking glow effects
- **Brand Directory** — Organized by category: Sneaker Specialists, Streetwear & Hype, Luxury & Designer, and Multi-Brand Retailers
- **Automated Image Pipeline** — 5-source fallback system that guarantees product images for every item
- **Redirect Loading Screen** — Full-screen transition when users click external links

---

## 🎨 Design: Hybrid Theme

The site uses a **hybrid dark/light design**:

- **Dark sections** — Hero, header, navigation, and footer use the signature dark purple/black theme
- **Light sections** — Product grid and store cards use clean white backgrounds so product images blend naturally
- **Purple accents** — Buttons, tags, brand labels, hover effects, and the redirect screen

| Element | Value |
|---------|-------|
| **Primary Colors** | `#a855f7` (Purple), `#0a0a0f` (Dark), `#f8f8fa` (Light BG) |
| **Accent Gradient** | `135deg, #a855f7 → #7c3aed → #6d28d9` |
| **Card Background** | `#ffffff` with subtle border `rgba(0,0,0,0.06)` |
| **Text on Light** | `#1a1a2e` (headings), `#6b7280` (body), `#9ca3af` (muted) |
| **Heading Font** | Outfit (900 weight, uppercase) |
| **Body Font** | Space Grotesk |
| **Border Radius** | 16px |
| **Effects** | Glow shadows, gradient text, floating animations, pointer trails |

---

## 🏗 Project Structure

```
Fashion/
├── index.html                  # Main landing page — hero, banners, brand directory
├── sales.html                  # Weekly picks / sales page — renders products from picks.json
├── styles.css                  # Main page styles — dark purple/black theme
├── sales.css                   # Sales page styles — hybrid dark hero + white product grid
├── script.js                   # Main page JS — cursor effects, scroll reveal, banner trails
├── sales.js                    # Sales page JS — loads picks.json, renders cards, redirect screen
│
├── data/
│   ├── picks.json              # Product data for site display (Cloudinary URLs, EU sizes, prices)
│   ├── queue.txt               # Paste product URLs here → process-queue.js reads them
│   ├── queue-done.txt          # Processed URLs log
│   ├── stores.json             # Store directory with names, flags, countries, URLs
│   ├── store-configs.json      # Per-store scraper configs (CSS selectors, wait times)
│   ├── catalog-index.json      # Search index built from inventory (for future catalog page)
│   ├── fallback-images.json    # Manual backup image URLs (Source E)
│   ├── image-report.json       # Last run report from the image fetcher
│   └── inventory/              # Per-store product files
│       ├── end-clothing.json
│       ├── foot-locker.json
│       └── sneakersnstuff.json
│
├── scripts/
│   ├── process-queue.js        # ⭐ Main scraper — scrapes URLs, normalizes sizes, saves everything
│   ├── fetch-images.js         # 5-source image fetcher (sneaks-api → Playwright → Google → screenshot → fallback)
│   ├── build-index.js          # Rebuilds catalog-index.json from inventory files
│   ├── add-pick.js             # Manual pick entry helper
│   ├── fix-sizes.js            # Re-scrapes sizes for picks that are missing them
│   ├── normalize-sizes.js      # One-time bulk converter: normalizes all existing sizes to EU
│   ├── validate-picks.js       # Validates picks.json structure and data integrity
│   ├── setup-cloudinary.js     # Cloudinary folder/config setup helper
│   └── debug-scrape.js         # Debug tool for testing scraper on a single URL
│
├── images/
│   └── picks/                  # Locally saved product images (when not using Cloudinary)
│
├── .env.example                # Environment variable template (Cloudinary config)
├── .gitignore
├── package.json
└── README.md
```

---

## ⭐ Scraper Pipeline: process-queue.js

The heart of the project. One command to scrape, normalize, and save products.

### How to Add New Products

```bash
# 1. Paste product URLs into data/queue.txt (one per line)
https://www.endclothing.com/gb/some-sneaker.html
https://www.footlocker.nl/product/nike-air-max/12345.html
https://www.sneakersnstuff.com/en/product/12345/some-shoe

# 2. Run the scraper
node scripts/process-queue.js

# 3. Commit and push
git add -A
git commit -m "Add new picks"
git push
```

### What It Does (automatically)

1. **Reads** URLs from `data/queue.txt`
2. **Detects** the store and picks the right scraping strategy (Playwright for END., Patchright for Foot Locker/SNS Cloudflare bypass)
3. **Scrapes** product name, brand, prices, sizes, images, colorway, style code
4. **Normalizes sizes** to unified EU format (see Size Normalization below)
5. **Detects** brand, category, and generates tags
6. **Uploads** images to Cloudinary (if configured)
7. **Saves** to both `picks.json` and `data/inventory/{store}.json`
8. **Rebuilds** the catalog index
9. **Moves** processed URLs to `queue-done.txt`
10. **Deduplicates** — skips products already in picks or inventory

### Supported Stores

| Store | Protection | Scraper | Size System |
|-------|-----------|---------|-------------|
| **END. Clothing** | None | Playwright (headless) | UK / EU prefixed |
| **Foot Locker NL** | Kasada | Patchright (non-headless) | Bare EU numbers |
| **SNS (Sneakersnstuff)** | Cloudflare | Patchright (non-headless) | Bare US numbers |

New stores can be added via `data/store-configs.json` — just define CSS selectors for name, price, image, and sizes.

### CLI Flags

```bash
node scripts/process-queue.js              # Normal run
node scripts/process-queue.js --verbose    # Detailed logging
node scripts/process-queue.js --dry-run    # Preview without saving
```

---

## 📏 Size Normalization

All sizes are stored in **EU format** for consistency across stores. The conversion happens automatically inside `process-queue.js` when new products are scraped.

### Conversion Rules

| Source | Input | Output |
|--------|-------|--------|
| END. (UK prefix) | `UK 7.5` | `EU 41` |
| END. (EU prefix) | `EU 42` | `EU 42` |
| Foot Locker (bare EU) | `43` | `EU 43` |
| SNS (bare US men's) | `9` | `EU 42.5` |
| SNS (US women's) | `W8` | `EU 39` |
| SNS (kids toddler) | `2C` | `EU 17` |
| SNS (kids youth) | `1.5Y` | `EU 33` |
| Any (clothing) | `S`, `M`, `XL` | `S`, `M`, `XL` (unchanged) |
| Any (waist) | `W28`, `W32` | `W28`, `W32` (unchanged) |
| Any (one-size) | `OS` | `OS` (unchanged) |

The lookup tables cover every half-size: US 3.5–15, UK 3–14, Women's US 5–12, and all kids' C/Y sizes.

### Bulk Normalize Existing Data

If you have old picks with mixed size formats, run the one-time normalizer:

```bash
node scripts/normalize-sizes.js
```

---

## 📦 Data: picks.json

Every product in the weekly picks is stored in `data/picks.json`. Each item includes:

```json
{
  "id": 1,
  "name": "Air Jordan 5 Retro OG \"Fire Red\"",
  "brand": "Jordan",
  "styleCode": "HQ7978-101",
  "colorway": "White / Fire Red / Black",
  "retailPrice": "€210",
  "salePrice": "€126",
  "discount": "-40%",
  "store": "END. Clothing",
  "storeFlag": "🇬🇧",
  "image": "https://res.cloudinary.com/...",
  "url": "https://www.endclothing.com/...",
  "description": "...",
  "tags": ["Sneakers", "Jordan", "Sale"],
  "sizes": ["EU 36", "EU 37.5", "EU 42", "EU 45"]
}
```

---

## 📂 Inventory System

Beyond `picks.json` (which powers the site), each store has its own inventory file in `data/inventory/`:

```
data/inventory/
├── end-clothing.json        # All END. products
├── foot-locker.json         # All Foot Locker products
└── sneakersnstuff.json      # All SNS products
```

Each file tracks store metadata, product count, and full product objects with `addedDate`, `lastChecked`, and `status` fields. The `catalog-index.json` is rebuilt from these files by `scripts/build-index.js`.

---

## 🔥 Image Pipeline

Product images are fetched via a **5-source fallback system** in `scripts/fetch-images.js`:

| Priority | Source | Method |
|----------|--------|--------|
| **A** | sneaks-api | StockX/GOAT search by style code |
| **B** | Playwright | Opens product page, extracts image from DOM |
| **C** | Google Images | Playwright searches Google Images |
| **D** | Screenshot | Playwright screenshots the product image element |
| **E** | fallback-images.json | Manually provided backup URLs |

Images upload to **Cloudinary** (if `.env` is configured) or save locally to `images/picks/`. Once a Cloudinary URL is in `picks.json` and pushed, the image is permanent.

```bash
# Fetch images for picks missing them
node scripts/fetch-images.js --verbose

# Force re-fetch all
node scripts/fetch-images.js --force --verbose
```

---

## 🛠 All Scripts

| Script | Purpose |
|--------|---------|
| `process-queue.js` | Main scraper pipeline — scrapes URLs from queue, normalizes sizes, saves to picks + inventory |
| `fetch-images.js` | 5-source image fetcher with Cloudinary upload |
| `build-index.js` | Rebuilds `catalog-index.json` from inventory files |
| `add-pick.js` | Manual product entry helper |
| `fix-sizes.js` | Re-scrapes sizes for picks that have none |
| `normalize-sizes.js` | One-time bulk size normalizer (all sizes → EU) |
| `validate-picks.js` | Validates `picks.json` structure |
| `setup-cloudinary.js` | Cloudinary setup helper |
| `debug-scrape.js` | Debug/test scraper on a single URL |

---

## ↗️ Redirect Loading Screen

When users click **Shop Now** on a product card or a store card:

1. Dark screen takes over with the FASHION. logo
2. Purple spinner animates
3. Shows "Redirecting you to" → **Store Name** → `domain.com`
4. Progress bar fills with purple shimmer (~2.5 seconds)
5. External site opens in a new tab
6. Screen fades out back to FASHION.

---

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/ojayWillow/Fashion.git
cd Fashion

# 2. Install dependencies
npm install

# 3. Set up environment (optional — for Cloudinary image hosting)
cp .env.example .env
# Edit .env with your Cloudinary credentials

# 4. Add products: paste URLs into data/queue.txt, then:
node scripts/process-queue.js

# 5. Fetch images (if needed)
node scripts/fetch-images.js --verbose

# 6. Commit and push
git add -A
git commit -m "Add new picks"
git push

# 7. Launch locally
npx live-server --port=3000
```

Open `http://127.0.0.1:3000` → Main landing page
Open `http://127.0.0.1:3000/sales.html` → Weekly picks

---

## 📜 License

© 2026 FASHION. Built for the culture.
