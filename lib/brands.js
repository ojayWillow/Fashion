/**
 * FASHION. — Brand Detection & Tag Generation
 * ==============================================
 * Single source of truth for brand keyword matching and auto-tagging.
 */

const BRAND_MAP = [
  { keywords: ['jordan', 'air jordan'], brand: 'Jordan' },
  { keywords: ['nike', 'air max', 'air force', 'dunk', 'blazer', 'vapormax', 'air tn'], brand: 'Nike' },
  { keywords: ['adidas', 'yeezy', 'ultraboost', 'nmd', 'stan smith', 'superstar', 'samba', 'gazelle'], brand: 'adidas' },
  { keywords: ['new balance', 'nb ', '990', '991', '992', '993', '550', '2002r', '1906r', '9060', '1906'], brand: 'New Balance' },
  { keywords: ['asics', 'gel-', 'gel lyte'], brand: 'ASICS' },
  { keywords: ['puma', 'suede', 'rs-x'], brand: 'Puma' },
  { keywords: ['converse', 'chuck taylor', 'all star'], brand: 'Converse' },
  { keywords: ['vans', 'old skool', 'sk8'], brand: 'Vans' },
  { keywords: ['reebok', 'club c', 'classic leather'], brand: 'Reebok' },
  { keywords: ['salomon', 'xt-6', 'xt-4', 'speedcross'], brand: 'Salomon' },
  { keywords: ['on running', 'on cloud', 'cloudmonster'], brand: 'On' },
  { keywords: ['hoka', 'bondi', 'clifton', 'speedgoat'], brand: 'HOKA' },
  { keywords: ['timberland'], brand: 'Timberland' },
  { keywords: ['dr. martens', 'dr martens'], brand: 'Dr. Martens' },
  { keywords: ['ugg'], brand: 'UGG' },
  { keywords: ['north face', 'tnf'], brand: 'The North Face' },
  { keywords: ['carhartt'], brand: 'Carhartt WIP' },
  { keywords: ['stussy', 'stüssy'], brand: 'Stüssy' },
  { keywords: ['ralph lauren', 'polo ralph'], brand: 'Ralph Lauren' },
  { keywords: ['tommy hilfiger'], brand: 'Tommy Hilfiger' },
  { keywords: ['calvin klein'], brand: 'Calvin Klein' },
  { keywords: ['hugo boss', 'boss '], brand: 'Hugo Boss' },
  { keywords: ['lacoste'], brand: 'Lacoste' },
  { keywords: ['moncler'], brand: 'Moncler' },
  { keywords: ['stone island'], brand: 'Stone Island' },
  { keywords: ['c.p. company', 'cp company'], brand: 'C.P. Company' },
  { keywords: ['maison margiela', 'margiela'], brand: 'Maison Margiela' },
  { keywords: ['balenciaga'], brand: 'Balenciaga' },
  { keywords: ['gucci'], brand: 'Gucci' },
  { keywords: ['prada'], brand: 'Prada' },
  { keywords: ['versace'], brand: 'Versace' },
  { keywords: ['alexander mcqueen', 'mcqueen'], brand: 'Alexander McQueen' },
  { keywords: ['rick owens'], brand: 'Rick Owens' },
  { keywords: ['fear of god', 'essentials'], brand: 'Fear of God' },
  { keywords: ['off-white', 'off white'], brand: 'Off-White' },
  { keywords: ['palm angels'], brand: 'Palm Angels' },
  { keywords: ['acne studios'], brand: 'Acne Studios' },
  { keywords: ['our legacy'], brand: 'Our Legacy' },
  { keywords: ["arc'teryx", 'arcteryx'], brand: "Arc'teryx" },
  { keywords: ['patagonia'], brand: 'Patagonia' },
];

const SNEAKER_WORDS = [
  'shoe', 'sneaker', 'trainer', 'schoen', 'chaussure', 'runner',
  'air max', 'air jordan', 'jordan ', 'dunk', 'yeezy',
  '990', '991', '992', '993', '550', '2002r', '1906r', '1906',
  'ultraboost', 'nmd', 'gel-', 'old skool', 'samba', 'gazelle', 'air tn',
];

const CLOTHING_WORDS = [
  'hoodie', 'jacket', 'shirt', 't-shirt', 'tee', 'pants', 'trousers',
  'shorts', 'jogger', 'sweatshirt', 'coat', 'vest', 'pullover', 'fleece',
  'sweater', 'cardigan', 'blazer', 'parka', 'windbreaker',
];

const ACCESSORY_WORDS = [
  'hat', 'cap', 'bag', 'backpack', 'wallet', 'belt', 'watch',
  'sunglasses', 'scarf', 'gloves', 'socks', 'beanie',
];

/**
 * Detect brand from product name.
 * @param {string} name - Product name
 * @returns {string} Brand name or empty string
 */
function detectBrand(name) {
  if (!name) return '';
  const lower = name.toLowerCase();

  // Jordan before Nike (more specific)
  if (lower.includes('jordan') && (lower.includes('air jordan') || lower.includes('jordan '))) {
    return 'Jordan';
  }

  for (const entry of BRAND_MAP) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) return entry.brand;
    }
  }
  return '';
}

/**
 * Auto-generate tags from product name, brand, and category.
 * @param {string} name - Product name
 * @param {string} brand - Detected brand
 * @param {string} [category] - Store category (optional)
 * @returns {string[]} Array of tag strings
 */
function detectTags(name, brand, category) {
  const tags = [];
  if (!name) return ['Sale'];
  const lower = name.toLowerCase();

  // Type detection
  if (SNEAKER_WORDS.some(w => lower.includes(w))) {
    tags.push('Sneakers');
  } else if (CLOTHING_WORDS.some(w => lower.includes(w))) {
    const match = CLOTHING_WORDS.find(w => lower.includes(w));
    tags.push(match.charAt(0).toUpperCase() + match.slice(1));
  } else if (ACCESSORY_WORDS.some(w => lower.includes(w))) {
    const match = ACCESSORY_WORDS.find(w => lower.includes(w));
    tags.push(match.charAt(0).toUpperCase() + match.slice(1));
  }

  if (brand) tags.push(brand);
  tags.push('Sale');

  return [...new Set(tags)];
}

module.exports = { detectBrand, detectTags, BRAND_MAP };
