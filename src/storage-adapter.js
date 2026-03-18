const fs = require('fs');
const path = require('path');

const LOCAL_SESSION_FILE = path.resolve(__dirname, '..', 'session.json');
const LOCAL_ORDERS_FILE = path.resolve(__dirname, '..', 'data', 'orders.json');

// In-memory cache with TTL
const cache = new Map();

function getCached(key, ttlMs) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

function isGCS() {
  return !!process.env.GCS_BUCKET;
}

let _gcsClient;
function getGCSBucket() {
  if (!_gcsClient) {
    const { Storage } = require('@google-cloud/storage');
    _gcsClient = new Storage();
  }
  return _gcsClient.bucket(process.env.GCS_BUCKET);
}

// --- Session ---

async function loadSession() {
  if (!isGCS()) {
    if (!fs.existsSync(LOCAL_SESSION_FILE)) {
      throw new Error('Session file not found. Run the CLI with --login first.');
    }
    return JSON.parse(fs.readFileSync(LOCAL_SESSION_FILE, 'utf8'));
  }

  const cached = getCached('session', 60_000);
  if (cached) return cached;

  const bucket = getGCSBucket();
  const [contents] = await bucket.file('session.json').download();
  const data = JSON.parse(contents.toString());
  setCache('session', data);
  return data;
}

// --- Orders ---

async function loadOrders(orderHistoryFile) {
  if (!isGCS()) {
    const filePath = orderHistoryFile || LOCAL_ORDERS_FILE;
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch { /* ignore */ }
    return [];
  }

  const cached = getCached('orders', 300_000);
  if (cached) return cached;

  const bucket = getGCSBucket();
  try {
    const [contents] = await bucket.file('orders.json').download();
    const data = JSON.parse(contents.toString());
    setCache('orders', data);
    return data;
  } catch (err) {
    if (err.code === 404) return [];
    throw err;
  }
}

async function saveOrders(orders) {
  if (!isGCS()) {
    const outputDir = path.dirname(LOCAL_ORDERS_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_ORDERS_FILE, JSON.stringify(orders, null, 2));
    return;
  }

  const bucket = getGCSBucket();
  await bucket.file('orders.json').save(JSON.stringify(orders, null, 2), {
    contentType: 'application/json',
  });
  setCache('orders', orders);
}

// --- Name Map (built from orders) ---

async function loadNameMap(orderHistoryFile) {
  const orders = await loadOrders(orderHistoryFile);
  const nameMap = new Map();
  for (const order of orders) {
    for (const item of (order.items || [])) {
      if (item.productId && item.name) nameMap.set(item.productId, item.name);
    }
  }
  return nameMap;
}

module.exports = {
  loadSession,
  loadOrders,
  saveOrders,
  loadNameMap,
  isGCS,
  LOCAL_SESSION_FILE,
  LOCAL_ORDERS_FILE,
};
