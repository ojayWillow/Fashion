/**
 * FASHION. — Shared Helpers
 * ==========================
 * Price parsing, formatting, slugify, currency detection, size validation.
 */

const { URL } = require('url');

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.toString().replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function formatPrice(num, currency) {
  if (!num) return '';
  const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€';
  return `${sym}${num.toFixed(num % 1 === 0 ? 0 : 2)}`;
}

function detectCurrency(domain) {
  if (domain.endsWith('.co.uk') || domain.endsWith('.uk')) return 'GBP';
  if (domain.endsWith('.com') && !domain.includes('.co')) return 'USD';
  return 'EUR';
}

function calcDiscount(salePrice, retailPrice) {
  if (salePrice && retailPrice && retailPrice > salePrice) {
    return `-${Math.round((1 - salePrice / retailPrice) * 100)}%`;
  }
  return '0%';
}

function isValidSize(text) {
  if (!text || text.length > 12) return false;
  const t = text.trim();
  // EU sizes: 35-52, possibly with .5
  if (/^\d{2}(\.5)?$/.test(t)) {
    const n = parseFloat(t);
    if (n >= 35 && n <= 52) return true;
  }
  // US/UK sizes
  if (/^(US|UK)?\s?\d{1,2}(\.5)?$/i.test(t)) return true;
  // Clothing sizes
  if (/^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|XXXL)$/i.test(t)) return true;
  // Waist sizes
  if (/^\d{2}$/.test(t)) {
    const n = parseInt(t);
    if (n >= 24 && n <= 52) return true;
  }
  return false;
}

/**
 * Generate the next pick ID from an array of picks.
 */
function nextPickId(picks) {
  return Math.max(...picks.map(p => p.id), 0) + 1;
}

module.exports = {
  extractDomain,
  slugify,
  parsePrice,
  formatPrice,
  detectCurrency,
  calcDiscount,
  isValidSize,
  nextPickId,
};
