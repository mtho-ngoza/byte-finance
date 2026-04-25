/**
 * Seed script: January 2026 commitments + cycle
 * Run in browser console at http://localhost:3000
 *
 * Usage:
 *   1. Open http://localhost:3000 in browser
 *   2. Open DevTools console (F12)
 *   3. Paste this entire script and press Enter
 */

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${url} failed: ${err}`);
  }
  return res.json();
}

async function patch(url, body) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${url} failed`);
  return res.json();
}

// ---------------------------------------------------------------------------
// COMMITMENTS
// Amounts in cents (R1 = 100 cents)
// ---------------------------------------------------------------------------

const COMMITMENTS = [
  // Housing
  { label: 'Bond',          amount: 805000,  category: 'housing',   accountType: 'personal', isVariable: false },
  { label: 'Levies',        amount: 142843,  category: 'housing',   accountType: 'personal', isVariable: false },
  { label: 'Rates',         amount: 50959,   category: 'housing',   accountType: 'personal', isVariable: false },
  { label: 'Electricity',   amount: 139130,  category: 'housing',   accountType: 'personal', isVariable: true  },

  // Transport
  { label: 'Car Insurance', amount: 133304,  category: 'transport', accountType: 'personal', isVariable: false },
  { label: 'Car Track',     amount: 23900,   category: 'transport', accountType: 'personal', isVariable: false },
  { label: 'Car Natis Reg', amount: 39600,   category: 'transport', accountType: 'personal', isVariable: false },
  { label: 'Petrol',        amount: 342100,  category: 'transport', accountType: 'personal', isVariable: true  },
  { label: 'Travel Tollgate', amount: 41200, category: 'transport', accountType: 'personal', isVariable: true  },

  // Family
  { label: 'Family Support',   amount: 200000, category: 'family', accountType: 'personal', isVariable: false },
  { label: 'Sbonga Fees',      amount: 200000, category: 'family', accountType: 'personal', isVariable: false },
  { label: 'Sbonga Transport', amount: 57000,  category: 'family', accountType: 'personal', isVariable: false },
  { label: 'Nhloso Support',   amount: 250000, category: 'family', accountType: 'personal', isVariable: false },
  { label: 'Spouse Support',   amount: 700000, category: 'family', accountType: 'personal', isVariable: false },
  { label: 'Round ka Gogo',    amount: 100000, category: 'family', accountType: 'personal', isVariable: true  },

  // Health
  { label: 'Medical Aid', amount: 600000, category: 'health', accountType: 'personal', isVariable: false },
  { label: 'Emergency',   amount: 100000, category: 'savings', accountType: 'personal', isVariable: false },

  // Utilities
  { label: 'Fibre',        amount: 82609,  category: 'utilities', accountType: 'personal', isVariable: false },
  { label: 'Mweb',         amount: 21652,  category: 'utilities', accountType: 'personal', isVariable: false },
  { label: 'DSTV',         amount: 50900,  category: 'utilities', accountType: 'personal', isVariable: false },
  { label: 'Airtime + Data', amount: 43043, category: 'utilities', accountType: 'personal', isVariable: true },

  // Business
  { label: 'PAYE',             amount: 179476, category: 'business', accountType: 'business', isVariable: false },
  { label: 'Accounting Fees',  amount: 346600, category: 'business', accountType: 'business', isVariable: false },
  { label: 'Bank Charges',     amount: 33900,  category: 'business', accountType: 'business', isVariable: false },
  { label: 'Byte Fusion',      amount: 150000, category: 'savings',  accountType: 'business', isVariable: false },
  { label: 'Claude',           amount: 33920,  category: 'utilities', accountType: 'business', isVariable: false },
  { label: 'Computer Expenses', amount: 40100, category: 'business', accountType: 'business', isVariable: true  },
  { label: 'Diamatrix',        amount: 6000,   category: 'business', accountType: 'business', isVariable: false },
  { label: 'AWS',              amount: 192,    category: 'business', accountType: 'business', isVariable: true  },
  { label: 'Printer Ink',      amount: 124300, category: 'business', accountType: 'business', isVariable: true  },

  // Lifestyle
  { label: 'Grocery',          amount: 400000, category: 'lifestyle', accountType: 'personal', isVariable: true  },
  { label: 'Entertainment',    amount: 245400, category: 'lifestyle', accountType: 'personal', isVariable: true  },
  { label: 'Markham',          amount: 100000, category: 'lifestyle', accountType: 'personal', isVariable: true  },

  // Education
  { label: 'Unisa', amount: 300000, category: 'education', accountType: 'personal', isVariable: false },
];

