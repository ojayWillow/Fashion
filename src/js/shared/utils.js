/* ===== FASHION. — Shared Utils Module ===== */
/* Small general-purpose helpers */

/**
 * HTML-escape a string for safe innerHTML usage.
 * @param {string} str
 * @returns {string}
 */
export function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/**
 * Capitalize first letter of a string.
 * @param {string} s
 * @returns {string}
 */
export function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Extract clean domain from a URL string.
 * @param {string} url
 * @returns {string} e.g. "endclothing.com"
 */
export function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return ''; }
}
