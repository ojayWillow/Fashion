/**
 * FASHION. — Helpers
 * ===================
 * Shared utilities: brand detection, size normalization,
 * price parsing, slugs, domain extraction.
 */

let _verbose = false;

function setVerbose(v) { _verbose = v; }
function log(msg) { if (_verbose) console.log(`    [v] ${msg}`); }

// ===== DOMAIN & SLUG =====

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return ''; }
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

function storeSlug(name) {
  return name.toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ===== PRICE =====

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.toString().replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function detectCurrency(domain) {
  if (domain.endsWith('.co.uk') || domain.endsWith('.uk')) return 'GBP';
  if (domain.endsWith('.com') && !domain.includes('.co')) return 'USD';
  return 'EUR';
}

function buildPrice(amount, currency) {
  if (!amount) return null;
  return { amount: Math.round(amount * 100) / 100, currency };
}

function calcDiscount(retail, sale) {
  if (!retail || !sale || retail <= sale) return 0;
  return Math.round((1 - sale / retail) * 100);
}

// ===== BRAND DETECTION =====

const BRAND_MAP = [
  { keywords: ['jordan', 'air jordan'], brand: 'Jordan' },
  { keywords: ['nike', 'air max', 'air force', 'dunk', 'blazer', 'vapormax', 'air tn'], brand: 'Nike' },
  { keywords: ['adidas', 'yeezy', 'ultraboost', 'nmd', 'stan smith', 'superstar', 'samba', 'gazelle'], brand: 'adidas' },
  { keywords: ['new balance', 'nb ', '990', '991', '992', '993', '550', '2002r', '1906r', '1906', '9060'], brand: 'New Balance' },
  { keywords: ['asics', 'gel-', 'gel lyte'], brand: 'ASICS' },
  { keywords: ['puma', 'suede', 'rs-x', 'speedcat'], brand: 'Puma' },
  { keywords: ['converse', 'chuck taylor'], brand: 'Converse' },
  { keywords: ['vans', 'old skool'], brand: 'Vans' },
  { keywords: ['reebok', 'club c'], brand: 'Reebok' },
  { keywords: ['salomon', 'xt-6', 'xt-4', 'speedcross'], brand: 'Salomon' },
  { keywords: ['on running', 'on cloud', 'cloudmonster', 'cloudsurfer', 'cloudboom'], brand: 'On' },
  { keywords: ['hoka', 'bondi', 'clifton'], brand: 'HOKA' },
  { keywords: ['timberland'], brand: 'Timberland' },
  { keywords: ['dr. martens', 'dr martens'], brand: 'Dr. Martens' },
  { keywords: ['north face'], brand: 'The North Face' },
  { keywords: ['carhartt'], brand: 'Carhartt WIP' },
  { keywords: ['stussy', 'stüssy'], brand: 'Stüssy' },
  { keywords: ['stone island'], brand: 'Stone Island' },
  { keywords: ['c.p. company', 'cp company'], brand: 'C.P. Company' },
  { keywords: ['moncler'], brand: 'Moncler' },
  { keywords: ['off-white', 'off white'], brand: 'Off-White' },
  { keywords: ['fear of god', 'essentials'], brand: 'Fear of God' },
  { keywords: ['arc\'teryx', 'arcteryx'], brand: 'Arc\'teryx' },
];

function detectBrand(name) {
  const lower = (name || '').toLowerCase();
  // Jordan check first (before Nike catches 'air')
  if (lower.includes('jordan') && (lower.includes('air jordan') || lower.includes('jordan '))) return 'Jordan';
  for (const entry of BRAND_MAP) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) return entry.brand;
    }
  }
  return '';
}

// ===== CATEGORY DETECTION =====

function detectCategory(name, tags) {
  const lower = (name || '').toLowerCase();
  const tagsLower = (tags || []).map(t => t.toLowerCase());

  if (['jacket', 'coat', 'parka', 'waxed'].some(w => lower.includes(w))) return 'Clothing';
  if (['hoodie', 'sweatshirt', 'pullover'].some(w => lower.includes(w))) return 'Clothing';
  if (['shirt', 't-shirt', 'pants', 'trousers', 'shorts', 'jogger', 'sweater', 'fleece'].some(w => lower.includes(w))) return 'Clothing';
  if (['boot', '6 inch'].some(w => lower.includes(w))) return 'Footwear';
  if (['bag', 'hat', 'cap', 'belt', 'wallet', 'scarf', 'glove'].some(w => lower.includes(w))) return 'Accessories';

  // Default to Sneakers for shoes
  return 'Sneakers';
}

