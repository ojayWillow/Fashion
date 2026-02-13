/* ===== FASHION. — Shared Format Module ===== */
/* Price formatting, store name/flag lookups */

// ===== Store Constants =====
const STORE_NAMES = {
  'end-clothing': 'END. Clothing',
  'foot-locker': 'Foot Locker',
  'sns': 'SNS (Sneakersnstuff)',
  'mr-porter': 'MR PORTER'
};

const STORE_FLAGS = {
  'end-clothing': '\u{1F1EC}\u{1F1E7}',  // 🇬🇧
  'foot-locker': '\u{1F1F3}\u{1F1F1}',   // 🇳🇱
  'sns': '\u{1F1F8}\u{1F1EA}',            // 🇸🇪
  'mr-porter': '\u{1F1EC}\u{1F1E7}'       // 🇬🇧
};

const CURRENCY_SYMBOLS = { EUR: '€', GBP: '£', USD: '$' };

// Optional runtime metadata from stores.json (populated by loadStoreMetadata)
let storeMetadata = {};

/**
 * Load store metadata from stores.json for richer display names/flags.
 * Call once at app init if you need names beyond the hardcoded map.
 */
export async function loadStoreMetadata() {
  try {
    const resp = await fetch('data/stores.json');
    const data = await resp.json();
    if (data.categories) {
      for (const cat of data.categories) {
        for (const s of cat.stores) {
          const knownSlugs = {
            'END. Clothing': 'end-clothing',
            'Foot Locker': 'foot-locker',
            'SNS (Sneakersnstuff)': 'sns',
            'MR PORTER': 'mr-porter'
          };
          const slug = knownSlugs[s.name] ||
            s.name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s]+/g, '-').replace(/\.$/, '');
          const domain = s.url ? new URL(s.url).hostname.replace('www.', '') : '';
          storeMetadata[slug] = { name: s.name, flag: s.flag, domain };
        }
      }
    }
  } catch (e) {
    console.warn('Could not load store metadata:', e);
  }
}

/**
 * Format a price object into a display string.
 * @param {{ amount: number, currency: string }} priceObj
 * @returns {string} e.g. "€129.99" or ""
 */
export function formatPrice(priceObj) {
  if (!priceObj || !priceObj.amount || priceObj.amount === 0) return '';
  const sym = CURRENCY_SYMBOLS[priceObj.currency] || priceObj.currency + ' ';
  return `${sym}${priceObj.amount}`;
}

/**
 * Convert store slug to display name.
 * @param {string} slug - e.g. "end-clothing"
 * @returns {string} e.g. "END. Clothing"
 */
export function storeDisplayName(slug) {
  if (storeMetadata[slug]) return storeMetadata[slug].name;
  return STORE_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Get flag emoji for a store slug.
 * @param {string} slug
 * @returns {string} Flag emoji or default 🏷️
 */
export function storeFlag(slug) {
  if (storeMetadata[slug]) return storeMetadata[slug].flag || '\u{1F3F7}\u{FE0F}';
  return STORE_FLAGS[slug] || '\u{1F3F7}\u{FE0F}';
}

/**
 * Get the best listing from a product (lowest sale price, preferring available).
 * @param {object} product
 * @returns {object|null}
 */
export function bestListing(product) {
  if (!product.listings || product.listings.length === 0) return null;
  const available = product.listings.filter(l => l.available);
  const pool = available.length > 0 ? available : product.listings;
  return pool.reduce((best, l) =>
    (l.salePrice && l.salePrice.amount > 0 &&
     (!best.salePrice || l.salePrice.amount < best.salePrice.amount)) ? l : best
  );
}

/**
 * Aggregate all sizes across a product's listings.
 * @param {object} product
 * @returns {string[]}
 */
export function allSizes(product) {
  if (!product.listings) return [];
  const s = new Set();
  product.listings.forEach(l => (l.sizes || []).forEach(sz => s.add(sz)));
  return [...s];
}
