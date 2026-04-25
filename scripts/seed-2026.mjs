/**
 * Seed script: Full 2026 data (Jan-Apr)
 *
 * Usage:
 *   node scripts/seed-2026.mjs          # seed all data
 *   node scripts/seed-2026.mjs --reset  # delete all data first, then reseed
 *
 * Requires dev server running at http://localhost:3000
 */

const BASE = 'http://localhost:3000';
const RESET = process.argv.includes('--reset');

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const get   = (path)       => req('GET',    path);
const post  = (path, body) => req('POST',   path, body);
const patch = (path, body) => req('PATCH',  path, body);
const del   = (path)       => req('DELETE', path);

// ---------------------------------------------------------------------------
// COMMITMENTS - Recurring monthly items (amounts in cents, using typical values)
// ---------------------------------------------------------------------------
const COMMITMENTS = [
  // Housing
  { label: 'Bond',              amount: 900000,  category: 'housing',   accountType: 'personal', isVariable: false },
  { label: 'Levies',            amount: 150000,  category: 'housing',   accountType: 'personal', isVariable: true  },
  { label: 'Rates',             amount: 50000,   category: 'housing',   accountType: 'personal', isVariable: false },
  { label: 'Electricity',       amount: 150000,  category: 'housing',   accountType: 'personal', isVariable: true  },
  // Transport
  { label: 'Car Insurance',     amount: 400000,  category: 'transport', accountType: 'personal', isVariable: true  },
  { label: 'Car Track',         amount: 23900,   category: 'transport', accountType: 'personal', isVariable: true  },
  { label: 'Petrol',            amount: 250000,  category: 'transport', accountType: 'personal', isVariable: true  },
  // Family
  { label: 'Family Support',    amount: 200000,  category: 'family',    accountType: 'personal', isVariable: false },
  { label: 'Sbonga Fees',       amount: 200000,  category: 'family',    accountType: 'personal', isVariable: false },
  { label: 'Sbonga Transport',  amount: 60000,   category: 'family',    accountType: 'personal', isVariable: false },
  { label: 'Nhloso Support',    amount: 250000,  category: 'family',    accountType: 'personal', isVariable: false },
  { label: 'Spouse Support',    amount: 700000,  category: 'family',    accountType: 'personal', isVariable: true  },
  { label: 'Round ka Gogo',     amount: 150000,  category: 'family',    accountType: 'personal', isVariable: true  },
  // Health
  { label: 'Medical Aid',       amount: 600000,  category: 'health',    accountType: 'personal', isVariable: false },
  // Savings
  { label: 'Emergency',         amount: 100000,  category: 'savings',   accountType: 'personal', isVariable: false },
  { label: 'Byte Fusion',       amount: 300000,  category: 'savings',   accountType: 'business', isVariable: false },
  // Utilities
  { label: 'Fibre',             amount: 100000,  category: 'utilities', accountType: 'personal', isVariable: false },
  { label: 'Mweb',              amount: 30000,   category: 'utilities', accountType: 'personal', isVariable: false },
  { label: 'DSTV',              amount: 48000,   category: 'utilities', accountType: 'personal', isVariable: false },
  // Business
  { label: 'PAYE',              amount: 180000,  category: 'business',  accountType: 'business', isVariable: true  },
  { label: 'Accounting Fees',   amount: 390000,  category: 'business',  accountType: 'business', isVariable: true  },
  { label: 'Bank Charges',      amount: 40000,   category: 'business',  accountType: 'business', isVariable: true  },
  { label: 'Claude',            amount: 40000,   category: 'business',  accountType: 'business', isVariable: false },
  // Lifestyle
  { label: 'Grocery',           amount: 400000,  category: 'lifestyle', accountType: 'personal', isVariable: true  },
  { label: 'Entertainment',     amount: 300000,  category: 'lifestyle', accountType: 'personal', isVariable: true  },
  { label: 'Markham',           amount: 100000,  category: 'lifestyle', accountType: 'personal', isVariable: true  },
];

