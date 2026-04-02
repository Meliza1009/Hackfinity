const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'products.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

function toDateKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function calculateStatus(expiryDateValue) {
  const expiryDate = new Date(expiryDateValue);
  const today = new Date();
  const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'expired';
  }

  if (diffDays <= 2) {
    return 'expiring-soon';
  }

  return 'fresh';
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(
      dataFile,
      JSON.stringify({ products: [], rewardPoints: 0, activity: [] }, null, 2),
      'utf8'
    );
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(dataFile, 'utf8');
  const parsed = JSON.parse(raw || '{}');

  return {
    products: Array.isArray(parsed.products) ? parsed.products : [],
    rewardPoints: Number(parsed.rewardPoints || 0),
    activity: Array.isArray(parsed.activity) ? parsed.activity : []
  };
}

async function writeStore(store) {
  await fs.writeFile(dataFile, JSON.stringify(store, null, 2), 'utf8');
}

function normalizeProduct(product) {
  return {
    id: Number(product.id),
    name: product.name,
    batchNumber: product.batchNumber,
    manufacturingDate: toDateKey(product.manufacturingDate),
    expiryDate: toDateKey(product.expiryDate),
    status: product.status || calculateStatus(product.expiryDate),
    source: product.source || 'manual',
    createdAt: product.createdAt || new Date().toISOString()
  };
}

function buildSummary(products, rewardPoints) {
  const summary = products.reduce(
    (accumulator, product) => {
      accumulator.total += 1;
      accumulator[product.status] += 1;
      return accumulator;
    },
    { total: 0, fresh: 0, 'expiring-soon': 0, expired: 0 }
  );

  return {
    ...summary,
    rewardPoints
  };
}

function toCsv(rows) {
  const headers = ['id', 'name', 'batchNumber', 'manufacturingDate', 'expiryDate', 'status', 'source', 'createdAt'];
  const escapeCell = (value) => {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  };

  const csvRows = [headers.join(',')];

  rows.forEach((row) => {
    csvRows.push(headers.map((header) => escapeCell(row[header])).join(','));
  });

  return csvRows.join('\n');
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/inventory', (req, res) => {
  res.sendFile(path.join(__dirname, 'inventory.html'));
});

app.get('/reports', (req, res) => {
  res.sendFile(path.join(__dirname, 'reports.html'));
});

app.get('/api/products', async (req, res) => {
  const store = await readStore();
  res.json({ products: store.products, summary: buildSummary(store.products, store.rewardPoints) });
});

app.get('/api/summary', async (req, res) => {
  const store = await readStore();
  res.json({ summary: buildSummary(store.products, store.rewardPoints), activity: store.activity.slice(-12) });
});

app.post('/api/products', async (req, res) => {
  const { name, batchNumber, manufacturingDate, expiryDate, source = 'manual' } = req.body;

  if (!name || !batchNumber || !manufacturingDate || !expiryDate) {
    return res.status(400).json({ message: 'All product fields are required.' });
  }

  const normalizedManufacturingDate = toDateKey(manufacturingDate);
  const normalizedExpiryDate = toDateKey(expiryDate);

  if (!normalizedManufacturingDate || !normalizedExpiryDate) {
    return res.status(400).json({ message: 'Invalid dates provided.' });
  }

  if (new Date(normalizedManufacturingDate) > new Date()) {
    return res.status(400).json({ message: 'Manufacturing date cannot be in the future.' });
  }

  if (new Date(normalizedExpiryDate) < new Date(normalizedManufacturingDate)) {
    return res.status(400).json({ message: 'Expiry date must be after manufacturing date.' });
  }

  const store = await readStore();
  const product = normalizeProduct({
    id: Date.now(),
    name: String(name).trim(),
    batchNumber: String(batchNumber).trim(),
    manufacturingDate: normalizedManufacturingDate,
    expiryDate: normalizedExpiryDate,
    status: calculateStatus(normalizedExpiryDate),
    source,
    createdAt: new Date().toISOString()
  });

  store.products.push(product);
  store.activity.push({
    type: 'product-added',
    detail: `${product.name} added to inventory`,
    createdAt: new Date().toISOString()
  });

  await writeStore(store);
  res.status(201).json({ product, summary: buildSummary(store.products, store.rewardPoints) });
});

app.post('/api/actions', async (req, res) => {
  const { action, productIds, foodBankId } = req.body;
  const ids = Array.isArray(productIds) ? productIds.map(Number) : [];

  if (!action || ids.length === 0) {
    return res.status(400).json({ message: 'Action and product selection are required.' });
  }

  const store = await readStore();
  const selectedProducts = store.products.filter((product) => ids.includes(Number(product.id)));

  if (selectedProducts.length === 0) {
    return res.status(404).json({ message: 'No matching products were found.' });
  }

  if (action === 'donate' && selectedProducts.some((product) => product.status === 'expired')) {
    return res.status(400).json({ message: 'Expired items cannot be donated.' });
  }

  let removedCount = selectedProducts.length;
  let rewardPointsEarned = 0;

  if (action === 'recycle') {
    rewardPointsEarned = removedCount * 10;
    store.rewardPoints += rewardPointsEarned;
  }

  const actionRecord = {
    type: action,
    detail: action === 'donate'
      ? `Donated ${removedCount} item(s)${foodBankId ? ` to food bank ${foodBankId}` : ''}`
      : action === 'return'
        ? `Returned ${removedCount} item(s)`
        : `Recycled ${removedCount} item(s)`,
    createdAt: new Date().toISOString(),
    items: selectedProducts.map((product) => product.id),
    rewardPointsEarned
  };

  store.products = store.products.filter((product) => !ids.includes(Number(product.id)));
  store.activity.push(actionRecord);

  await writeStore(store);

  res.json({
    action,
    removedCount,
    rewardPointsEarned,
    summary: buildSummary(store.products, store.rewardPoints),
    activity: store.activity.slice(-12)
  });
});

app.delete('/api/products/:id', async (req, res) => {
  const targetId = Number(req.params.id);
  const store = await readStore();
  const nextProducts = store.products.filter((product) => Number(product.id) !== targetId);

  if (nextProducts.length === store.products.length) {
    return res.status(404).json({ message: 'Product not found.' });
  }

  store.products = nextProducts;
  store.activity.push({
    type: 'product-removed',
    detail: `Product ${targetId} removed from inventory`,
    createdAt: new Date().toISOString()
  });

  await writeStore(store);
  res.json({ summary: buildSummary(store.products, store.rewardPoints) });
});

app.get('/api/reports/export.csv', async (req, res) => {
  const store = await readStore();
  const csv = toCsv(store.products.map(normalizeProduct));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="food-expiry-report.csv"');
  res.send(csv);
});

app.get('/api/reports/overview', async (req, res) => {
  const store = await readStore();
  res.json({
    summary: buildSummary(store.products, store.rewardPoints),
    activity: store.activity.slice().reverse().slice(0, 10),
    products: store.products
  });
});

app.listen(port, () => {
  console.log(`Food Expiry Tracker running at http://localhost:${port}`);
});
