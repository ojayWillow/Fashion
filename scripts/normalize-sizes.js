/**
 * normalize-sizes.js
 * Converts all size strings in picks.json to a unified EU format.
 *
 * Store rules:
 *   END. Clothing  → sizes prefixed "EU ..." or "UK ..." or letter sizes (S/M/L)
 *   Foot Locker NL → bare EU numbers (40, 42.5, etc.)
 *   SNS            → bare US numbers (7.5, 8, etc.), kids (2C, 5C), women (W12),
 *                     letter sizes (XS, S, M, L, XL, XXL), waist (W28, W30), one-size (OS)
 */

const fs = require('fs');

/* ── Men's conversion lookup tables (half-size accurate) ────────────── */

const US_M_TO_EU = {
  3.5: 35.5, 4: 36, 4.5: 36.5, 5: 37.5, 5.5: 38,
  6: 38.5, 6.5: 39, 7: 40, 7.5: 40.5, 8: 41,
  8.5: 42, 9: 42.5, 9.5: 43, 10: 44, 10.5: 44.5,
  11: 45, 11.5: 45.5, 12: 46, 12.5: 47, 13: 47.5,
  14: 48.5, 15: 49.5
};

const UK_M_TO_EU = {
  3: 35.5, 3.5: 36, 4: 36.5, 4.5: 37.5, 5: 38,
  5.5: 38.5, 6: 39, 6.5: 40, 7: 40.5, 7.5: 41,
  8: 42, 8.5: 42.5, 9: 43, 9.5: 44, 10: 44.5,
  10.5: 45, 11: 45.5, 11.5: 46, 12: 47, 12.5: 47.5,
  13: 48.5, 14: 49.5
};

/* ── Women's US → EU (shifted ~1.5 from men's) ─────────────────────── */

const US_W_TO_EU = {
  5: 35.5, 5.5: 36, 6: 36.5, 6.5: 37.5, 7: 38,
  7.5: 38.5, 8: 39, 8.5: 40, 9: 40.5, 9.5: 41,
  10: 42, 10.5: 42.5, 11: 43, 11.5: 44, 12: 44.5
};

/* ── Kids' conversion (C = toddler/child, Y = youth) ───────────────── */

const US_KIDS_TO_EU = {
  '1C': 16, '1.5C': 16.5, '2C': 17, '2.5C': 18, '3C': 18.5,
  '3.5C': 19, '4C': 19.5, '4.5C': 20, '5C': 21, '5.5C': 21.5,
  '6C': 22, '6.5C': 22.5, '7C': 23.5, '7.5C': 24, '8C': 25,
  '8.5C': 25.5, '9C': 26, '9.5C': 26.5, '10C': 27, '10.5C': 27.5,
  '11C': 28, '11.5C': 28.5, '12C': 29.5, '12.5C': 30, '13C': 31,
  '13.5C': 31.5,
  '1Y': 32, '1.5Y': 33, '2Y': 33.5, '2.5Y': 34, '3Y': 35,
  '3.5Y': 35.5, '4Y': 36, '4.5Y': 36.5, '5Y': 37.5, '5.5Y': 38,
  '6Y': 38.5, '6.5Y': 39, '7Y': 40
};

const UK_KIDS_TO_EU = {
  '0.5C': 16, '1C': 17, '1.5C': 17.5, '2C': 18, '2.5C': 18.5,
  '2Y': 33.5, '11.5C': 29.5
};

/* ── Clothing/non-numeric: pass through as-is ───────────────────────── */

const PASSTHROUGH = new Set([
  'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'OS', 'ONE SIZE'
]);

/* ── Detect whether a product is women's ────────────────────────────── */

function isWomens(pick) {
  const n = (pick.name || '').toLowerCase();
  return n.includes('wmns') || n.includes("women") || n.includes('wmn');
}

/* ── Detect whether a product is kids' ──────────────────────────────── */

function isKids(pick) {
  const n = (pick.name || '').toLowerCase();
  const tags = (pick.tags || []).map(t => t.toLowerCase());
  return n.includes('(td)') || n.includes('(ps)') || n.includes('(gs)') ||
         n.includes('baby') || n.includes('toddler') || n.includes('kids') ||
         tags.includes('kids');
}

/* ── Store detection ────────────────────────────────────────────────── */

function getStoreSystem(pick) {
  const store = (pick.store || '').toLowerCase();
  if (store.includes('end'))        return 'END';     // UK or EU prefix
  if (store.includes('foot locker')) return 'FL';      // bare EU
  if (store.includes('sns') || store.includes('sneakersnstuff')) return 'SNS'; // bare US
  return 'UNKNOWN';
}

/* ── Core normalizer: returns { eu, uk, us, display, original } ─────── */

