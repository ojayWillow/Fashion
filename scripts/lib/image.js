/**
 * FASHION. — Image Pipeline
 * ==========================
 * Downloads product images, uploads to Cloudinary with
 * the correct transforms (f5f5f7 background + shadow).
 *
 * Transform: f_auto,q_auto,w_800,h_800,c_pad,b_rgb:f5f5f7,e_shadow:40
 * See: data/standards/IMAGE_STANDARDS.md
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { log, slugify } = require('./helpers');

// ===== CLOUDINARY =====

let cloudinary = null;
let CLOUD_ENABLED = false;
let CLOUD_NAME = '';

const CLOUDINARY_TRANSFORM = 'f_auto,q_auto,w_800,h_800,c_pad,b_rgb:f5f5f7,e_shadow:40';

function initCloudinary() {
  const url = process.env.CLOUDINARY_URL;
  if (!url || url.includes('your_')) return;
  const m = url.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/);
  if (!m) return;
  try {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({ cloud_name: m[3], api_key: m[1], api_secret: m[2], secure: true });
    CLOUD_NAME = m[3];
    CLOUD_ENABLED = true;
    log(`Cloudinary ready → ${CLOUD_NAME}`);
  } catch (e) {
    log(`Cloudinary init failed: ${e.message}`);
  }
}

// Init on load
initCloudinary();

// ===== HTTP =====

function fetchBuffer(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, {
      timeout,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return fetchBuffer(new URL(res.headers.location, url).href, timeout).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

// ===== IMAGE VALIDATION =====

function isValidImageBuffer(buffer) {
  if (!buffer || buffer.length < 5000) return false;
  const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;
  const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8;
  const isWEBP = buffer.length > 11 && buffer[8] === 0x57 && buffer[9] === 0x45;
  return isPNG || isJPEG || isWEBP;
}

function determineImageStatus(buffer, imageUrl) {
  if (!imageUrl || !buffer) return 'missing';
  if (buffer.length < 20000) return 'needs-review';   // < ~20KB is likely thumbnail
  if (buffer.length < 50000) return 'needs-review';   // < ~50KB is suspicious
  return 'ok';
}

// ===== CLOUDINARY UPLOAD =====

async function uploadToCloudinary(source, publicId) {
  if (!CLOUD_ENABLED) return null;
  try {
    const uploadOpts = {
      public_id: publicId,
      overwrite: true,
      resource_type: 'image',
      invalidate: true,
    };

    let result;
    if (Buffer.isBuffer(source)) {
      result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          uploadOpts,
          (err, res) => err ? reject(err) : resolve(res)
        );
        stream.end(source);
      });
    } else {
      result = await cloudinary.uploader.upload(source, uploadOpts);
    }

    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${CLOUDINARY_TRANSFORM}/${publicId}`;
  } catch (e) {
    log(`Cloudinary upload failed: ${e.message}`);
    return null;
  }
}

// ===== BRAND CDN RESOLVERS =====
// Try to get a high-quality image directly from the brand's CDN

const BRAND_CDN = {
  'Nike': (styleCode) => {
    if (!styleCode) return null;
    return `https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/${styleCode}.png`;
  },
  'Jordan': (styleCode) => {
    if (!styleCode) return null;
    return `https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/${styleCode}.png`;
  },
};

async function tryBrandCDN(brand, styleCode) {
  const resolver = BRAND_CDN[brand];
  if (!resolver) return null;
  const url = resolver(styleCode);
  if (!url) return null;
  try {
    const buffer = await fetchBuffer(url);
    if (isValidImageBuffer(buffer)) {
      log(`Brand CDN hit: ${url}`);
      return { url, buffer };
    }
  } catch (e) {
    log(`Brand CDN miss for ${brand}: ${e.message}`);
  }
  return null;
}

// ===== MAIN PIPELINE =====

/**
 * Process a product image through the full pipeline.
 *
 * @param {Object} opts
 * @param {string} opts.imageUrl      - Source image URL from adapter
 * @param {string} opts.brand         - Brand name
 * @param {string} opts.productId     - Product ID for naming
 * @param {string} opts.name          - Product name for slug
 * @param {string} opts.styleCode     - Style code for brand CDN lookup
 * @returns {{ image: string, originalImage: string, imageStatus: string }}
 */
async function processImage({ imageUrl, brand, productId, name, styleCode }) {
  const publicId = `picks/${productId}-${slugify(name)}`;

  // Step 1: Try brand CDN first
  const brandResult = await tryBrandCDN(brand, styleCode);
  if (brandResult) {
    const cdnUrl = await uploadToCloudinary(brandResult.buffer, publicId);
    if (cdnUrl) {
      return {
        image: cdnUrl,
        originalImage: brandResult.url,
        imageStatus: 'ok',
      };
    }
  }

  // Step 2: Use store image
  if (!imageUrl) {
    return { image: '', originalImage: '', imageStatus: 'missing' };
  }

  try {
    const buffer = await fetchBuffer(imageUrl);
    if (!isValidImageBuffer(buffer)) {
      log('Store image failed validation');
      return { image: '', originalImage: imageUrl, imageStatus: 'missing' };
    }

    const status = determineImageStatus(buffer, imageUrl);
    const cdnUrl = await uploadToCloudinary(buffer, publicId);

    return {
      image: cdnUrl || '',
      originalImage: imageUrl,
      imageStatus: cdnUrl ? status : 'missing',
    };
  } catch (e) {
    log(`Image download failed: ${e.message}`);
    // Still save the URL even if we can't download
    return {
      image: '',
      originalImage: imageUrl,
      imageStatus: 'missing',
    };
  }
}

module.exports = { processImage, CLOUDINARY_TRANSFORM };
