/**
 * FASHION. — Duplicate Detection
 * =================================
 * URL normalization + SKU extraction for duplicate checking.
 */

const { URL } = require('url');

/**
 * Normalize a URL for comparison (strip tracking params, trailing slashes).
 */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.href.replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Extract a SKU/article number from a product URL.
 * Works for Foot Locker, END., and other common patterns.
 */
function extractSkuFromUrl(url) {
  // Foot Locker: long number before .html
  const m1 = url.match(/(\d{10,15})\.html/);
  if (m1) return m1[1];
  const m2 = url.match(/[\/\-](\d{10,15})(?:\?|$)/);
  if (m2) return m2[1];
  // END. style code in URL
  const m3 = url.match(/([a-zA-Z0-9]+-[a-zA-Z0-9]+)\.html/);
  if (m3) return m3[1].toLowerCase();
  return null;
}

/**
 * Find a duplicate in existing picks for a given URL.
 * Checks: exact URL, same SKU, same styleCode.
 *
 * @param {string} url - New product URL
 * @param {object[]} existingPicks - Array of pick objects
 * @returns {object|null} Matching pick or null
 */
function findDuplicate(url, existingPicks) {
  const normalizedNew = normalizeUrl(url);
  const skuNew = extractSkuFromUrl(url);

  for (const pick of existingPicks) {
    // Check 1: Exact URL match
    if (normalizeUrl(pick.url) === normalizedNew) return pick;

    // Check 2: Same SKU in URL
    if (skuNew && pick.url) {
      const skuExisting = extractSkuFromUrl(pick.url);
      if (skuExisting && skuExisting === skuNew) return pick;
    }

    // Check 3: Same styleCode
    if (skuNew && pick.styleCode && pick.styleCode === skuNew) return pick;
  }

  return null;
}

module.exports = { normalizeUrl, extractSkuFromUrl, findDuplicate };
