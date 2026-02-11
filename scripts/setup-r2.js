#!/usr/bin/env node
/**
 * FASHION. — R2 Connection Tester
 * ================================
 * Verifies your Cloudflare R2 credentials and bucket access.
 *
 * Usage:
 *   npm run setup-r2
 */

require('dotenv').config();
const { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'];

async function main() {
  console.log('\n🔧 FASHION. — R2 Setup Check\n' + '='.repeat(40) + '\n');

  // Check env vars
  let missing = [];
  for (const key of required) {
    if (!process.env[key] || process.env[key].includes('your_')) {
      missing.push(key);
      console.log(`  ❌ ${key} — not set`);
    } else {
      const val = process.env[key];
      const masked = val.substring(0, 4) + '...' + val.substring(val.length - 4);
      console.log(`  ✅ ${key} — ${masked}`);
    }
  }

  if (missing.length > 0) {
    console.log(`\n❌ Missing ${missing.length} env var(s). Copy .env.example to .env and fill in values.\n`);
    process.exit(1);
  }

  // Test connection
  console.log('\n🔌 Testing R2 connection...\n');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  try {
    // List objects (tests read access)
    const list = await client.send(new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      MaxKeys: 1,
    }));
    console.log(`  ✅ Bucket "${process.env.R2_BUCKET_NAME}" accessible`);
    console.log(`     Objects in bucket: ${list.KeyCount || 0}+`);

    // Test write access with a tiny test file
    const testKey = '_fashion-test-connection.txt';
    await client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: testKey,
      Body: 'FASHION. R2 connection test — ' + new Date().toISOString(),
      ContentType: 'text/plain',
    }));
    console.log(`  ✅ Write access confirmed`);

    // Clean up test file
    await client.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: testKey,
    }));
    console.log(`  ✅ Delete access confirmed`);

    // Test public URL
    const publicUrl = process.env.R2_PUBLIC_URL.replace(/\/$/, '');
    console.log(`\n  🌐 Public URL: ${publicUrl}`);
    console.log(`     Images will be served from: ${publicUrl}/picks/<filename>`);

    console.log('\n' + '='.repeat(40));
    console.log('✨ R2 is ready! Run "npm run fetch-images" to start.\n');

  } catch (err) {
    console.error(`\n  ❌ Connection failed: ${err.message}`);
    if (err.Code === 'NoSuchBucket' || err.message.includes('NoSuchBucket')) {
      console.error(`     → Bucket "${process.env.R2_BUCKET_NAME}" doesn't exist. Create it in the Cloudflare dashboard.`);
    } else if (err.message.includes('InvalidAccessKeyId') || err.message.includes('SignatureDoesNotMatch')) {
      console.error(`     → Check your R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY`);
    }
    console.error('');
    process.exit(1);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
