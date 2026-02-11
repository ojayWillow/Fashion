/**
 * FASHION. — Category & Subcategory Detection
 * ===============================================
 * Auto-classifies products into category, subcategory, and gender.
 * Used by scraper pipeline to enrich picks with filterable metadata.
 */

// =====================================================================
// CATEGORIES
// =====================================================================
const CATEGORY_MAP = {
  Sneakers: [
    'sneaker', 'shoe', 'trainer', 'runner', 'schoen', 'chaussure',
    'air max', 'air jordan', 'jordan ', 'dunk', 'yeezy', 'ultraboost',
    'nmd', 'gel-', 'old skool', 'samba', 'gazelle', 'air force',
    '990', '991', '992', '993', '550', '2002r', '1906r', '1906',
    'speedcross', 'xt-6', 'xt-4', 'cloud', 'bondi', 'clifton',
    'superstar', 'stan smith', 'classic leather', 'club c',
    'sk8-hi', 'sk8-low', 'air tn', 'vapormax', 'spizike', 'retro',
    'low top', 'high top', 'mid top', 'slide', 'mule',
  ],
  Boots: [
    'boot', 'boots', '6 inch', '6-inch', 'timberland',
    'chelsea boot', 'hiking boot', 'winter boot', 'laarzen', 'laars',
    'dr. martens', 'dr martens',
  ],
  Clothing: [
    'hoodie', 'jacket', 'shirt', 't-shirt', 'tee', 'pants', 'trousers',
    'shorts', 'jogger', 'sweatshirt', 'coat', 'vest', 'pullover',
    'fleece', 'sweater', 'cardigan', 'blazer', 'parka', 'windbreaker',
    'tracksuit', 'track pant', 'track jacket', 'jersey', 'polo',
    'crewneck', 'crew neck', 'tank top', 'dress', 'skirt', 'jeans',
    'denim', 'chino', 'cargo', 'overshirt', 'flannel',
    'waxed jacket', 'down jacket', 'puffer',
  ],
  Accessories: [
    'hat', 'cap', 'bag', 'backpack', 'wallet', 'belt', 'watch',
    'sunglasses', 'scarf', 'gloves', 'socks', 'beanie',
    'keychain', 'lanyard', 'phone case', 'headband', 'wristband',
    'duffle', 'tote', 'crossbody', 'fanny pack', 'bum bag',
  ],
};

// =====================================================================
// SUBCATEGORIES (mainly for sneakers, but works for clothing too)
// =====================================================================
const SUBCATEGORY_MAP = {
  // Sneaker subcategories
  Basketball: [
    'basketball', 'jordan', 'air jordan', 'spizike', 'mb.04', 'mb.03',
    'mb.02', 'mb.01', 'lamelo', 'lebron', 'kobe', 'kd ', 'kyrie',
    'giannis', 'luka', 'ja morant', 'curry', 'harden', 'dame',
    'basketball shoe', 'court', 'hoops',
  ],
  Running: [
    'running', 'run ', 'runner', 'marathon', 'ultraboost', 'pegasus',
    'vaporfly', 'invincible', 'react', 'zoom fly', 'gel-kayano',
    'gel-nimbus', 'gel-cumulus', 'gel-quantum', 'bondi', 'clifton',
    'speedgoat', 'cloudmonster', 'cloudrunner', 'fresh foam',
    'fuelcell', '1080', 'rnnr',
  ],
  Lifestyle: [
    'lifestyle', 'casual', 'retro', 'classic', 'heritage',
    'air max', 'air force', 'dunk low', 'dunk high', 'blazer',
    'samba', 'gazelle', 'superstar', 'stan smith', 'old skool',
    'classic leather', 'club c', 'suede', '550', '2002r', '1906r',
    '1906', '1000', '990', '991', '992', '993', 'vapormax',
    'air tn', 'tl 2.5', 'lafrance',
  ],
  Trail: [
    'trail', 'hiking', 'outdoor', 'speedcross', 'xt-6', 'xt-4',
    'salomon', 'terrex', 'acg', 'all-terrain', 'gore-tex',
  ],
  Skateboarding: [
    'skate', 'sb ', 'skateboard', 'janoski', 'blazer sb',
    'dunk sb', 'half cab', 'slip-on', 'sk8',
  ],
  Training: [
    'training', 'gym', 'cross-training', 'metcon', 'free',
    'nano', 'workout', 'lifting',
  ],
  // Clothing subcategories
  Outerwear: [
    'jacket', 'coat', 'parka', 'windbreaker', 'puffer', 'down',
    'bomber', 'anorak', 'vest', 'gilet', 'waxed',
  ],
  Tops: [
    'hoodie', 'sweatshirt', 'pullover', 'sweater', 'crewneck',
    'fleece', 'cardigan', 'jersey',
  ],
  'T-Shirts': [
    't-shirt', 'tee', 'tank top', 'polo', 'shirt',
  ],
  Bottoms: [
    'pants', 'trousers', 'jogger', 'shorts', 'jeans', 'denim',
    'chino', 'cargo', 'track pant', 'sweatpant', 'short',
  ],
  // Accessory subcategories
  Bags: ['bag', 'backpack', 'duffle', 'tote', 'crossbody', 'fanny pack', 'bum bag'],
  Headwear: ['hat', 'cap', 'beanie', 'headband', 'bucket hat'],
};

