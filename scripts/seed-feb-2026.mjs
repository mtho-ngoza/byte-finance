/**
 * Seed script: February 2026 cycle
 *
 * Usage:
 *   node scripts/seed-feb-2026.mjs          # create FEB cycle with items
 *   node scripts/seed-feb-2026.mjs --reset  # delete FEB cycle first, then reseed
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

// February 2026 data: { status, amount in cents (if different from commitment) }
const FEB_DATA = {
  'Bond':              { status: 'paid', amount: 900000 },
  'Medical Aid':       { status: 'paid', amount: 600000 },
  'Car Insurance':     { status: 'paid', amount: 404800 },
  'Car Track':         { status: 'paid', amount: 18000 },
  'Levies':            { status: 'paid', amount: 130000 },
  'Rates':             { status: 'paid', amount: 50000 },
  'Family Support':    { status: 'paid', amount: 200000 },
  'Grocery':           { status: 'paid', amount: 400000 },
  'Sbonga Fees':       { status: 'paid', amount: 200000 },
  'Sbonga Transport':  { status: 'paid', amount: 60000 },
  'Nhloso Support':    { status: 'paid', amount: 250000 },
  'Emergency':         { status: 'upcoming', amount: 100000 },
  'Bank Charges':      { status: 'paid', amount: 40000 },
  'Byte Fusion':       { status: 'paid', amount: 300000 },
  'Spouse Support':    { status: 'paid', amount: 750000 },
  'Electricity':       { status: 'paid', amount: 150000 },
  'Petrol':            { status: 'paid', amount: 250000 },
  'Fibre':             { status: 'paid', amount: 100000 },
  'Mweb':              { status: 'paid', amount: 30000 },
  'DSTV':              { status: 'paid', amount: 48000 },
  'PAYE':              { status: 'paid', amount: 180000 },
  'Accounting Fees':   { status: 'paid', amount: 390000 },
  'Entertainment':     { status: 'paid', amount: 300000 },
  'Claude':            { status: 'paid', amount: 40000 },
  'Round ka Gogo':     { status: 'paid', amount: 200000 },
  'Markham':           { status: 'paid', amount: 100000 },
  // Items not in FEB list - skip or mark upcoming
  'Car Natis Reg':     { status: 'skipped' },
  'Travel Tollgate':   { status: 'skipped' },
  'Unisa':             { status: 'skipped' },
  'Airtime + Data':    { status: 'skipped' },
  'Computer Expenses': { status: 'skipped' },
  'Diamatrix':         { status: 'skipped' },
  'AWS':               { status: 'skipped' },
  'Printer Ink':       { status: 'skipped' },
};

// One-off items for February
const ONE_OFF_ITEMS = [
  { label: 'Fridge', amount: 1500000, category: 'lifestyle', accountType: 'personal', status: 'paid' },
];

async function seed() {
  console.log(`🌱 Seeding February 2026 ${RESET ? '(RESET mode)' : ''}...\n`);

  // ── RESET: delete existing FEB cycle ──────────────────────────────────
  if (RESET) {
    console.log('🗑  Deleting cycle 2026-02 items...');
    try {
      const { items } = await get('/api/cycle-items?cycleId=2026-02');
      for (const item of items) {
        await del(`/api/cycle-items/${item.id}`);
        process.stdout.write('.');
      }
      console.log(` deleted ${items.length} items`);
      await del('/api/cycles/2026-02');
      console.log('  ✓ Cycle deleted\n');
    } catch {
      console.log('  (no cycle to delete)\n');
    }
  }

  // ── Check commitments exist ────────────────────────────────────────────
  const { commitments } = await get('/api/commitments');
  if (commitments.length === 0) {
    console.error('❌ No commitments found. Run seed-jan-2026.mjs first.');
    process.exit(1);
  }
  console.log(`📋 Found ${commitments.length} commitments\n`);

  // ── CYCLE: skip if already exists ────────────────────────────────────────
  console.log('📅 Creating February 2026 cycle...');
  const { cycles } = await get('/api/cycles');
  const cycleExists = cycles.some(c => c.id === '2026-02');

  if (cycleExists && !RESET) {
    console.log('  → Cycle 2026-02 already exists, skipping creation\n');
  } else {
    try {
      await post('/api/cycles', {
        id: '2026-02',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });
      console.log('  ✓ Cycle 2026-02 created\n');
    } catch (err) {
      console.error('  ✗ Cycle failed:', err.message);
      process.exit(1);
    }
  }

  // ── UPDATE ITEMS: status and amounts ──────────────────────────────────────
  console.log('🔄 Updating item statuses and amounts...');
  const { items } = await get('/api/cycle-items?cycleId=2026-02');

  let updated = 0, skipped = 0;
  for (const item of items) {
    const data = FEB_DATA[item.label];
    if (!data) {
      console.log(`  ? ${item.label} - no FEB data, leaving as-is`);
      continue;
    }

    const updates = {};
    if (data.status && data.status !== item.status) {
      updates.status = data.status;
    }
    if (data.amount && data.amount !== item.amount) {
      updates.amount = data.amount;
    }

    if (Object.keys(updates).length > 0) {
      try {
        await patch(`/api/cycle-items/${item.id}`, updates);
        const amtStr = updates.amount ? ` R${(updates.amount / 100).toFixed(2)}` : '';
        console.log(`  ✓ ${item.label.padEnd(20)} ${updates.status || item.status}${amtStr}`);
        updated++;
      } catch (err) {
        console.error(`  ✗ ${item.label}: ${err.message}`);
      }
    } else {
      skipped++;
    }
  }
  console.log(`  → ${updated} updated, ${skipped} unchanged\n`);

  // ── ADD ONE-OFF ITEMS ──────────────────────────────────────────────────
  if (ONE_OFF_ITEMS.length > 0) {
    console.log('➕ Adding one-off items...');
    const existingLabels = new Set(items.map(i => i.label));

    for (const item of ONE_OFF_ITEMS) {
      if (existingLabels.has(item.label)) {
        console.log(`  → ${item.label} already exists, skipping`);
        continue;
      }
      try {
        await post('/api/cycle-items', {
          cycleId: '2026-02',
          ...item,
        });
        console.log(`  ✓ ${item.label} R${(item.amount / 100).toFixed(2)}`);
      } catch (err) {
        console.error(`  ✗ ${item.label}: ${err.message}`);
      }
    }
    console.log('');
  }

  console.log('🎉 Done! Open http://localhost:3000 to see February 2026.');
}

seed().catch(err => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