// ---------------------------------------------------------------------------
// MONTHLY DATA - amounts in cents, status, and one-offs
// ---------------------------------------------------------------------------
const MONTHS = {
  '2026-01': {
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    status: 'closed',
    items: {
      'Bond':              { status: 'paid', amount: 900000 },
      'Medical Aid':       { status: 'upcoming' },
      'Car Insurance':     { status: 'upcoming', amount: 400000 },
      'Car Track':         { status: 'paid', amount: 18000 },
      'Levies':            { status: 'paid', amount: 170000 },
      'Rates':             { status: 'paid', amount: 50000 },
      'Family Support':    { status: 'paid' },
      'Grocery':           { status: 'paid' },
      'Sbonga Fees':       { status: 'paid' },
      'Sbonga Transport':  { status: 'paid' },
      'Nhloso Support':    { status: 'paid' },
      'Emergency':         { status: 'upcoming' },
      'Bank Charges':      { status: 'paid' },
      'Byte Fusion':       { status: 'paid' },
      'Spouse Support':    { status: 'paid' },
      'Electricity':       { status: 'paid' },
      'Petrol':            { status: 'paid' },
      'Fibre':             { status: 'paid' },
      'Mweb':              { status: 'paid' },
      'DSTV':              { status: 'paid' },
      'PAYE':              { status: 'paid', amount: 320000 },
      'Accounting Fees':   { status: 'paid' },
      'Entertainment':     { status: 'upcoming' },
      'Claude':            { status: 'paid' },
      'Round ka Gogo':     { status: 'paid', amount: 100000 },
      'Markham':           { status: 'paid' },
    },
    oneOffs: [],
  },
  '2026-02': {
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    status: 'closed',
    items: {
      'Bond':              { status: 'paid' },
      'Medical Aid':       { status: 'paid' },
      'Car Insurance':     { status: 'paid', amount: 404800 },
      'Car Track':         { status: 'paid', amount: 18000 },
      'Levies':            { status: 'paid', amount: 130000 },
      'Rates':             { status: 'paid' },
      'Family Support':    { status: 'paid' },
      'Grocery':           { status: 'paid' },
      'Sbonga Fees':       { status: 'paid' },
      'Sbonga Transport':  { status: 'paid' },
      'Nhloso Support':    { status: 'paid' },
      'Emergency':         { status: 'upcoming' },
      'Bank Charges':      { status: 'paid' },
      'Byte Fusion':       { status: 'paid' },
      'Spouse Support':    { status: 'paid', amount: 750000 },
      'Electricity':       { status: 'paid' },
      'Petrol':            { status: 'paid' },
      'Fibre':             { status: 'paid' },
      'Mweb':              { status: 'paid' },
      'DSTV':              { status: 'paid' },
      'PAYE':              { status: 'paid' },
      'Accounting Fees':   { status: 'paid' },
      'Entertainment':     { status: 'paid' },
      'Claude':            { status: 'paid' },
      'Round ka Gogo':     { status: 'paid', amount: 200000 },
      'Markham':           { status: 'paid' },
    },
    oneOffs: [
      { label: 'Fridge', amount: 1500000, category: 'lifestyle', accountType: 'personal', status: 'paid' },
    ],
  },
  '2026-03': {
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    status: 'closed',
    items: {
      'Bond':              { status: 'paid' },
      'Medical Aid':       { status: 'paid' },
      'Car Insurance':     { status: 'paid', amount: 800000 },
      'Car Track':         { status: 'paid', amount: 23900 },
      'Levies':            { status: 'paid', amount: 130000 },
      'Rates':             { status: 'paid' },
      'Family Support':    { status: 'paid' },
      'Grocery':           { status: 'paid' },
      'Sbonga Fees':       { status: 'paid' },
      'Sbonga Transport':  { status: 'paid' },
      'Nhloso Support':    { status: 'paid' },
      'Emergency':         { status: 'paid' },
      'Bank Charges':      { status: 'paid' },
      'Byte Fusion':       { status: 'paid' },
      'Spouse Support':    { status: 'paid' },
      'Electricity':       { status: 'paid' },
      'Petrol':            { status: 'upcoming' },
      'Fibre':             { status: 'paid' },
      'Mweb':              { status: 'paid' },
      'DSTV':              { status: 'paid' },
      'PAYE':              { status: 'paid' },
      'Accounting Fees':   { status: 'paid', amount: 400000 },
      'Entertainment':     { status: 'paid' },
      'Claude':            { status: 'paid' },
      'Round ka Gogo':     { status: 'paid', amount: 280000 },
      'Markham':           { status: 'paid', amount: 150000 },
    },
    oneOffs: [
      { label: 'Shein', amount: 100000, category: 'lifestyle', accountType: 'personal', status: 'paid' },
      { label: 'Unisa', amount: 300000, category: 'education', accountType: 'personal', status: 'paid' },
      { label: 'Zuzu Travel', amount: 250000, category: 'lifestyle', accountType: 'personal', status: 'paid' },
      { label: 'Trip to KZN', amount: 500000, category: 'lifestyle', accountType: 'personal', status: 'paid' },
      { label: 'Golden Horse Trip', amount: 200000, category: 'lifestyle', accountType: 'personal', status: 'paid' },
    ],
  },
  '2026-04': {
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    status: 'active',  // Current month!
    items: {
      'Bond':              { status: 'upcoming' },
      'Medical Aid':       { status: 'upcoming' },
      'Car Insurance':     { status: 'upcoming', amount: 400000 },
      'Car Track':         { status: 'upcoming', amount: 23900 },
      'Levies':            { status: 'upcoming', amount: 170000 },
      'Rates':             { status: 'upcoming' },
      'Family Support':    { status: 'upcoming' },
      'Grocery':           { status: 'upcoming' },
      'Sbonga Fees':       { status: 'upcoming' },
      'Sbonga Transport':  { status: 'upcoming' },
      'Nhloso Support':    { status: 'upcoming' },
      'Emergency':         { status: 'upcoming' },
      'Bank Charges':      { status: 'upcoming' },
      'Byte Fusion':       { status: 'upcoming' },
      'Spouse Support':    { status: 'upcoming' },
      'Electricity':       { status: 'upcoming' },
      'Petrol':            { status: 'upcoming' },
      'Fibre':             { status: 'upcoming' },
      'Mweb':              { status: 'upcoming' },
      'DSTV':              { status: 'upcoming' },
      'PAYE':              { status: 'upcoming' },
      'Accounting Fees':   { status: 'upcoming' },
      'Entertainment':     { status: 'upcoming' },
      'Claude':            { status: 'upcoming' },
      'Round ka Gogo':     { status: 'upcoming', amount: 100000 },
      'Markham':           { status: 'upcoming' },
    },
    oneOffs: [
      { label: "Mother's Day", amount: 130000, category: 'family', accountType: 'personal', status: 'upcoming' },
    ],
  },
};

