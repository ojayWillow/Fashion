/**
 * FASHION. — Image Pipeline
 * ==========================
 * Downloads product images, uploads to Cloudinary.
 * Tries brand CDN first for clean, consistent images.
 * Falls back to store image + sharp processing if no CDN match.
 *
 * See: data/standards/IMAGE_STANDARDS.md
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { log, slugify } = require('./helpers');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  // sharp is optional — only needed for store image fallback processing
  sharp = null;
}

// ===== CLOUDINARY =====

let cloudinary = null;
let CLOUD_ENABLED = false;
let CLOUD_NAME = '';

// Simple transform — no padding/trimming needed since images are already clean
const CLOUDINARY_TRANSFORM = 'f_auto,q_auto,w_800,h_800,c_pad,b_rgb:F5F5F7';

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
  if (buffer.length < 20000) return 'needs-review';
  if (buffer.length < 50000) return 'needs-review';
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

// ===== SHARP: NORMALIZE STORE IMAGES =====

/**
 * Process a store image with sharp to match brand CDN quality:
 * 1. Trim whitespace/background
 * 2. Resize product to ~70% of 800x800 (560px)
 * 3. Center on 800x800 white canvas
 *
 * This makes store images look like brand CDN images.
 */
async function normalizeWithSharp(buffer) {
  if (!sharp) {
    log('sharp not installed — skipping image normalization');
    return buffer;
  }

  try {
    // Step 1: Trim whitespace around the product
    const trimmed = await sharp(buffer)
      .trim({ threshold: 30 })
      .toBuffer();

    // Step 2: Get trimmed dimensions
    const meta = await sharp(trimmed).metadata();
    const maxDim = Math.max(meta.width || 0, meta.height || 0);

    if (maxDim === 0) return buffer;

    // Step 3: Resize so the product fits in ~560px (70% of 800)
    const targetSize = 560;
    const scale = targetSize / maxDim;
    const newW = Math.round((meta.width || 1) * Math.min(scale, 1));
    const newH = Math.round((meta.height || 1) * Math.min(scale, 1));

    // Step 4: Resize and center on 800x800 white canvas
    const resized = await sharp(trimmed)
      .resize(newW, newH, { fit: 'inside' })
      .toBuffer();

    const final = await sharp({
      create: {
        width: 800,
        height: 800,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([{
        input: resized,
        gravity: 'centre',
      }])
      .png()
      .toBuffer();

    log(`sharp: normalized ${meta.width}x${meta.height} → 800x800 (product ${newW}x${newH})`);
    return final;
  } catch (e) {
    log(`sharp normalization failed: ${e.message} — using original`);
    return buffer;
  }
}

// ===== BRAND CDN RESOLVERS =====

/**
 * Brand CDN map.
 * Each brand has a function that takes a style code and returns
 * a direct URL to a clean, high-res product image.
 *
 * These images are studio-shot, white background, perfectly centered.
 * Much better than store-scraped images.
 */
const BRAND_CDN = {
  'Nike': (styleCode) => {
    if (!styleCode) return null;
    return `https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/${styleCode}.png`;
  },
  'Jordan': (styleCode) => {
    if (!styleCode) return null;
    return `https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/${styleCode}.png`;
  },
  'adidas': (styleCode) => {
    if (!styleCode) return null;
    // adidas CDN uses style code in the path
    return `https://assets.adidas.com/images/h_840,f_auto,q_auto,fl_lossy,c_fill,g_auto/${styleCode}_01_standard.jpg`;
  },
  'Adidas': (styleCode) => {
    if (!styleCode) return null;
    return `https://assets.adidas.com/images/h_840,f_auto,q_auto,fl_lossy,c_fill,g_auto/${styleCode}_01_standard.jpg`;
  },
  'ADIDAS': (styleCode) => {
    if (!styleCode) return null;
    return `https://assets.adidas.com/images/h_840,f_auto,q_auto,fl_lossy,c_fill,g_auto/${styleCode}_01_standard.jpg`;
  },
  'New Balance': (styleCode) => {
    if (!styleCode) return null;
    return `https://nb.scene7.com/is/image/NB/${styleCode}_nb_02_i?$pdpflexf2$&qlt=80&wid=880`;
  },
  'NEW BALANCE': (styleCode) => {
    if (!styleCode) return null;
    return `https://nb.scene7.com/is/image/NB/${styleCode}_nb_02_i?$pdpflexf2$&qlt=80&wid=880`;
  },
  'Puma': (styleCode) => {
    if (!styleCode) return null;
    // Puma CDN: style code with _01 suffix
    return `https://images.puma.com/image/upload/f_auto,q_auto,b_rgb:fafafa,w_750,h_750/${styleCode}_01.png`;
  },
  'PUMA': (styleCode) => {
    if (!styleCode) return null;
    return `https://images.puma.com/image/upload/f_auto,q_auto,b_rgb:fafafa,w_750,h_750/${styleCode}_01.png`;
  },
  'ASICS': (styleCode) => {
    if (!styleCode) return null;
    return `https://images.asics.com/is/image/asics/${styleCode}_SR_RT_GLB?$productpage$`;
  },
  'Asics': (styleCode) => {
    if (!styleCode) return null;
    return `https://images.asics.com/is/image/asics/${styleCode}_SR_RT_GLB?$productpage$`;
  },
  'ON': (styleCode) => {
    if (!styleCode) return null;
    return `https://res.cloudinary.com/on-running/image/upload/q_auto,f_auto,w_900/${styleCode}_fw23_${styleCode}_png_hero.png`;
  },
  'On': (styleCode) => {
    if (!styleCode) return null;
    return `https://res.cloudinary.com/on-running/image/upload/q_auto,f_auto,w_900/${styleCode}_fw23_${styleCode}_png_hero.png`;
  },
  'Timberland': (styleCode) => {
    if (!styleCode) return null;
    return `https://images.timberland.com/is/image/TimberlandEU/${styleCode}-hero?wid=720`;
  },
  'TIMBERLAND': (styleCode) => {
    if (!styleCode) return null;
    return `https://images.timberland.com/is/image/TimberlandEU/${styleCode}-hero?wid=720`;
  },
  'Salomon': (styleCode) => {
    if (!styleCode) return null;
    return `https://www.salomon.com/sites/default/files/product-images/${styleCode}_01_GHO.png`;
  },
  'SALOMON': (styleCode) => {
    if (!styleCode) return null;
    return `https://www.salomon.com/sites/default/files/product-images/${styleCode}_01_GHO.png`;
  },
};

async function tryBrandCDN(brand, styleCode) {
  // Try exact brand name first, then common variations
  const variations = [brand];
  if (brand) {
    variations.push(brand.toUpperCase());
    variations.push(brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase());
  }

  for (const name of variations) {
    const resolver = BRAND_CDN[name];
    if (!resolver) continue;
    const url = resolver(styleCode);
    if (!url) continue;
    try {
      const buffer = await fetchBuffer(url);
      if (isValidImageBuffer(buffer)) {
        log(`Brand CDN hit: ${name} → ${url}`);
        return { url, buffer };
      }
    } catch (e) {
      log(`Brand CDN miss for ${name}: ${e.message}`);
    }
  }
  return null;
}

// ===== MAIN PIPELINE =====

async function processImage({ imageUrl, brand, productId, name, styleCode }) {
  const publicId = `picks/${productId}-${slugify(name)}`;

  // Step 1: Try brand CDN first — clean, consistent images
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

  // Step 2: Use store image — normalize with sharp before uploading
  if (!imageUrl) {
    return { image: '', originalImage: '', imageStatus: 'missing' };
  }

  try {
    const buffer = await fetchBuffer(imageUrl);
    if (!isValidImageBuffer(buffer)) {
      log('Store image failed validation');
      return { image: '', originalImage: imageUrl, imageStatus: 'missing' };
    }

    // Normalize store image to match brand CDN quality
    const normalized = await normalizeWithSharp(buffer);
    const status = determineImageStatus(normalized, imageUrl);
    const cdnUrl = await uploadToCloudinary(normalized, publicId);

    return {
      image: cdnUrl || '',
      originalImage: imageUrl,
      imageStatus: cdnUrl ? status : 'missing',
    };
  } catch (e) {
    log(`Image download failed: ${e.message}`);
    return {
      image: '',
      originalImage: imageUrl,
      imageStatus: 'missing',
    };
  }
}

module.exports = { processImage, CLOUDINARY_TRANSFORM, tryBrandCDN, normalizeWithSharp, uploadToCloudinary };
