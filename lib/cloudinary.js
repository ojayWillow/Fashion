/**
 * FASHION. — Cloudinary Integration
 * ====================================
 * Shared Cloudinary init + upload logic.
 * Call init() once at startup, then use upload() for each image.
 */

let cloudinary = null;
let CLOUD_ENABLED = false;
let CLOUD_NAME = '';

/**
 * Initialize Cloudinary from CLOUDINARY_URL env var.
 * @param {object} [options]
 * @param {boolean} [options.silent] - Suppress console output
 * @returns {{ enabled: boolean, cloudName: string }}
 */
function init(options = {}) {
  const url = process.env.CLOUDINARY_URL;
  if (!url || url.includes('your_')) return { enabled: false, cloudName: '' };

  const m = url.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/);
  if (!m) return { enabled: false, cloudName: '' };

  try {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({ cloud_name: m[3], api_key: m[1], api_secret: m[2], secure: true });
    CLOUD_NAME = m[3];
    CLOUD_ENABLED = true;
    if (!options.silent) console.log(`  ☁️  Cloudinary → ${m[3]}`);
    return { enabled: true, cloudName: m[3] };
  } catch (e) {
    if (!options.silent) console.log(`  ⚠️  Cloudinary init failed: ${e.message}`);
    return { enabled: false, cloudName: '' };
  }
}

/**
 * Upload an image to Cloudinary.
 * @param {string|Buffer} source - URL string or image Buffer
 * @param {string} publicId - Cloudinary public ID (e.g. 'picks/1-air-jordan')
 * @returns {Promise<string|null>} Cloudinary URL or null on failure
 */
async function upload(source, publicId) {
  if (!CLOUD_ENABLED) return null;

  try {
    let result;
    if (Buffer.isBuffer(source)) {
      result = await new Promise((resolve, reject) => {
        const s = cloudinary.uploader.upload_stream(
          { public_id: publicId, overwrite: true, resource_type: 'image' },
          (e, r) => (e ? reject(e) : resolve(r))
        );
        s.end(source);
      });
    } else {
      result = await cloudinary.uploader.upload(source, {
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
      });
    }
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${publicId}`;
  } catch (e) {
    return null;
  }
}

/**
 * Check if Cloudinary is currently enabled.
 */
function isEnabled() {
  return CLOUD_ENABLED;
}

module.exports = { init, upload, isEnabled };