// ---------------------------------------------------------------------------
// SEED FUNCTIONS
// ---------------------------------------------------------------------------

async function resetAll() {
  console.log('🗑  Resetting all data...\n');

  // Delete all cycles and their items
  for (const cycleId of Object.keys(MONTHS)) {
    try {
      const { items } = await get(`/api/cycle-items?cycleId=${cycleId}`);
      for (const item of items || []) {
        await del(`/api/cycle-items/${item.id}`);
      }
      await del(`/api/cycles/${cycleId}`);
      console.log(`  ✓ Deleted cycle ${cycleId}`);
    } catch {
      // Cycle doesn't exist
    }
  }

  // Delete all commitments
  try {
    const { commitments } = await get('/api/commitments');
    for (const c of commitments || []) {
      await del(`/api/commitments/${c.id}`);
    }
    console.log(`  ✓ Deleted ${commitments?.length || 0} commitments`);
  } catch {
    // No commitments
  }

  console.log('');
}

async function seedCommitments() {
  console.log('📋 Creating commitments...');

  const { commitments: existing } = await get('/api/commitments');
  const existingLabels = new Set((existing || []).map(c => c.label));

  let created = 0;
  for (let i = 0; i < COMMITMENTS.length; i++) {
    const c = COMMITMENTS[i];
    if (existingLabels.has(c.label)) continue;

    try {
      await post('/api/commitments', { ...c, sortOrder: i, isActive: true });
      console.log(`  ✓ ${c.label}`);
      created++;
    } catch (err) {
      console.error(`  ✗ ${c.label}: ${err.message}`);
    }
  }

  console.log(`  → ${created} created, ${COMMITMENTS.length - created} already exist\n`);
}

async function seedCycle(cycleId, data) {
  console.log(`📅 Seeding ${cycleId}...`);

  // Check if cycle exists
  const { cycles } = await get('/api/cycles');
  const exists = (cycles || []).some(c => c.id === cycleId);

  if (!exists) {
    await post('/api/cycles', {
      id: cycleId,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status,
    });
    console.log(`  ✓ Cycle created (${data.status})`);
  } else {
    console.log(`  → Cycle exists`);
  }

  // Get cycle items
  const { items } = await get(`/api/cycle-items?cycleId=${cycleId}`);
  const itemMap = new Map((items || []).map(i => [i.label, i]));

  // Update commitment-based items
  let updated = 0;
  for (const [label, itemData] of Object.entries(data.items)) {
    const item = itemMap.get(label);
    if (!item) continue;

    const updates = {};
    if (itemData.status !== item.status) updates.status = itemData.status;
    if (itemData.amount && itemData.amount !== item.amount) updates.amount = itemData.amount;

    if (Object.keys(updates).length > 0) {
      await patch(`/api/cycle-items/${item.id}`, updates);
      updated++;
    }
  }

  // Add one-offs
  const existingLabels = new Set((items || []).map(i => i.label));
  for (const oneOff of data.oneOffs || []) {
    if (existingLabels.has(oneOff.label)) continue;

    await post('/api/cycle-items', { cycleId, ...oneOff });
    console.log(`  + ${oneOff.label} (one-off)`);
  }

  console.log(`  → ${updated} items updated\n`);
}

async function seed() {
  console.log('🌱 Seeding 2026 data (Jan-Apr)...\n');

  if (RESET) {
    await resetAll();
  }

  await seedCommitments();

  for (const [cycleId, data] of Object.entries(MONTHS)) {
    await seedCycle(cycleId, data);
  }

  console.log('🎉 Done! Open http://localhost:3000 to see your data.');
  console.log('   April 2026 is the active cycle with all items unpaid.');
}

seed().catch(err => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
