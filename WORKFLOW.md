# FASHION. — Workflow Guide

> **Your day-to-day operations manual for managing the FASHION. inventory.**

---

## 📦 Adding Products

### Method 1: Queue (Multiple Products)

1. Paste product URLs into `data/queue.txt` (one per line)
2. Run the scraper:
   ```bash
   node scripts/process-queue.js --verbose
   ```
3. Rebuild the catalog index:
   ```bash
   node scripts/build-index.js
   ```
4. Push to GitHub:
   ```bash
   git add .
   git commit -m "inventory: add new products"
   git push
   ```

### Method 2: Single Product

```bash
node scripts/add-pick.js "https://www.endclothing.com/gb/product-url.html"
```

---

## 🗂️ Data Structure

### Where Products Live

| File | Purpose |
|------|---------|
| `data/picks.json` | Featured "Weekly Picks" shown on sales.html hero section |
| `data/inventory/end-clothing.json` | All END. Clothing products |
| `data/inventory/foot-locker.json` | All Foot Locker products |
| `data/inventory/{store-slug}.json` | New stores get their own file automatically |
| `data/catalog-index.json` | Auto-generated master index (counts, categories, brands) |

### How Store Files Are Named

The store name is converted to a slug:
- `END. Clothing` → `end-clothing.json`
- `Foot Locker` → `foot-locker.json`
- `Nike` → `nike.json`
- `SSENSE` → `ssense.json`

---

## 🔄 Rebuilding the Index

After any inventory change, rebuild the catalog index:

```bash
node scripts/build-index.js --verbose
```

This scans all files in `data/inventory/` and generates `data/catalog-index.json` with:
- Total product count
- Per-store product counts
- Category breakdown (sneakers, hoodies, jackets, etc.)
- Brand breakdown (Jordan, Nike, New Balance, etc.)

---

## 🖼️ Images

### When to Fetch Images

- **YES** — After adding new products
- **YES** — After replacing a product
- **NO** — After editing prices, sizes, descriptions, CSS, or HTML

### How to Fetch

```bash
# Fetch images for products missing them
node scripts/fetch-images.js --verbose

# Force re-fetch everything
node scripts/fetch-images.js --force --verbose
```

Images are uploaded to Cloudinary and stored as permanent URLs in the product data. Once pushed, they're there forever.

---

## ✅ Validating Data

```bash
# Check for missing fields, broken images, dead links
node scripts/validate-picks.js
```

---

## 📊 Checking Inventory

Open `data/catalog-index.json` to see:
- How many products total
- How many per store
- Category distribution
- Brand distribution

Or run the build script with verbose output:
```bash
node scripts/build-index.js --verbose
```

---

## 🏗️ Full Pipeline (End to End)

```
1. Find products on store websites
2. Paste URLs into data/queue.txt
3. node scripts/process-queue.js --verbose    → Scrapes & saves to inventory + picks.json
4. node scripts/fetch-images.js --verbose     → Gets images → Cloudinary
5. node scripts/build-index.js                → Rebuilds catalog index
6. git add . && git commit -m "..." && git push  → Live
```

---

## 🚨 Troubleshooting

| Problem | Solution |
|---------|----------|
| Scraping fails | Run `node scripts/debug-scrape.js <url>` to diagnose |
| Images not loading | Check Cloudinary dashboard, or run `fetch-images.js --force` |
| Duplicate product added | The scraper has built-in duplicate detection by URL and SKU |
| Queue stuck | Check `data/queue.txt` for malformed URLs |
| Index out of date | Run `node scripts/build-index.js` |

---

## 📁 File Reference

| Script | What It Does |
|--------|--------------|
| `scripts/process-queue.js` | Scrapes URLs from queue, saves products |
| `scripts/add-pick.js` | Add a single product by URL |
| `scripts/fetch-images.js` | 5-source image pipeline → Cloudinary |
| `scripts/build-index.js` | Generates catalog-index.json from inventory |
| `scripts/validate-picks.js` | Checks data quality |
| `scripts/debug-scrape.js` | Debug scraping for a single URL |
| `scripts/setup-cloudinary.js` | Configure Cloudinary credentials |

---

© 2026 FASHION. Built for the culture.