// ===== TAGS =====

function detectTags(name, brand) {
  const tags = [];
  if (brand) tags.push(brand);
  const lower = (name || '').toLowerCase();
  const sneakerWords = ['shoe', 'sneaker', 'trainer', 'runner', 'air max', 'dunk', 'retro', 'air force'];
  const clothingWords = ['hoodie', 'jacket', 'shirt', 'pants', 'shorts', 'coat'];
  if (sneakerWords.some(w => lower.includes(w))) tags.push('Sneakers');
  else if (clothingWords.some(w => lower.includes(w))) tags.push('Clothing');
  tags.push('Sale');
  return [...new Set(tags)];
}

// ===== SIZE NORMALIZATION =====

const US_M_TO_EU = {
  3.5:35.5, 4:36, 4.5:36.5, 5:37.5, 5.5:38, 6:38.5, 6.5:39, 7:40,
  7.5:40.5, 8:41, 8.5:42, 9:42.5, 9.5:43, 10:44, 10.5:44.5, 11:45,
  11.5:45.5, 12:46, 12.5:47, 13:47.5, 14:48.5, 15:49.5,
};

const UK_M_TO_EU = {
  3:35.5, 3.5:36, 4:36.5, 4.5:37.5, 5:38, 5.5:38.5, 6:39, 6.5:40,
  7:40.5, 7.5:41, 8:42, 8.5:42.5, 9:43, 9.5:44, 10:44.5, 10.5:45,
  11:45.5, 11.5:46, 12:47, 12.5:47.5, 13:48.5, 14:49.5,
};

const LETTER_SIZES = new Set(['XXS','XS','S','M','L','XL','XXL','2XL','3XL','XXXL','OS']);

function normalizeSize(raw, storeName, productName) {
  const s = raw.trim();
  const upper = s.toUpperCase();

  // Pass-through letter sizes
  if (LETTER_SIZES.has(upper)) return s;

  // Waist sizes
  if (/^W\d+/i.test(s)) return s;

  // Already EU
  const euMatch = s.match(/^EU\s+(\d+\.?\d*)$/i);
  if (euMatch) return 'EU ' + parseFloat(euMatch[1]);

  // US prefix
  const usMatch = s.match(/^US\s+(\d+\.?\d*)$/i);
  if (usMatch) {
    const num = parseFloat(usMatch[1]);
    const eu = US_M_TO_EU[num];
    return eu ? 'EU ' + eu : 'EU ' + (Math.round((num + 33) * 2) / 2);
  }

  // UK prefix
  const ukMatch = s.match(/^UK\s+(\d+\.?\d*)$/i);
  if (ukMatch) {
    const num = parseFloat(ukMatch[1]);
    const eu = UK_M_TO_EU[num];
    return eu ? 'EU ' + eu : 'EU ' + (Math.round((num + 33.5) * 2) / 2);
  }

  // Bare number — decide based on store
  const num = parseFloat(s);
  if (!isNaN(num)) {
    const store = (storeName || '').toLowerCase();
    // Foot Locker uses EU, SNS uses US
    if (store.includes('foot locker') || num >= 35) return 'EU ' + num;
    if (store.includes('sns') || store.includes('sneakersnstuff')) {
      const eu = US_M_TO_EU[num];
      return eu ? 'EU ' + eu : 'EU ' + (Math.round((num + 33) * 2) / 2);
    }
    // Default: if >= 35 assume EU, otherwise US
    if (num >= 35) return 'EU ' + num;
    const eu = US_M_TO_EU[num];
    return eu ? 'EU ' + eu : s;
  }

  return s;
}

function normalizeSizes(sizes, storeName, productName) {
  return (sizes || []).map(s => normalizeSize(s, storeName, productName));
}

// ===== SIZE VALIDATION =====

function isValidSize(text) {
  if (!text || text.length > 15) return false;
  const t = text.trim();
  if (/^(EU\s?)?\d{2}(\.5)?$/i.test(t)) return true;
  if (/^(US|UK)?\s?\d{1,2}(\.5)?$/i.test(t)) return true;
  if (/^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|XXXL)$/i.test(t)) return true;
  if (/^W\d{2,3}$/i.test(t)) return true;
  if (/^OS$/i.test(t)) return true;
  return false;
}

module.exports = {
  setVerbose, log,
  extractDomain, slugify, storeSlug,
  parsePrice, detectCurrency, buildPrice, calcDiscount,
  detectBrand, detectCategory, detectTags,
  normalizeSize, normalizeSizes, isValidSize,
};
