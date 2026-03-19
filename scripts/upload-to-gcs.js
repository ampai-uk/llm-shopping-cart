#!/usr/bin/env node
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');

async function getDefaultBucket() {
  const { execSync } = require('child_process');
  const project = process.env.GCP_PROJECT ||
    execSync('gcloud config get-value project', { encoding: 'utf8' }).trim();
  return `${project}-ocado-mcp`;
}

let BUCKET = process.env.GCS_BUCKET;

const type = process.argv[2] || 'session';
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
  if (!BUCKET) {
    BUCKET = await getDefaultBucket();
    console.log(`GCS_BUCKET not set, using default: ${BUCKET}`);
  }
  const storage = new Storage();
  await storage.bucket(BUCKET).upload(local, { destination: remote });
  console.log(`Uploaded ${local} -> gs://${BUCKET}/${remote}`);
}

upload().catch(err => {
  console.error(err.message);
  process.exit(1);
});
