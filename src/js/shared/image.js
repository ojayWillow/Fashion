/* ===== FASHION. — Shared Image Module ===== */
/* Cloudinary image normalization + fallback handling */

/**
 * Normalize Cloudinary URLs to a single consistent transform:
 *   f_auto,q_auto/e_trim:10/w_800,h_800,c_lpad,b_rgb:F5F5F7
 *
 * e_trim:10  — trims near-white backgrounds with 10% tolerance
 * c_lpad     — letterbox-centers the product in the 800×800 frame
 * b_rgb:F5F5F7 — fills empty space with site background gray
 *
 * @param {string} url - Raw image URL
 * @returns {string} Normalized URL or empty string
 */
export function normalizeImage(url) {
  if (!url || url === '/favicon.png') return '';

  const TARGET = 'f_auto,q_auto/e_trim:10/w_800,h_800,c_lpad,b_rgb:F5F5F7';

  // Format 1: SNS / Foot Locker / old scraper (c_pad,b_white)
  url = url.replace(
    'f_auto,q_auto,w_800,h_800,c_pad,b_white',
    TARGET
  );

  // Format 2: Mr Porter with e_trim (c_pad,b_rgb:F5F5F7)
  url = url.replace(
    /f_auto,q_auto\/e_trim\/w_800,h_800,c_pad,b_rgb:F5F5F7/,
    TARGET
  );

  // Format 3: previous broken fix (c_fill,g_auto)
  url = url.replace(
    /f_auto,q_auto\/e_trim\/w_800,h_800,c_fill,g_auto/,
    TARGET
  );

  // Format 4: previous c_lpad without trim tolerance
  url = url.replace(
    /f_auto,q_auto\/e_trim\/w_800,h_800,c_lpad,b_rgb:F5F5F7/,
    TARGET
  );

  return url;
}

/**
 * Replace a broken <img> with a branded fallback.
 * @param {HTMLImageElement} imgEl - The image element that failed
 * @param {string} brandName - Brand name (first char used as icon)
 */
export function handleImageError(imgEl, brandName) {
  const wrapper = imgEl.parentElement;
  imgEl.style.display = 'none';

  if (wrapper.querySelector('.pick-img-fallback')) return;

  const fallback = document.createElement('div');
  fallback.className = 'pick-img-fallback';
  fallback.innerHTML = `
    <div class="pick-img-fallback-icon">${brandName ? brandName.charAt(0).toUpperCase() : '?'}</div>
    <div class="pick-img-fallback-text">Image Unavailable</div>
  `;
  wrapper.appendChild(fallback);
}

/**
 * Build an image HTML string with fallback for use in innerHTML templates.
 * @param {string} url - Raw image URL
 * @param {string} name - Product name (for alt text)
 * @param {string} brand - Brand name (for fallback icon)
 * @returns {string} HTML string
 */
export function buildImageHTML(url, name, brand) {
  const imgUrl = normalizeImage(url);
  const initial = brand ? brand.charAt(0).toUpperCase() : '?';
  const safeName = (name || '').replace(/"/g, '&quot;');

  if (imgUrl) {
    return `<img src="${imgUrl}" alt="${safeName}" loading="lazy"
             onerror="this.parentElement.innerHTML='<div class=pick-img-fallback><div class=pick-img-fallback-icon>${initial}</div><div class=pick-img-fallback-text>Image unavailable</div></div>'">`;
  }

  return `<div class="pick-img-fallback">
    <div class="pick-img-fallback-icon">${initial}</div>
    <div class="pick-img-fallback-text">No image</div>
  </div>`;
}
