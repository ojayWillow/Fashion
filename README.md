# FASHION. — Luxury Streetwear & Sneakers Hub

> **The definitive weekly guide to high-end streetwear sales, luxury sneaker drops, and premium fashion promotions.**

![Theme: Purple/Black](https://img.shields.io/badge/Theme-Purple%20%2F%20Black-7c3aed?style=flat-square)
![Status: Live](https://img.shields.io/badge/Status-Live-a855f7?style=flat-square)
![Updated: Weekly](https://img.shields.io/badge/Updated-Weekly-6d28d9?style=flat-square)

---

## ✦ What is FASHION.?

FASHION. is a curated advertising & sales hub for **high-end streetwear and luxury sneakers**. It showcases handpicked deals from Europe's top fashion retailers — complete with product images, pricing, discount percentages, and direct buy links.

### Core Features

- **Weekly Picks Grid** — 10 curated products from END. Clothing and other premium stores, loaded dynamically from `picks.json`
- **Horizontal Ad Banners** — Interactive promotional banners for stores like Nike, END., SSENSE, StockX, Farfetch, Zalando, and ASOS
- **Following Pointer Effects** — Cursor-tracking glow effects on banner hover, inspired by [Aceternity UI](https://ui.aceternity.com/components/following-pointer)
- **Brand Directory** — Organized by category: Sneaker Specialists, Streetwear & Hype, Luxury & Designer, and Multi-Brand Retailers
- **Automated Image Pipeline** — Bulletproof 5-source system that guarantees product images for every item
- **Redirect Loading Screen** — Full-screen transition when users click "Shop Now", informing them they're leaving FASHION. before opening the external store

---

## 🎨 Design: Hybrid Theme

The site uses a **hybrid dark/light design**:

- **Dark sections** — Hero, header, navigation, and footer use the signature dark purple/black theme for brand identity
- **Light sections** — Product grid and store cards use clean white backgrounds (`#f8f8fa` / `#ffffff`) so product images blend naturally without looking boxed in
- **Purple accents** — Buttons, tags, brand labels, hover effects, and the redirect screen all use the purple gradient

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
├── index.html                 # Main landing page — hero, banners, brand directory
├── sales.html                 # Weekly picks / sales page — renders products from picks.json
├── styles.css                 # Main page styles — dark purple/black theme
├── sales.css                  # Sales page styles — hybrid dark hero + white product grid
├── script.js                  # Main page JS — cursor effects, scroll reveal, banner trails
├── sales.js                   # Sales page JS — loads picks.json, renders cards, redirect screen
│
├── data/
│   ├── picks.json             # Product data — names, prices, images (Cloudinary URLs), sizes, store URLs
│   ├── fallback-images.json   # Manual backup image URLs (Source E)
│   └── image-report.json      # Last run report from the image fetcher
│
├── scripts/
│   └── fetch-images.js        # Bulletproof 5-source image fetcher (Node.js)
│
├── images/
│   └── picks/                 # Locally saved product images (when not using Cloudinary)
│
├── european_fashion_stores.csv # Research data — 50+ European fashion retailers
├── european_fashion_stores.md  # Store directory in Markdown format
│
├── .env.example               # Environment variable template (Cloudinary config)
├── .gitignore
├── package.json
└── README.md
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
  "image": "https://res.cloudinary.com/...",
  "url": "https://www.endclothing.com/...",
  "description": "...",
  "tags": ["Sneakers", "Jordan", "Sale"],
  "sizes": ["EU 36", "EU 37.5", "..."]
}
```

The `sales.js` script reads this file and renders interactive product cards on `sales.html`.

**Important:** Once images are fetched and `picks.json` is pushed to GitHub with Cloudinary URLs, the images are **permanent**. No need to re-fetch unless you add new products.

---

## 🔥 Image Pipeline: How It Works

Product images are the backbone of this project. Nike/Jordan CDN URLs expire and get blocked, so we built a **5-source fallback system** that guarantees images no matter what.

The script `scripts/fetch-images.js` tries each source in order — first success wins:

| Priority | Source | What It Does | Covers |
|----------|--------|--------------|--------|
| **A** | `sneaks-api` | Searches StockX/GOAT by style code, returns CDN image URLs | Sneakers |
| **B** | Playwright browser | Opens END. product page as real Chrome, extracts image URL from rendered DOM | Everything |
| **C** | Google Images | Playwright opens Google Images, searches by product name + style code | Everything |
| **D** | Playwright screenshot | Opens product page and screenshots the product image element directly | Everything |
| **E** | `fallback-images.json` | Reads manually provided backup URLs | Everything |

### When to Run the Image Fetcher

- **YES** — When you add a **new product** to `picks.json`
- **YES** — When you **replace** a product with a different one
- **NO** — When editing CSS, HTML, JS, prices, sizes, or descriptions
- **NO** — When making visual/layout changes

Once a product has its Cloudinary URL in `picks.json` and that's pushed to GitHub, the image is there forever.

### Running the Image Fetcher

```bash
# Fetch images for any new products
node scripts/fetch-images.js --verbose

# Force re-fetch everything
node scripts/fetch-images.js --force --verbose

# IMPORTANT: After fetching, commit and push the updated picks.json
git add data/picks.json
git commit -m "data: update picks.json with Cloudinary image URLs"
git push
```

Images are uploaded to **Cloudinary** (if configured in `.env`) or saved locally to `images/picks/`.

---

## ↗️ Redirect Loading Screen

When users click **Shop Now** on a product card or a **store card**, a full-screen transition plays:

1. Dark screen takes over with the FASHION. logo
2. Purple spinner animates
3. Shows "Redirecting you to" → **Store Name** → `domain.com`
4. Progress bar fills with purple shimmer (~2.5 seconds)
5. External site opens in a new tab
6. Screen fades out back to FASHION.

This informs users they're leaving FASHION. and entering a third-party website.

---

## 🚀 Featured Stores

- **Nike** — Air Max, Dunks & Jordan retros
- **END. Clothing** — Off-White, Stone Island, Stüssy
- **SSENSE** — Balenciaga, Rick Owens, Maison Margiela
- **StockX** — Authenticated sneakers below retail
- **Farfetch** — Gucci, Prada, Alexander McQueen
- **Zalando** — 2,000+ brand sneaker clearance
- **ASOS** — 850+ streetwear brands on sale

---

## 🔧 Quick Start

```bash
# 1. Clone
git clone https://github.com/ojayWillow/Fashion.git
cd Fashion

# 2. Install dependencies
npm install

# 3. Set up environment (optional — for Cloudinary image hosting)
cp .env.example .env
# Edit .env with your Cloudinary credentials

# 4. Fetch product images (only needed for new products)
npm install sneaks-api playwright
npx playwright install chromium
node scripts/fetch-images.js --verbose

# 5. Commit the fetched images
git add data/picks.json
git commit -m "data: update picks.json with Cloudinary image URLs"
git push

# 6. Launch
npx live-server --port=3000
```

Open `http://127.0.0.1:3000` → Main landing page
Open `http://127.0.0.1:3000/sales.html` → Weekly picks with product images

---

## 📜 License

© 2026 FASHION. Built for the culture.