function normalizeSize(raw, pick) {
  const original = raw;
  const s = raw.trim();
  const upper = s.toUpperCase();

  // Pass-through: letter sizes, one-size, waist sizes
  if (PASSTHROUGH.has(upper)) {
    return { display: s, original, system: 'letter' };
  }
  if (/^W\d+/i.test(s)) {
    return { display: s, original, system: 'waist' };
  }

  const storeSystem = getStoreSystem(pick);
  const kids = isKids(pick);
  const womens = isWomens(pick);

  // Kids sizes with C/Y suffix (SNS, END)
  const kidsMatch = s.match(/^(\d+\.?\d*)(C|Y)$/i);
  if (kidsMatch) {
    const key = kidsMatch[1] + kidsMatch[2].toUpperCase();
    const eu = US_KIDS_TO_EU[key];
    if (eu) return { eu, display: 'EU ' + eu, original, system: 'kids-us' };
    // Try UK kids
    const euUk = UK_KIDS_TO_EU[key];
    if (euUk) return { eu: euUk, display: 'EU ' + euUk, original, system: 'kids-uk' };
    return { display: s, original, system: 'kids-unknown' };
  }

  // END with "EU XX" prefix → already EU
  const euMatch = s.match(/^EU\s+(\d+\.?\d*)$/i);
  if (euMatch) {
    const eu = parseFloat(euMatch[1]);
    return { eu, display: 'EU ' + eu, original, system: 'eu' };
  }

  // END with "UK XX" prefix → convert UK→EU
  const ukMatch = s.match(/^UK\s+(\d+\.?\d*)(C|Y)?$/i);
  if (ukMatch) {
    const num = parseFloat(ukMatch[1]);
    const suffix = ukMatch[2] ? ukMatch[2].toUpperCase() : '';
    if (suffix) {
      const key = ukMatch[1] + suffix;
      const eu = UK_KIDS_TO_EU[key] || US_KIDS_TO_EU[key];
      if (eu) return { eu, display: 'EU ' + eu, original, system: 'kids-uk' };
      return { display: s, original, system: 'kids-uk-unknown' };
    }
    const eu = UK_M_TO_EU[num];
    if (eu) return { eu, display: 'EU ' + eu, original, system: 'uk' };
    // Fallback formula
    const approx = Math.round((num + 33.5) * 2) / 2;
    return { eu: approx, display: 'EU ' + approx, original, system: 'uk-approx' };
  }

  // Bare number
  const num = parseFloat(s);
  if (!isNaN(num)) {
    // Foot Locker → already EU (numbers 35–50 range)
    if (storeSystem === 'FL') {
      return { eu: num, display: 'EU ' + num, original, system: 'eu' };
    }

    // SNS → US sizes
    if (storeSystem === 'SNS') {
      if (womens) {
        const eu = US_W_TO_EU[num];
        if (eu) return { eu, display: 'EU ' + eu, original, system: 'us-w' };
        // Fallback
        const approx = Math.round((num + 31) * 2) / 2;
        return { eu: approx, display: 'EU ' + approx, original, system: 'us-w-approx' };
      }
      if (kids) {
        // Bare number for kids without C/Y — assume youth US
        const key = num + 'Y';
        const eu = US_KIDS_TO_EU[key];
        if (eu) return { eu, display: 'EU ' + eu, original, system: 'kids-us' };
      }
      // Men's US
      const eu = US_M_TO_EU[num];
      if (eu) return { eu, display: 'EU ' + eu, original, system: 'us' };
      // Fallback formula
      const approx = Math.round((num + 33) * 2) / 2;
      return { eu: approx, display: 'EU ' + approx, original, system: 'us-approx' };
    }

    // END bare number (uncommon but possible) — assume EU if ≥ 35
    if (num >= 35) {
      return { eu: num, display: 'EU ' + num, original, system: 'eu' };
    }
  }

  // Unrecognized — keep as-is
  return { display: s, original, system: 'unknown' };
}

/* ── Main ───────────────────────────────────────────────────────────── */

function main() {
  const data = JSON.parse(fs.readFileSync('data/picks.json', 'utf-8'));
  let converted = 0;
  let kept = 0;

  for (const pick of data.picks) {
    if (!pick.sizes || pick.sizes.length === 0) continue;

    const newSizes = [];
    for (const raw of pick.sizes) {
      const result = normalizeSize(raw, pick);
      newSizes.push(result.display);
      if (result.display !== raw) converted++;
      else kept++;
    }
    pick.sizes = newSizes;
  }

  fs.writeFileSync('data/picks.json', JSON.stringify(data, null, 2) + '\n');
  console.log(`Done! ${converted} sizes converted, ${kept} kept as-is.`);
  console.log('Saved data/picks.json');
}

main();
