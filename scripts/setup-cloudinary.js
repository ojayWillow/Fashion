#!/usr/bin/env node
/**
 * FASHION. — Cloudinary Connection Tester
 * ========================================
 * Verifies your Cloudinary credentials work.
 *
 * Usage:
 *   npm run setup
 */

require('dotenv').config();

async function main() {
  console.log('\n🔧 FASHION. — Cloudinary Setup Check\n' + '='.repeat(40) + '\n');

  // Check env
  const url = process.env.CLOUDINARY_URL;
  if (!url || url.includes('your_')) {
    console.log('  ❌ CLOUDINARY_URL not set');
    console.log('\n  1. Copy .env.example to .env');
    console.log('  2. Paste your CLOUDINARY_URL from https://console.cloudinary.com/settings/api-keys');
    console.log('     It looks like: cloudinary://123456:abcXYZ@mycloud\n');
    process.exit(1);
  }

  // Parse URL
  const match = url.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/);
  if (!match) {
    console.log('  ❌ Invalid CLOUDINARY_URL format');
    console.log('     Expected: cloudinary://API_KEY:API_SECRET@CLOUD_NAME\n');
    process.exit(1);
  }

  const [, apiKey, apiSecret, cloudName] = match;
  console.log(`  ✅ Cloud Name:  ${cloudName}`);
  console.log(`  ✅ API Key:     ${apiKey.substring(0, 6)}...`);
  console.log(`  ✅ API Secret:  ${apiSecret.substring(0, 4)}...${apiSecret.slice(-3)}`);

  // Test connection
  console.log('\n🔌 Testing connection...\n');

  try {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });

    // Ping API by checking usage
    const result = await cloudinary.api.ping();
    if (result.status === 'ok') {
      console.log('  ✅ API connection successful!');
    }

    // Show account info
    const usage = await cloudinary.api.usage();
    const usedMB = (usage.storage.usage / 1024 / 1024).toFixed(1);
    const limitGB = (usage.storage.limit / 1024 / 1024 / 1024).toFixed(0);
    console.log(`  📊 Storage used: ${usedMB} MB / ${limitGB} GB`);
    console.log(`  📊 Bandwidth:    ${(usage.bandwidth.usage / 1024 / 1024).toFixed(1)} MB used`);

    const publicUrl = `https://res.cloudinary.com/${cloudName}/image/upload`;
    console.log(`\n  🌐 Images will be served from:`);
    console.log(`     ${publicUrl}/picks/<filename>`);

    console.log('\n' + '='.repeat(40));
    console.log('✨ Cloudinary is ready! Run "npm run fetch-images" to start.\n');

  } catch (err) {
    console.error(`\n  ❌ Connection failed: ${err.message}`);
    if (err.message.includes('Invalid')) {
      console.error('     → Check your API key and secret');
    }
    console.error('');
    process.exit(1);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