// January 2026 specific overrides (items that differ from commitment defaults)
// These will be applied as cycle item patches after cycle creation
const JAN_OVERRIDES = {
  // All amounts match the Sage/exact values above — no overrides needed for Jan
  // Add here if any Jan amount differs from the commitment default
};

// January 2026 paid status from your notes
// [v] = paid, [ ] = pending
const JAN_STATUS = {
  'Bond':             'paid',
  'Levies':           'paid',
  'Rates':            'paid',
  'Electricity':      'paid',
  'Car Insurance':    'upcoming',  // [ ] in Jan notes
  'Car Track':        'paid',
  'Car Natis Reg':    'paid',
  'Petrol':           'paid',
  'Travel Tollgate':  'paid',
  'Family Support':   'paid',
  'Sbonga Fees':      'paid',
  'Sbonga Transport': 'paid',
  'Nhloso Support':   'paid',
  'Spouse Support':   'paid',
  'Round ka Gogo':    'paid',
  'Medical Aid':      'upcoming',  // [ ] in Jan notes
  'Emergency':        'upcoming',  // [ ] in Jan notes
  'Fibre':            'paid',
  'Mweb':             'paid',
  'DSTV':             'paid',
  'Airtime + Data':   'paid',
  'PAYE':             'paid',
  'Accounting Fees':  'paid',
  'Bank Charges':     'paid',
  'Byte Fusion':      'paid',
  'Claude':           'paid',
  'Computer Expenses':'paid',
  'Diamatrix':        'paid',
  'AWS':              'paid',
  'Printer Ink':      'paid',
  'Grocery':          'paid',
  'Entertainment':    'upcoming',  // [ ] in Jan notes
  'Markham':          'paid',
  'Unisa':            'paid',
};

// ---------------------------------------------------------------------------
// SEED FUNCTION
// ---------------------------------------------------------------------------

async function seed() {
  console.log('🌱 Starting seed...');

  // Step 1: Create commitments
  console.log('📋 Creating commitments...');
  const createdCommitments = [];

  for (let i = 0; i < COMMITMENTS.length; i++) {
    const c = COMMITMENTS[i];
    try {
      const result = await post('/api/commitments', { ...c, sortOrder: i });
      createdCommitments.push({ ...result, label: c.label });
      console.log(`  ✓ ${c.label} — R${(c.amount / 100).toFixed(2)}`);
    } catch (err) {
      console.error(`  ✗ ${c.label}:`, err.message);
    }
  }

  console.log(`\n✅ Created ${createdCommitments.length} commitments`);

  // Step 2: Create January 2026 cycle
  console.log('\n📅 Creating January 2026 cycle...');
  let cycle;
  try {
    cycle = await post('/api/cycles', {
      id: '2026-01',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    console.log('  ✓ Cycle 2026-01 created');
  } catch (err) {
    console.error('  ✗ Cycle creation failed:', err.message);
    return;
  }

  // Step 3: Fetch cycle items and update status
  console.log('\n🔄 Updating item statuses...');
  const itemsRes = await fetch('/api/cycle-items?cycleId=2026-01');
  const { items } = await itemsRes.json();

  let updated = 0;
  for (const item of items) {
    const status = JAN_STATUS[item.label];
    if (status && status !== 'upcoming') {
      try {
        await patch(`/api/cycle-items/${item.id}`, {
          status,
          paidDate: status === 'paid' ? new Date('2026-01-31').toISOString() : null,
        });
        updated++;
        console.log(`  ✓ ${item.label} → ${status}`);
      } catch (err) {
        console.error(`  ✗ ${item.label}:`, err.message);
      }
    }
  }

  console.log(`\n✅ Updated ${updated} item statuses`);
  console.log('\n🎉 Seed complete! Refresh the dashboard to see January 2026.');
  console.log('   Go to http://localhost:3000 to view the dashboard.');
}

// Run it
seed().catch(console.error);
