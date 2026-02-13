/* ===== FASHION. — Shared Image Module ===== */
/* Cloudinary image normalization + fallback handling */

/**
 * Normalize Cloudinary URLs: trim whitespace/borders and pad with #F5F5F7.
 * @param {string} url - Raw image URL
 * @returns {string} Normalized URL or empty string
 */
export function normalizeImage(url) {
  if (!url || url === '/favicon.png') return '';
  return url.replace(
    'f_auto,q_auto,w_800,h_800,c_pad,b_white',
    'f_auto,q_auto/e_trim/w_800,h_800,c_pad,b_rgb:F5F5F7'
  );
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
