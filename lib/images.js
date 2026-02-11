/**
 * FASHION. — HD Image Pipeline
 * ===============================
 * Constructs highest-resolution image URLs for each store/CDN.
 * The goal: store a flawless 1904px master, serve optimized versions.
 *
 * Strategy:
 *   1. Upload the HIGHEST quality source to Cloudinary (q_auto:best)
 *   2. Serve via Cloudinary URL transforms (w_800,q_auto:good for cards)
 *   3. Full-res available by stripping transforms from URL
 */

const { URL } = require('url');

// =====================================================================
// FOOT LOCKER — Max resolution from Scene7 CDN
// =====================================================================
// FL uses Adobe Scene7 image server. Known params:
//   wid=  width in pixels
//   hei=  height in pixels
//   fmt=  format (png-alpha for transparent bg, jpeg for solid)
//   resMode=sharp2  sharpening
//
// Max tested: wid=1904 works perfectly. Beyond 2000 returns 404.
const FL_IMAGE_PARAMS = 'wid=1904&hei=1344&fmt=png-alpha&resMode=sharp2';
const FL_IMAGE_PARAMS_JPEG = 'wid=1904&hei=1344&fmt=jpeg&qlt=95&resMode=sharp2';

function buildFootLockerImageUrl(sku, format = 'png') {
  const fmt = format === 'jpeg' ? FL_IMAGE_PARAMS_JPEG : FL_IMAGE_PARAMS;
  return [
    `https://images.footlocker.com/is/image/FLEU/${sku}?${fmt}`,
    `https://images.footlocker.com/is/image/EBFL2/${sku}?${fmt}`,
  ];
}

// =====================================================================
// NIKE — Highest PDP resolution
// =====================================================================
// Nike static CDN uses transform prefixes:
//   t_PDP_1728_v1  = 1728px (highest standard PDP)
//   t_PDP_864_v1   = 864px
//   t_default       = varies
//
// We want t_PDP_1728_v1 always.
function upgradeNikeImageUrl(url) {
  if (!url) return url;
  // Replace any existing transform with the highest res
  return url
    .replace(/t_PDP_\d+_v\d+/g, 't_PDP_1728_v1')
    .replace(/t_default/g, 't_PDP_1728_v1')
    // Remove eco quality reduction
    .replace(/q_auto:eco/g, 'q_auto:best');
}

// =====================================================================
// END. CLOTHING — Max width via media server
// =====================================================================
// END uses their own media CDN. Image URLs support width params.
function upgradeEndClothingImageUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname.includes('endclothing') || u.hostname.includes('media.end')) {
      // Force highest width
      u.searchParams.set('w', '1200');
      u.searchParams.delete('h'); // let aspect ratio be natural
      return u.href;
    }
  } catch {}
  return url;
}

// =====================================================================
// NEW BALANCE — Scene7 CDN
// =====================================================================
function upgradeNewBalanceImageUrl(url) {
  if (!url) return url;
  if (url.includes('nb.scene7.com')) {
    // Replace width/height params for max res
    return url
      .replace(/wid=\d+/g, 'wid=1600')
      .replace(/hei=\d+/g, 'hei=1600');
  }
  return url;
}

// =====================================================================
// ADIDAS — Assets CDN
// =====================================================================
function upgradeAdidasImageUrl(url) {
  if (!url) return url;
  if (url.includes('assets.adidas.com')) {
    // Adidas uses /w_600 style params in URL path
    return url.replace(/\/w_\d+/g, '/w_1200');
  }
  return url;
}

// =====================================================================
// GENERIC — Try to find highest res params
// =====================================================================
function upgradeGenericImageUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    // Common CDN width params
    if (u.searchParams.has('w')) u.searchParams.set('w', '1200');
    if (u.searchParams.has('wid')) u.searchParams.set('wid', '1200');
    if (u.searchParams.has('width')) u.searchParams.set('width', '1200');
    // Remove quality reductions
    if (u.searchParams.has('q')) {
      const q = parseInt(u.searchParams.get('q'));
      if (q < 90) u.searchParams.set('q', '95');
    }
    return u.href;
  } catch {}
  return url;
}

// =====================================================================
// PUBLIC API
// =====================================================================

/**
 * Upgrade any product image URL to the highest available resolution.
 * @param {string} url - Original image URL
 * @param {string} [storeDomain] - Store domain for store-specific logic
 * @returns {string} Upgraded URL
 */
function upgradeImageUrl(url, storeDomain) {
  if (!url) return url;

  if (url.includes('static.nike.com')) return upgradeNikeImageUrl(url);
  if (url.includes('endclothing') || url.includes('media.end')) return upgradeEndClothingImageUrl(url);
  if (url.includes('nb.scene7.com')) return upgradeNewBalanceImageUrl(url);
  if (url.includes('assets.adidas.com')) return upgradeAdidasImageUrl(url);

  return upgradeGenericImageUrl(url);
}

/**
 * Build Cloudinary URL with display transforms.
 * Master is stored at full quality; this adds on-the-fly optimization.
 *
 * @param {string} cloudinaryUrl - Full Cloudinary URL
 * @param {object} [opts]
 * @param {number} [opts.width] - Display width (default: 800 for cards)
 * @param {string} [opts.quality] - Quality preset (default: 'auto:good')
 * @returns {string} Optimized display URL
 */
function cloudinaryDisplayUrl(cloudinaryUrl, opts = {}) {
  if (!cloudinaryUrl || !cloudinaryUrl.includes('res.cloudinary.com')) return cloudinaryUrl;
  const width = opts.width || 800;
  const quality = opts.quality || 'auto:good';
  // Insert display transforms after /upload/
  return cloudinaryUrl.replace(
    '/upload/',
    `/upload/w_${width},q_${quality},f_auto/`
  );
}

/**
 * Get the full-resolution Cloudinary URL (no display transforms).
 */
function cloudinaryFullResUrl(cloudinaryUrl) {
  if (!cloudinaryUrl || !cloudinaryUrl.includes('res.cloudinary.com')) return cloudinaryUrl;
  // Strip any transforms between /upload/ and the public ID
  return cloudinaryUrl.replace(/\/upload\/[^/]*\//, '/upload/');
}

module.exports = {
  buildFootLockerImageUrl,
  upgradeNikeImageUrl,
  upgradeEndClothingImageUrl,
  upgradeNewBalanceImageUrl,
  upgradeAdidasImageUrl,
  upgradeImageUrl,
  cloudinaryDisplayUrl,
  cloudinaryFullResUrl,
  FL_IMAGE_PARAMS,
};
