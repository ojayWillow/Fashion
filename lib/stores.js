/**
 * FASHION. — Store Matching & Config
 * =====================================
 * Loads store-configs.json and stores.json once, provides lookup functions.
 */

const fs = require('fs');
const path = require('path');
const { extractDomain } = require('./helpers');

const STORES_PATH = path.join(__dirname, '..', 'data', 'stores.json');
const CONFIGS_PATH = path.join(__dirname, '..', 'data', 'store-configs.json');

// Cache after first load
let _storesData = null;
let _configsData = null;

function getStoresData() {
  if (!_storesData) _storesData = JSON.parse(fs.readFileSync(STORES_PATH, 'utf-8'));
  return _storesData;
}

function getConfigsData() {
  if (!_configsData) _configsData = JSON.parse(fs.readFileSync(CONFIGS_PATH, 'utf-8'));
  return _configsData;
}

/**
 * Invalidate cached data (useful after editing store files).
 */
function clearCache() {
  _storesData = null;
  _configsData = null;
}

/**
 * Load the scraping config for a given domain.
 * Supports direct match, base-domain matching, inheritance, and _default fallback.
 *
 * @param {string} domain - e.g. 'footlocker.nl'
 * @returns {object} Config object with selectors, waitTime, etc.
 */
function loadStoreConfig(domain) {
  const configs = getConfigsData();
  const stores = configs.stores;

  // Direct match
  if (stores[domain]) {
    let config = { ...stores[domain] };
    if (config._inherit) {
      const parent = stores[config._inherit];
      config = { ...parent, ...config };
      delete config._inherit;
    }
    return config;
  }

  // Partial match (e.g. footlocker.nl matches footlocker.*)
  const baseDomain = domain.split('.').slice(-2, -1)[0];
  for (const [key, config] of Object.entries(stores)) {
    if (key === '_default') continue;
    if (key.startsWith(baseDomain + '.')) {
      let resolved = { ...config };
      if (resolved._inherit) {
        const parent = stores[resolved._inherit];
        resolved = { ...parent, ...resolved };
        delete resolved._inherit;
      }
      return resolved;
    }
  }

  // Default fallback
  return stores._default;
}

/**
 * Match a domain to a known store from stores.json.
 * Returns store metadata (name, flag, country, category).
 *
 * @param {string} domain - e.g. 'footlocker.nl'
 * @returns {object} { name, country, flag, category, categoryIcon }
 */
function matchStore(domain) {
  const storesData = getStoresData();
  const domainLower = domain.toLowerCase();

  for (const category of storesData.categories) {
    for (const store of category.stores) {
      const storeDomain = extractDomain(store.url);
      const storeBase = storeDomain.split('.').slice(-2, -1)[0];
      const inputBase = domainLower.split('.').slice(-2, -1)[0];

      if (storeDomain === domainLower || storeBase === inputBase) {
        return {
          name: store.name,
          country: store.country,
          flag: store.flag,
          saleUrl: store.saleUrl,
          category: category.name,
          categoryIcon: category.icon,
        };
      }
    }
  }

  // Not found — generate from domain
  const fallbackName = domain.split('.')[0];
  return {
    name: fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1),
    country: 'Unknown',
    flag: '🌐',
    saleUrl: `https://${domain}`,
    category: 'Other',
    categoryIcon: '🛒',
  };
}

/**
 * Check if a domain is Foot Locker (any region).
 */
function isFootLocker(domain) {
  return domain.includes('footlocker');
}

module.exports = { loadStoreConfig, matchStore, isFootLocker, clearCache };