// =====================================================================
// GENDER DETECTION
// =====================================================================
const GENDER_KEYWORDS = {
  Men: ['men', "men's", 'mens', 'male', 'him', 'heren', 'homme'],
  Women: ['women', "women's", 'womens', 'female', 'her', 'dames', 'femme', 'wmns', 'w '],
  Kids: ['kids', 'kid', 'junior', 'youth', 'toddler', 'infant', 'baby', 'td', 'gs', 'ps',
         'kinderen', 'enfant', 'little kid', 'big kid', 'grade school'],
  Unisex: ['unisex'],
};

// =====================================================================
// DETECTION FUNCTIONS
// =====================================================================

/**
 * Detect the main product category.
 * @param {string} name - Product name
 * @param {string} [description] - Product description
 * @returns {string} Category: 'Sneakers' | 'Boots' | 'Clothing' | 'Accessories' | 'Other'
 */
function detectCategory(name, description) {
  const text = `${name || ''} ${description || ''}`.toLowerCase();

  // Boots before Sneakers (more specific)
  for (const kw of CATEGORY_MAP.Boots) {
    if (text.includes(kw)) return 'Boots';
  }
  for (const kw of CATEGORY_MAP.Sneakers) {
    if (text.includes(kw)) return 'Sneakers';
  }
  for (const kw of CATEGORY_MAP.Clothing) {
    if (text.includes(kw)) return 'Clothing';
  }
  for (const kw of CATEGORY_MAP.Accessories) {
    if (text.includes(kw)) return 'Accessories';
  }
  return 'Other';
}

/**
 * Detect the product subcategory.
 * @param {string} name - Product name
 * @param {string} category - Main category (from detectCategory)
 * @param {string} [brand] - Brand name
 * @returns {string} Subcategory or empty string
 */
function detectSubcategory(name, category, brand) {
  const text = `${name || ''} ${brand || ''}`.toLowerCase();

  // For sneakers: check sport-specific subcategories first
  if (category === 'Sneakers') {
    // Basketball — check first (Jordan is almost always basketball heritage)
    for (const kw of SUBCATEGORY_MAP.Basketball) {
      if (text.includes(kw)) return 'Basketball';
    }
    for (const kw of SUBCATEGORY_MAP.Trail) {
      if (text.includes(kw)) return 'Trail';
    }
    for (const kw of SUBCATEGORY_MAP.Running) {
      if (text.includes(kw)) return 'Running';
    }
    for (const kw of SUBCATEGORY_MAP.Skateboarding) {
      if (text.includes(kw)) return 'Skateboarding';
    }
    for (const kw of SUBCATEGORY_MAP.Training) {
      if (text.includes(kw)) return 'Training';
    }
    // Default sneaker subcategory
    for (const kw of SUBCATEGORY_MAP.Lifestyle) {
      if (text.includes(kw)) return 'Lifestyle';
    }
    return 'Lifestyle'; // Most sneakers are lifestyle if no match
  }

  if (category === 'Clothing') {
    for (const kw of SUBCATEGORY_MAP.Outerwear) {
      if (text.includes(kw)) return 'Outerwear';
    }
    for (const kw of SUBCATEGORY_MAP['T-Shirts']) {
      if (text.includes(kw)) return 'T-Shirts';
    }
    for (const kw of SUBCATEGORY_MAP.Tops) {
      if (text.includes(kw)) return 'Tops';
    }
    for (const kw of SUBCATEGORY_MAP.Bottoms) {
      if (text.includes(kw)) return 'Bottoms';
    }
    return '';
  }

  if (category === 'Accessories') {
    for (const kw of SUBCATEGORY_MAP.Bags) {
      if (text.includes(kw)) return 'Bags';
    }
    for (const kw of SUBCATEGORY_MAP.Headwear) {
      if (text.includes(kw)) return 'Headwear';
    }
    return '';
  }

  return '';
}

/**
 * Detect target gender from product name, description, and URL.
 * @param {string} name
 * @param {string} [description]
 * @param {string} [url]
 * @returns {string} 'Men' | 'Women' | 'Kids' | 'Unisex' | ''
 */
function detectGender(name, description, url) {
  const text = `${name || ''} ${description || ''} ${url || ''}`.toLowerCase();

  // Kids first (most specific)
  for (const kw of GENDER_KEYWORDS.Kids) {
    if (text.includes(kw)) return 'Kids';
  }
  // Check Women before Men ("women" contains "men")
  for (const kw of GENDER_KEYWORDS.Women) {
    if (text.includes(kw)) return 'Women';
  }
  for (const kw of GENDER_KEYWORDS.Men) {
    // Avoid false positives: "men" inside other words like "moment", "element"
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(text)) return 'Men';
  }
  for (const kw of GENDER_KEYWORDS.Unisex) {
    if (text.includes(kw)) return 'Unisex';
  }

  return ''; // Unknown — don't guess
}

/**
 * Full classification: detect category, subcategory, and gender at once.
 * @param {object} opts
 * @param {string} opts.name - Product name
 * @param {string} [opts.brand] - Brand
 * @param {string} [opts.description] - Description
 * @param {string} [opts.url] - Product URL
 * @returns {{ category: string, subcategory: string, gender: string }}
 */
function classify(opts) {
  const { name, brand, description, url } = opts;
  const category = detectCategory(name, description);
  const subcategory = detectSubcategory(name, category, brand);
  const gender = detectGender(name, description, url);
  return { category, subcategory, gender };
}

module.exports = {
  detectCategory,
  detectSubcategory,
  detectGender,
  classify,
  CATEGORY_MAP,
  SUBCATEGORY_MAP,
};
