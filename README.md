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

---

## 🏗 Project Structure

```
Fashion/
├── index.html                 # Main landing page — hero, banners, brand directory
├── sales.html                 # Weekly picks / sales page — renders products from picks.json
├── styles.css                 # Main page styles — purple/black luxury theme
├── sales.css                  # Sales page styles — product grid, cards, modals
├── script.js                  # Main page JS — cursor effects, scroll reveal, banner trails
├── sales.js                   # Sales page JS — loads picks.json, renders product cards
│
├── data/
│   ├── picks.json             # Product data — names, prices, images, sizes, URLs
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

### Why This Works

- **Source A** is fast — no browser needed, just an API call
- **Sources B, C, D** use Playwright (a real Chromium browser) — **no site can block it** because it's indistinguishable from a human opening Chrome
- **Source D** is the nuclear option — even if we can't extract a URL, we literally screenshot the image off the page
- **Source E** is the manual safety net — if all else fails, paste a URL into `fallback-images.json`

### Running the Image Fetcher

```bash
# First time setup
npm install
npm install sneaks-api playwright
npx playwright install chromium

# Fetch all images
node scripts/fetch-images.js --verbose

# Force re-fetch even if images already exist
node scripts/fetch-images.js --force --verbose
```

Images are uploaded to **Cloudinary** (if configured in `.env`) or saved locally to `images/picks/`.

---

## 🎨 Design System

| Element | Value |
|---------|-------|
| **Primary Colors** | `#a855f7` (Purple), `#0a0a0f` (Black) |
| **Accent Gradient** | `135deg, #a855f7 → #7c3aed → #6d28d9` |
| **Heading Font** | Outfit (900 weight, uppercase) |
| **Body Font** | Space Grotesk |
| **Border Radius** | 16px |
| **Effects** | Glow shadows, gradient text, floating animations, pointer trails |

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

# 4. Fetch product images
npm install sneaks-api playwright
npx playwright install chromium
node scripts/fetch-images.js --verbose

# 5. Launch
npx live-server --port=3000
```

Open `http://127.0.0.1:3000` → Main landing page
Open `http://127.0.0.1:3000/sales.html` → Weekly picks with product images

---

## 📜 License

© 2026 FASHION. Built for the culture.
