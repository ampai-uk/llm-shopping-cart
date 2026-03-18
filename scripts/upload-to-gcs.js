#!/usr/bin/env node
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');

const BUCKET = process.env.GCS_BUCKET;
if (!BUCKET) {
  console.error('GCS_BUCKET environment variable is required');
  process.exit(1);
}

const type = process.argv[2]; // 'session' or 'orders'
const files = {
  session: { local: path.resolve(__dirname, '..', 'session.json'), remote: 'session.json' },
  orders: { local: path.resolve(__dirname, '..', 'data', 'orders.json'), remote: 'orders.json' },
};

if (!files[type]) {
  console.error(`Usage: node upload-to-gcs.js <session|orders>`);
  process.exit(1);
}

const { local, remote } = files[type];
if (!fs.existsSync(local)) {
  console.error(`File not found: ${local}`);
  process.exit(1);
}

async function upload() {
  const storage = new Storage();
  await storage.bucket(BUCKET).upload(local, { destination: remote });
  console.log(`Uploaded ${local} -> gs://${BUCKET}/${remote}`);
}

upload().catch(err => {
  console.error(err.message);
  process.exit(1);
});
