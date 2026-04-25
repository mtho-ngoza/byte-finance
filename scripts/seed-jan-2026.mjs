/**
 * Seed script: January 2026 commitments + cycle
 *
 * Usage:
 *   node scripts/seed-jan-2026.mjs          # skip existing, only add missing
 *   node scripts/seed-jan-2026.mjs --reset  # delete all commitments + cycle first, then reseed
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
// Commitments — amounts in cents
// ---------------------------------------------------------------------------
const COMMITMENTS = [
  // Housing
  { label: 'Bond',              amount: 805000,  category: 'housing',   accountType: 'personal', isVariable: false },
  { label: 'Levies',            amount: 142843,  category: 'housing',   accountType: 'personal', isVariable: false },
  { label: 'Rates',             amount: 50959,   category: 'housing',   accountType: 'personal', isVariable: false },
  { label: 'Electricity',       amount: 139130,  category: 'housing',   accountType: 'personal', isVariable: true  },
  // Transport
  { label: 'Car Insurance',     amount: 133304,  category: 'transport', accountType: 'personal', isVariable: false },
  { label: 'Car Track',         amount: 23900,   category: 'transport', accountType: 'personal', isVariable: false },
  { label: 'Car Natis Reg',     amount: 39600,   category: 'transport', accountType: 'personal', isVariable: false },
  { label: 'Petrol',            amount: 342100,  category: 'transport', accountType: 'personal', isVariable: true  },
  { label: 'Travel Tollgate',   amount: 41200,   category: 'transport', accountType: 'personal', isVariable: true  },
  // Family
  { label: 'Family Support',    amount: 200000,  category: 'family',    accountType: 'personal', isVariable: false },
  { label: 'Sbonga Fees',       amount: 200000,  category: 'family',    accountType: 'personal', isVariable: false },
  { label: 'Sbonga Transport',  amount: 57000,   category: 'family',    accountType: 'personal', isVariable: false },
  { label: 'Nhloso Support',    amount: 250000,  category: 'family',    accountType: 'personal', isVariable: false },
  { label: 'Spouse Support',    amount: 700000,  category: 'family',    accountType: 'personal', isVariable: false },
  { label: 'Round ka Gogo',     amount: 100000,  category: 'family',    accountType: 'personal', isVariable: true  },
  // Health & Savings
  { label: 'Medical Aid',       amount: 600000,  category: 'health',    accountType: 'personal', isVariable: false },
  { label: 'Emergency',         amount: 100000,  category: 'savings',   accountType: 'personal', isVariable: false },
  // Utilities
  { label: 'Fibre',             amount: 82609,   category: 'utilities', accountType: 'personal', isVariable: false },
  { label: 'Mweb',              amount: 21652,   category: 'utilities', accountType: 'personal', isVariable: false },
  { label: 'DSTV',              amount: 50900,   category: 'utilities', accountType: 'personal', isVariable: false },
  { label: 'Airtime + Data',    amount: 43043,   category: 'utilities', accountType: 'personal', isVariable: true  },
  // Business
  { label: 'PAYE',              amount: 179476,  category: 'business',  accountType: 'business', isVariable: false },
  { label: 'Accounting Fees',   amount: 346600,  category: 'business',  accountType: 'business', isVariable: false },
  { label: 'Bank Charges',      amount: 33900,   category: 'business',  accountType: 'business', isVariable: false },
  { label: 'Byte Fusion',       amount: 150000,  category: 'savings',   accountType: 'business', isVariable: false },
  { label: 'Claude',            amount: 33920,   category: 'utilities', accountType: 'business', isVariable: false },
  { label: 'Computer Expenses', amount: 40100,   category: 'business',  accountType: 'business', isVariable: true  },
  { label: 'Diamatrix',         amount: 6000,    category: 'business',  accountType: 'business', isVariable: false },
  { label: 'AWS',               amount: 192,     category: 'business',  accountType: 'business', isVariable: true  },
  { label: 'Printer Ink',       amount: 124300,  category: 'business',  accountType: 'business', isVariable: true  },
  // Lifestyle
  { label: 'Grocery',           amount: 400000,  category: 'lifestyle', accountType: 'personal', isVariable: true  },
  { label: 'Entertainment',     amount: 245400,  category: 'lifestyle', accountType: 'personal', isVariable: true  },
  { label: 'Markham',           amount: 100000,  category: 'lifestyle', accountType: 'personal', isVariable: true  },
  // Education
  { label: 'Unisa',             amount: 300000,  category: 'education', accountType: 'personal', isVariable: false },
];

// January 2026 paid status ([v] = paid, [ ] = upcoming)
const JAN_STATUS = {
  'Bond':              'paid',
  'Levies':            'paid',
  'Rates':             'paid',
  'Electricity':       'paid',
  'Car Insurance':     'upcoming',
  'Car Track':         'paid',
  'Car Natis Reg':     'paid',
  'Petrol':            'paid',
  'Travel Tollgate':   'paid',
  'Family Support':    'paid',
  'Sbonga Fees':       'paid',
  'Sbonga Transport':  'paid',
  'Nhloso Support':    'paid',
  'Spouse Support':    'paid',
  'Round ka Gogo':     'paid',
  'Medical Aid':       'upcoming',
  'Emergency':         'upcoming',
  'Fibre':             'paid',
  'Mweb':              'paid',
  'DSTV':              'paid',
  'Airtime + Data':    'paid',
  'PAYE':              'paid',
  'Accounting Fees':   'paid',
  'Bank Charges':      'paid',
  'Byte Fusion':       'paid',
  'Claude':            'paid',
  'Computer Expenses': 'paid',
  'Diamatrix':         'paid',
  'AWS':               'paid',
  'Printer Ink':       'paid',
  'Grocery':           'paid',
  'Entertainment':     'upcoming',
  'Markham':           'paid',
  'Unisa':             'paid',
};

async function seed() {
  console.log(`🌱 Seeding January 2026 ${RESET ? '(RESET mode)' : '(skip-existing mode)'}...\n`);

  // ── RESET: delete existing commitments and cycle ──────────────────────────
  if (RESET) {
    console.log('🗑  Deleting existing commitments...');
    const { commitments: existing } = await get('/api/commitments');
    for (const c of existing) {
      await del(`/api/commitments/${c.id}`);
      process.stdout.write('.');
    }
    console.log(` deleted ${existing.length}\n`);

    console.log('🗑  Deleting cycle 2026-01 items...');
    try {
      const { items } = await get('/api/cycle-items?cycleId=2026-01');
      for (const item of items) {
        await del(`/api/cycle-items/${item.id}`);
        process.stdout.write('.');
      }
      console.log(` deleted ${items.length} items`);
      await del('/api/cycles/2026-01');
      console.log('  ✓ Cycle deleted\n');
    } catch {
      console.log('  (no cycle to delete)\n');
    }
  }

  // ── COMMITMENTS: skip existing labels ────────────────────────────────────
  console.log('📋 Creating commitments...');
  const { commitments: existing } = await get('/api/commitments');
  const existingLabels = new Set(existing.map(c => c.label));

  let created = 0, skipped = 0;
  for (let i = 0; i < COMMITMENTS.length; i++) {
    const c = COMMITMENTS[i];
    if (existingLabels.has(c.label)) {
      skipped++;
      continue;
    }
    try {
      await post('/api/commitments', { ...c, sortOrder: i });
      console.log(`  ✓ ${c.label.padEnd(22)} R${(c.amount / 100).toFixed(2)}`);
      created++;
    } catch (err) {
      console.error(`  ✗ ${c.label}: ${err.message}`);
    }
  }
  console.log(`  → ${created} created, ${skipped} skipped (already exist)\n`);

  // ── CYCLE: skip if already exists ────────────────────────────────────────
  console.log('📅 Creating January 2026 cycle...');
  const { cycles } = await get('/api/cycles');
  const cycleExists = cycles.some(c => c.id === '2026-01');

  if (cycleExists) {
    console.log('  → Cycle 2026-01 already exists, skipping creation\n');
  } else {
    try {
      await post('/api/cycles', {
        id: '2026-01',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });
      console.log('  ✓ Cycle 2026-01 created\n');
    } catch (err) {
      console.error('  ✗ Cycle failed:', err.message);
      process.exit(1);
    }
  }

  // ── STATUSES ──────────────────────────────────────────────────────────────
  console.log('🔄 Setting item statuses...');
  const { items } = await get('/api/cycle-items?cycleId=2026-01');

  let paid = 0, pending = 0;
  for (const item of items) {
    const status = JAN_STATUS[item.label] ?? 'upcoming';
    if (status === 'paid' && item.status !== 'paid') {
      try {
        await patch(`/api/cycle-items/${item.id}`, { status: 'paid' });
        paid++;
      } catch (err) {
        console.error(`  ✗ ${item.label}: ${err.message}`);
      }
    } else {
      pending++;
    }
  }

  console.log(`  ✓ ${paid} marked paid, ${pending} left as upcoming`);
  console.log('\n🎉 Done! Open http://localhost:3000 to see January 2026.');
}

seed().catch(err => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
