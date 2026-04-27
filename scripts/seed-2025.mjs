/**
 * Seed script: Full 2025 historical data (Jan-Dec)
 *
 * Usage:
 *   node scripts/seed-2025.mjs          # seed all data
 *   node scripts/seed-2025.mjs --reset  # delete 2025 data first, then reseed
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

// Helper to convert Rands to cents
const R = (amount) => Math.round(amount * 100);

// ---------------------------------------------------------------------------
// GOALS
// ---------------------------------------------------------------------------
const FOOTBALL_GENIC_GOAL = {
  name: 'Football Genic Investment',
  type: 'investment',
  targetAmount: R(40000),
  currentAmount: R(22000), // Starting principal
  monthlyTarget: R(2000),
  priority: 'medium',
  status: 'paused', // Now paused
  linkedCommitmentLabel: 'Football Genic',
};

// Byte Fusion goal already exists from 2026 - we just link to it
const BYTE_FUSION_GOAL_NAME = 'Byte Fusion Business';

// ---------------------------------------------------------------------------
// COMMITMENTS - 2025 recurring items (different from 2026)
// ---------------------------------------------------------------------------
const COMMITMENTS = [
  // Housing
  { label: 'Bond',              amount: R(8050),   category: 'housing',   accountType: 'personal', isVariable: false },
  { label: 'Levies',            amount: R(1359),   category: 'housing',   accountType: 'business', isVariable: true },
  { label: 'Rates',             amount: R(500),    category: 'housing',   accountType: 'business', isVariable: false },
  { label: 'Electricity',       amount: R(1500),   category: 'housing',   accountType: 'business', isVariable: true },
  // Transport
  { label: 'Car Installment',   amount: R(9200),   category: 'transport', accountType: 'personal', isVariable: false },
  { label: 'Car Insurance',     amount: R(1495),   category: 'transport', accountType: 'business', isVariable: false },
  { label: 'Car Track',         amount: R(180),    category: 'transport', accountType: 'personal', isVariable: false },
  { label: 'Petrol',            amount: R(2500),   category: 'transport', accountType: 'business', isVariable: true },
  // Family
  { label: 'Family Support',    amount: R(2000),   category: 'family',    accountType: 'personal', isVariable: false },
  { label: 'Sbonga Support',    amount: R(2000),   category: 'family',    accountType: 'personal', isVariable: false },
  { label: 'Nhloso Support',    amount: R(2000),   category: 'family',    accountType: 'personal', isVariable: false },
  { label: 'Spouse Support',    amount: R(3000),   category: 'family',    accountType: 'personal', isVariable: true },
  { label: 'Dec Transport Savings', amount: R(200), category: 'family',   accountType: 'personal', isVariable: false },
  // Health
  { label: 'Medical Aid',       amount: R(6000),   category: 'health',    accountType: 'personal', isVariable: false },
  { label: 'Phone Insurance',   amount: R(280),    category: 'health',    accountType: 'personal', isVariable: false },
  // Savings
  { label: 'Emergency',         amount: R(1000),   category: 'savings',   accountType: 'personal', isVariable: true },
  { label: 'Dec Savings',       amount: R(300),    category: 'savings',   accountType: 'personal', isVariable: false },
  { label: 'Football Genic',    amount: R(2000),   category: 'savings',   accountType: 'personal', isVariable: false },
  { label: 'Stokfel',           amount: R(2000),   category: 'savings',   accountType: 'personal', isVariable: false },
  { label: 'Byte Fusion',       amount: R(1500),   category: 'savings',   accountType: 'business', isVariable: false },
  // Utilities
  { label: 'Phone Contract',    amount: R(2100),   category: 'utilities', accountType: 'personal', isVariable: true },
  { label: 'Fibre',             amount: R(950),    category: 'utilities', accountType: 'business', isVariable: false },
  { label: 'Mweb',              amount: R(200),    category: 'utilities', accountType: 'business', isVariable: true },
  { label: 'Rain',              amount: R(285),    category: 'utilities', accountType: 'business', isVariable: false },
  { label: 'DSTV',              amount: R(479),    category: 'utilities', accountType: 'personal', isVariable: true },
  { label: 'Airtime',           amount: R(200),    category: 'utilities', accountType: 'personal', isVariable: true },
  { label: 'Amazon',            amount: R(80),     category: 'utilities', accountType: 'business', isVariable: true },
  { label: 'Claude',            amount: R(350),    category: 'utilities', accountType: 'business', isVariable: false },
  { label: 'Google',            amount: R(53),     category: 'utilities', accountType: 'business', isVariable: false },
  // Business
  { label: 'PAYE',              amount: R(1400),   category: 'business',  accountType: 'business', isVariable: true },
  { label: 'Accounting Fees',   amount: R(2915),   category: 'business',  accountType: 'business', isVariable: false },
  { label: 'Bank Charges',      amount: R(400),    category: 'business',  accountType: 'business', isVariable: true },
  // Lifestyle
  { label: 'Grocery',           amount: R(4000),   category: 'lifestyle', accountType: 'personal', isVariable: true },
  { label: 'Entertainment',     amount: R(4000),   category: 'lifestyle', accountType: 'personal', isVariable: true },
  { label: 'Markham',           amount: R(1000),   category: 'lifestyle', accountType: 'personal', isVariable: true },
  // Education
  { label: 'Unisa Fees',        amount: R(2000),   category: 'education', accountType: 'business', isVariable: true },
];

// ---------------------------------------------------------------------------
// MONTHLY DATA - All cycles closed, historical data
// ---------------------------------------------------------------------------
const MONTHS = {
  '2025-01': {
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    status: 'closed',
    items: {
      'Bond': { amount: R(8050) },
      'Car Installment': { amount: R(9200) },
      'Medical Aid': { amount: R(6000) },
      'Car Track': { amount: R(180) },
      'Levies': { amount: R(1359.04) },
      'Rates': { amount: R(500) },
      'Family Support': { amount: R(2000) },
      'Grocery': { amount: R(4000) },
      'Sbonga Support': { amount: R(2000) },
      'Nhloso Support': { amount: R(2000) },
      'Emergency': { amount: R(1000) },
      'Bank Charges': { amount: R(382) },
      'Dec Transport Savings': { amount: R(200) },
      'Dec Savings': { amount: R(300) },
      'Football Genic': { amount: R(2000) },
      'Markham': { amount: R(1000) },
      'Spouse Support': { amount: R(3000) },
      'Electricity': { amount: R(1200) },
      'Car Insurance': { amount: R(1495) },
      'Phone Contract': { amount: R(2056.80) },
      'Petrol': { amount: R(3459.12) },
      'Fibre': { amount: R(1399.53) },
      'DSTV': { amount: R(470) },
      'PAYE': { amount: R(3000) },
      'Accounting Fees': { amount: R(2915) },
      'Stokfel': { amount: R(2000) },
      'Airtime': { amount: R(100) },
      'Entertainment': { amount: R(4400) },
    },
    oneOffs: [
      { label: 'Unisa Fees', amount: R(7100), category: 'education', accountType: 'business' },
      { label: 'Phone Repair', amount: R(1800), category: 'utilities', accountType: 'personal' },
      { label: 'Rain', amount: R(285), category: 'utilities', accountType: 'business' },
      { label: 'Travel', amount: R(462), category: 'lifestyle', accountType: 'personal' },
    ],
  },

  '2025-02': {
    startDate: '2025-02-01',
    endDate: '2025-02-28',
    status: 'closed',
    items: {
      'Bond': { amount: R(8050) },
      'Car Installment': { amount: R(9200) },
      'Medical Aid': { amount: R(6000) },
      'Car Track': { amount: R(180) },
      'Levies': { amount: R(1359.04) },
      'Rates': { amount: R(500) },
      'Family Support': { amount: R(2000) },
      'Grocery': { amount: R(4000) },
      'Sbonga Support': { amount: R(2000) },
      'Nhloso Support': { amount: R(2000) },
      'Emergency': { amount: R(1000) },
      'Bank Charges': { amount: R(313) },
      'Dec Transport Savings': { amount: R(200) },
      'Dec Savings': { amount: R(300) },
      'Football Genic': { amount: R(2000) },
      'Markham': { amount: R(1000) },
      'Spouse Support': { amount: R(3000) },
      'Electricity': { amount: R(2000) },
      'Car Insurance': { amount: R(1533) },
      'Phone Contract': { amount: R(2214.73) },
      'Petrol': { amount: R(624.75) },
      'Airtime': { amount: R(790) },
      'Rain': { amount: R(285) },
      'Mweb': { amount: R(50.91) },
      'DSTV': { amount: R(40) },
      'PAYE': { amount: R(3000) },
      'Accounting Fees': { amount: R(2915) },
      'Stokfel': { amount: R(2000) },
      'Entertainment': { amount: R(5563.84) },
    },
    oneOffs: [
      { label: 'Car Service', amount: R(8700), category: 'transport', accountType: 'personal' },
      { label: 'Unisa Fees', amount: R(2000), category: 'education', accountType: 'business' },
      { label: 'Trip to KZN', amount: R(4000), category: 'lifestyle', accountType: 'personal' },
      { label: 'Spheko', amount: R(1000), category: 'family', accountType: 'personal' },
      { label: 'Unisa Book', amount: R(480), category: 'education', accountType: 'business' },
      { label: 'Nkalakatha', amount: R(900), category: 'lifestyle', accountType: 'personal' },
      { label: 'Zethu Loan', amount: R(900), category: 'family', accountType: 'personal' },
    ],
  },

  '2025-03': {
    startDate: '2025-03-01',
    endDate: '2025-03-31',
    status: 'closed',
    items: {
      'Bond': { amount: R(8050) },
      'Car Installment': { amount: R(9200) },
      'Medical Aid': { amount: R(6000) },
      'Car Track': { amount: R(180) },
      'Levies': { amount: R(1359.04) },
      'Rates': { amount: R(500) },
      'Family Support': { amount: R(2000) },
      'Grocery': { amount: R(4000) },
      'Sbonga Support': { amount: R(2000) },
      'Nhloso Support': { amount: R(2000) },
      'Emergency': { amount: R(1000) },
      'Bank Charges': { amount: R(401) },
      'Dec Transport Savings': { amount: R(200) },
      'Dec Savings': { amount: R(300) },
      'Football Genic': { amount: R(2000) },
      'Markham': { amount: R(1000) },
      'Spouse Support': { amount: R(3000) },
      'Electricity': { amount: R(1800) },
      'Car Insurance': { amount: R(1533) },
      'Phone Contract': { amount: R(2214.73) },
      'Petrol': { amount: R(624.75) },
      'Airtime': { amount: R(790) },
      'Rain': { amount: R(285) },
      'Mweb': { amount: R(50.91) },
      'DSTV': { amount: R(140) },
      'PAYE': { amount: R(1400) },
      'Accounting Fees': { amount: R(2915) },
      'Stokfel': { amount: R(2000) },
      'Entertainment': { amount: R(5563.84) },
    },
    oneOffs: [
      { label: 'Unisa Fees', amount: R(2000), category: 'education', accountType: 'business' },
      { label: 'Stepper', amount: R(1000), category: 'lifestyle', accountType: 'personal' },
      { label: 'Laptop SSD', amount: R(2200), category: 'business', accountType: 'business' },
      { label: 'Fibre Setup', amount: R(350), category: 'utilities', accountType: 'business' },
      { label: 'Camera and Headset', amount: R(550), category: 'business', accountType: 'business' },
      { label: 'Keke Loan', amount: R(150), category: 'family', accountType: 'personal' },
      { label: 'Car Maintenance', amount: R(3380), category: 'transport', accountType: 'personal' },
    ],
  },

  '2025-04': {
    startDate: '2025-04-01',
    endDate: '2025-04-30',
    status: 'closed',
    items: {
      'Bond': { amount: R(8050) },
      'Car Installment': { amount: R(9200) },
      'Medical Aid': { amount: R(6000) },
      'Car Track': { amount: R(180) },
      'Levies': { amount: R(1359.04) },
      'Rates': { amount: R(500) },
      'Family Support': { amount: R(2000) },
      'Grocery': { amount: R(4000) },
      'Sbonga Support': { amount: R(2000) },
      'Nhloso Support': { amount: R(2000) },
      'Emergency': { amount: R(1000) },
      'Bank Charges': { amount: R(401) },
      'Dec Transport Savings': { amount: R(200) },
      'Football Genic': { amount: R(2000) },
      'Markham': { amount: R(1000) },
      'Spouse Support': { amount: R(4000) },
      'Electricity': { amount: R(2000) },
      'Car Insurance': { amount: R(1495) },
      'Petrol': { amount: R(2515.90) },
      'Fibre': { amount: R(950) },
      'DSTV': { amount: R(150) },
      'PAYE': { amount: R(1400) },
      'Accounting Fees': { amount: R(2915) },
      'Stokfel': { amount: R(2000) },
      'Entertainment': { amount: R(5159.44) },
      'Airtime': { amount: R(130) },
    },
    oneOffs: [
      { label: 'Unisa Fees', amount: R(2000), category: 'education', accountType: 'business' },
      { label: 'Amazon', amount: R(78.98), category: 'utilities', accountType: 'business' },
      { label: 'Car Battery', amount: R(1700), category: 'transport', accountType: 'personal' },
      { label: 'Spheko Slu', amount: R(1000), category: 'family', accountType: 'personal' },
      { label: 'Chino', amount: R(700), category: 'family', accountType: 'personal' },
      { label: 'Phone Insurance', amount: R(694.74), category: 'health', accountType: 'personal' },
      { label: 'Philani Loan', amount: R(5000), category: 'family', accountType: 'personal' },
    ],
  },

  '2025-05': {
    startDate: '2025-05-01',
    endDate: '2025-05-31',
    status: 'closed',
    items: {
      'Bond': { amount: R(8050) },
      'Car Installment': { amount: R(9200) },
      'Medical Aid': { amount: R(6000) },
      'Car Track': { amount: R(180) },
      'Levies': { amount: R(1359.04) },
      'Rates': { amount: R(500) },
      'Family Support': { amount: R(2000) },
      'Grocery': { amount: R(4000) },
      'Sbonga Support': { amount: R(2000) },
      'Nhloso Support': { amount: R(2000) },
      'Emergency': { amount: R(1000) },
      'Bank Charges': { amount: R(525.62) },
      'Dec Transport Savings': { amount: R(200) },
      'Football Genic': { amount: R(2000) },
      'Markham': { amount: R(1000) },
      'Spouse Support': { amount: R(5000) },
      'Electricity': { amount: R(2000) },
      'Car Insurance': { amount: R(1495) },
      'Petrol': { amount: R(2751.65) },
      'Fibre': { amount: R(950) },
      'DSTV': { amount: R(140) },
      'PAYE': { amount: R(1400) },
      'Accounting Fees': { amount: R(2915) },
      'Stokfel': { amount: R(2000) },
      'Entertainment': { amount: R(8300) },
      'Airtime': { amount: R(348.93) },
    },
    oneOffs: [
      { label: 'Unisa Fees', amount: R(2000), category: 'education', accountType: 'business' },
      { label: 'Bed', amount: R(7350), category: 'housing', accountType: 'personal' },
      { label: 'Isipheko', amount: R(1000), category: 'family', accountType: 'personal' },
      { label: 'Phone Insurance', amount: R(700), category: 'health', accountType: 'personal' },
      { label: 'Mweb', amount: R(634.33), category: 'utilities', accountType: 'business' },
      { label: 'AWS Certificate', amount: R(1400), category: 'education', accountType: 'business' },
      { label: 'Ticket', amount: R(240), category: 'lifestyle', accountType: 'personal' },
      { label: 'Udemy', amount: R(540), category: 'education', accountType: 'business' },
      { label: 'Bus Ticket', amount: R(585), category: 'transport', accountType: 'personal' },
      { label: 'ChatGPT', amount: R(849.98), category: 'utilities', accountType: 'business' },
      { label: 'Google', amount: R(52.99), category: 'utilities', accountType: 'business' },
    ],
  },

  '2025-06': {
    startDate: '2025-06-01',
    endDate: '2025-06-30',
    status: 'closed',
    items: {
      'Bond': { amount: R(8050) },
      'Car Installment': { amount: R(9200) },
      'Medical Aid': { amount: R(6000) },
      'Car Track': { amount: R(180) },
      'Levies': { amount: R(1359.04) },
      'Rates': { amount: R(500) },
      'Family Support': { amount: R(2000) },
      'Grocery': { amount: R(4000) },
      'Sbonga Support': { amount: R(2500) },
      'Nhloso Support': { amount: R(2000) },
      'Emergency': { amount: R(1000) },
      'Bank Charges': { amount: R(525.62) },
      'Dec Transport Savings': { amount: R(200) },
      'Football Genic': { amount: R(2000) },
      'Markham': { amount: R(1000) },
      'Spouse Support': { amount: R(5000) },
      'Electricity': { amount: R(2650) },
      'Car Insurance': { amount: R(1495) },
      'Petrol': { amount: R(1450.40) },
      'Fibre': { amount: R(950) },
      'DSTV': { amount: R(140) },
      'PAYE': { amount: R(1400) },
      'Accounting Fees': { amount: R(2915) },
      'Phone Insurance': { amount: R(281.80) },
      'Entertainment': { amount: R(3496.44) },
      'Amazon': { amount: R(78.28) },
      'Google': { amount: R(52.99) },
      'Mweb': { amount: R(199) },
      'Airtime': { amount: R(67) },
    },
    oneOffs: [
      { label: 'Unisa Fees', amount: R(2000), category: 'education', accountType: 'business' },
      { label: 'Wife Birthday', amount: R(3000), category: 'family', accountType: 'personal' },
      { label: 'Sbonga Clothes', amount: R(700), category: 'family', accountType: 'personal' },
      { label: 'Steering Rack', amount: R(8300), category: 'transport', accountType: 'personal' },
      { label: 'Sbonga Toys', amount: R(1000), category: 'family', accountType: 'personal' },
      { label: 'Stepper', amount: R(400), category: 'lifestyle', accountType: 'personal' },
      { label: 'TV Licence', amount: R(318), category: 'utilities', accountType: 'personal' },
      { label: 'Cleaning', amount: R(987), category: 'housing', accountType: 'personal' },
      { label: 'Travel', amount: R(837.48), category: 'lifestyle', accountType: 'personal' },
    ],
  },

  '2025-07': {
    startDate: '2025-07-01',
    endDate: '2025-07-31',
    status: 'closed',
    items: {
      'Bond': { amount: R(8050) },
      'Car Installment': { amount: R(9200) },
      'Medical Aid': { amount: R(6000) },
      'Car Track': { amount: R(180) },
      'Levies': { amount: R(1642.70) },
      'Rates': { amount: R(500) },
      'Family Support': { amount: R(2000) },
      'Grocery': { amount: R(4000) },
      'Sbonga Support': { amount: R(2000) },
      'Nhloso Support': { amount: R(2000) },
      'Emergency': { amount: R(2000) },
      'Bank Charges': { amount: R(525.62) },
      'Dec Transport Savings': { amount: R(200) },
      'Football Genic': { amount: R(2000) },
      'Markham': { amount: R(3400) },
      'Spouse Support': { amount: R(5000) },
      'Electricity': { amount: R(3130) },
      'Car Insurance': { amount: R(1495) },
      'Petrol': { amount: R(1875) },
      'Fibre': { amount: R(950) },
      'DSTV': { amount: R(140) },
      'PAYE': { amount: R(1400) },
      'Accounting Fees': { amount: R(2915) },
      'Stokfel': { amount: R(2000) },
      'Phone Insurance': { amount: R(281.80) },
      'Entertainment': { amount: R(3496.44) },
      'Mweb': { amount: R(199) },
      'Airtime': { amount: R(200) },
      'Amazon': { amount: R(431.66) },
      'ChatGPT': { amount: R(424.99) },
      'Google': { amount: R(52.99) },
    },
    oneOffs: [
      { label: 'Unisa Fees', amount: R(2000), category: 'education', accountType: 'business' },
      { label: 'Stokfel Refund', amount: R(4000), category: 'savings', accountType: 'personal' },
      { label: 'Travel', amount: R(2522.70), category: 'lifestyle', accountType: 'personal' },
      { label: 'Ntokozo Braai', amount: R(1000), category: 'lifestyle', accountType: 'personal' },
      { label: 'Traffic Fine', amount: R(250), category: 'transport', accountType: 'personal' },
      { label: 'Screen Repair', amount: R(2000), category: 'utilities', accountType: 'personal' },
      { label: 'Games', amount: R(1000), category: 'lifestyle', accountType: 'personal' },
      { label: 'Uhlelo', amount: R(200), category: 'family', accountType: 'personal' },
    ],
  },

  '2025-08': {
    startDate: '2025-08-01',
    endDate: '2025-08-31',
    status: 'closed',
    items: {
      'Bond': { amount: R(8050) },
      'Car Installment': { amount: R(4200) },
      'Medical Aid': { amount: R(6000) },
      'Car Track': { amount: R(180) },
      'Levies': { amount: R(1642.70) },
      'Rates': { amount: R(500) },
      'Family Support': { amount: R(2000) },
      'Grocery': { amount: R(4000) },
      'Sbonga Support': { amount: R(2000) },
      'Nhloso Support': { amount: R(2000) },
      'Emergency': { amount: R(2000) },
      'Bank Charges': { amount: R(525.62) },
      'Dec Transport Savings': { amount: R(200) },
      'Football Genic': { amount: R(2000) },
      'Markham': { amount: R(3400) },
      'Spouse Support': { amount: R(5000) },
      'Electricity': { amount: R(2200) },
      'Car Insurance': { amount: R(1495) },
      'Petrol': { amount: R(944.05) },
      'Fibre': { amount: R(950) },
      'DSTV': { amount: R(140) },
      'PAYE': { amount: R(1400) },
      'Accounting Fees': { amount: R(2915) },
      'Stokfel': { amount: R(2000) },
      'Phone Insurance': { amount: R(281.80) },
      'Entertainment': { amount: R(3496.44) },
      'Mweb': { amount: R(199) },
      'Airtime': { amount: R(105) },
      'Amazon': { amount: R(444) },
      'Google': { amount: R(52.99) },
    },
    oneOffs: [
      { label: 'Unisa Fees', amount: R(2000), category: 'education', accountType: 'business' },
      { label: 'Wedding Anniversary', amount: R(8300), category: 'family', accountType: 'personal' },
      { label: 'Uhlelo', amount: R(200), category: 'family', accountType: 'personal' },
      { label: 'Round ka Gogo', amount: R(500), category: 'family', accountType: 'personal' },
      { label: 'Traffic Ticket', amount: R(1100), category: 'transport', accountType: 'personal' },
      { label: 'Betting', amount: R(300), category: 'lifestyle', accountType: 'personal' },
      { label: 'Aldo Bag', amount: R(1200), category: 'lifestyle', accountType: 'personal' },
      { label: 'Trouser', amount: R(800), category: 'lifestyle', accountType: 'personal' },
      { label: 'Animal Feeds', amount: R(1000), category: 'other', accountType: 'personal' },
      { label: 'Sandanezwe Trip', amount: R(1700), category: 'lifestyle', accountType: 'personal' },
      { label: 'Fanele Birthday', amount: R(500), category: 'family', accountType: 'personal' },
    ],
  },

  '2025-09': {
    startDate: '2025-09-01',
    endDate: '2025-09-30',
    status: 'closed',
    items: {
      'Bond': { amount: R(8050) },
      'Car Installment': { amount: R(9200) },
      'Medical Aid': { amount: R(6000) },
      'Car Track': { amount: R(180) },
      'Levies': { amount: R(1642.70) },
      'Rates': { amount: R(500) },
      'Family Support': { amount: R(2000) },
      'Grocery': { amount: R(4000) },
      'Sbonga Support': { amount: R(2000) },
      'Nhloso Support': { amount: R(2000) },
      'Emergency': { amount: R(1000) },
      'Bank Charges': { amount: R(415.36) },
      'Dec Transport Savings': { amount: R(200) },
      'Football Genic': { amount: R(2000) },
      'Byte Fusion': { amount: R(1500) },
      'Spouse Support': { amount: R(5000) },
      'Electricity': { amount: R(200) },
      'Car Insurance': { amount: R(1495) },
      'Fibre': { amount: R(950) },
      'DSTV': { amount: R(479) },
      'PAYE': { amount: R(1400) },
      'Accounting Fees': { amount: R(2915) },
      'Stokfel': { amount: R(2000) },
      'Phone Insurance': { amount: R(281.80) },
      'Entertainment': { amount: R(4327.18) },
      'Mweb': { amount: R(199) },
      'Airtime': { amount: R(90) },
      'Amazon': { amount: R(126.54) },
      'Claude': { amount: R(357.38) },
      'Google': { amount: R(52.99) },
    },
    oneOffs: [
      { label: 'Sbonga & Nhloso Birthday', amount: R(8300), category: 'family', accountType: 'personal' },
      { label: 'Uhlelo', amount: R(200), category: 'family', accountType: 'personal' },
      { label: 'Round ka Gogo', amount: R(1000), category: 'family', accountType: 'personal' },
      { label: 'Car Disk Renewal', amount: R(700), category: 'transport', accountType: 'personal' },
      { label: 'Pool', amount: R(2000), category: 'lifestyle', accountType: 'personal' },
    ],
  },

  '2025-10': {
    startDate: '2025-10-01',
    endDate: '2025-10-31',
    status: 'closed',
    items: {
      'Bond': { amount: R(8050) },
      'Car Installment': { amount: R(9200) },
      'Medical Aid': { amount: R(6000) },
      'Car Track': { amount: R(180) },
      'Levies': { amount: R(1642.70) },
      'Rates': { amount: R(500) },
      'Family Support': { amount: R(2000) },
      'Grocery': { amount: R(4000) },
      'Sbonga Support': { amount: R(2000) },
      'Nhloso Support': { amount: R(2000) },
      'Emergency': { amount: R(5000) },
      'Bank Charges': { amount: R(426.52) },
      'Dec Transport Savings': { amount: R(200) },
      'Byte Fusion': { amount: R(1500) },
      'Spouse Support': { amount: R(5000) },
      'Electricity': { amount: R(2500) },
      'Car Insurance': { amount: R(1495) },
      'Petrol': { amount: R(2957.10) },
      'Fibre': { amount: R(950) },
      'DSTV': { amount: R(479) },
      'PAYE': { amount: R(1400) },
      'Accounting Fees': { amount: R(2915) },
      'Stokfel': { amount: R(2000) },
      'Phone Insurance': { amount: R(281.80) },
      'Entertainment': { amount: R(3801.04) },
      'Mweb': { amount: R(373.19) },
      'Airtime': { amount: R(149) },
      'Amazon': { amount: R(4.40) },
      'Claude': { amount: R(358.79) },
      'Google': { amount: R(52.99) },
      'Round ka Gogo': { amount: R(1000) },
      'Uhlelo': { amount: R(400) },
    },
    oneOffs: [],
  },

  '2025-11': {
    startDate: '2025-11-01',
    endDate: '2025-11-30',
    status: 'closed',
    items: {
      'Bond': { amount: R(8050) },
      'Car Installment': { amount: R(4200) },
      'Medical Aid': { amount: R(6000) },
      'Car Track': { amount: R(180) },
      'Levies': { amount: R(1642.70) },
      'Rates': { amount: R(500) },
      'Family Support': { amount: R(2000) },
      'Grocery': { amount: R(4000) },
      'Sbonga Support': { amount: R(2000) },
      'Nhloso Support': { amount: R(2000) },
      'Bank Charges': { amount: R(310.45) },
      'Dec Transport Savings': { amount: R(200) },
      'Byte Fusion': { amount: R(1500) },
      'Spouse Support': { amount: R(5000) },
      'Electricity': { amount: R(2500) },
      'Car Insurance': { amount: R(1495) },
      'Petrol': { amount: R(2957.10) },
      'Fibre': { amount: R(826.09) },
      'DSTV': { amount: R(479) },
      'PAYE': { amount: R(1400) },
      'Accounting Fees': { amount: R(2538.58) },
      'Stokfel': { amount: R(2000) },
      'Phone Insurance': { amount: R(281.80) },
      'Entertainment': { amount: R(2600.09) },
      'Mweb': { amount: R(299) },
      'Airtime': { amount: R(210) },
      'Amazon': { amount: R(1.97) },
      'Claude': { amount: R(307.92) },
      'Domains': { amount: R(240.18) },
    },
    oneOffs: [
      { label: 'CIPC', amount: R(175), category: 'business', accountType: 'business' },
      { label: 'Maka Zethu', amount: R(1000), category: 'family', accountType: 'personal' },
      { label: 'Christmas Cake', amount: R(1000), category: 'lifestyle', accountType: 'personal' },
    ],
  },

  '2025-12': {
    startDate: '2025-12-01',
    endDate: '2025-12-31',
    status: 'closed',
    items: {
      'Bond': { amount: R(8050) },
      'Car Installment': { amount: R(4200) },
      'Medical Aid': { amount: R(6000) },
      'Car Track': { amount: R(180) },
      'Levies': { amount: R(1642.70) },
      'Rates': { amount: R(500) },
      'Family Support': { amount: R(2000) },
      'Grocery': { amount: R(4000) },
      'Bank Charges': { amount: R(310.45) },
      'Dec Transport Savings': { amount: R(200) },
      'Byte Fusion': { amount: R(1500) },
      'Spouse Support': { amount: R(5000) },
      'Electricity': { amount: R(1700) },
      'Car Insurance': { amount: R(1333.04) },
      'Petrol': { amount: R(3007.93) },
      'Fibre': { amount: R(826.09) },
      'DSTV': { amount: R(479) },
      'PAYE': { amount: R(1400) },
      'Accounting Fees': { amount: R(3362.78) },
      'Stokfel': { amount: R(2000) },
      'Phone Insurance': { amount: R(281.80) },
      'Entertainment': { amount: R(6252.60) },
      'Mweb': { amount: R(270) },
      'Airtime': { amount: R(700) },
      'Amazon': { amount: R(1.97) },
      'Domains': { amount: R(60) },
    },
    oneOffs: [
      { label: 'Sbonga Uniform', amount: R(2500), category: 'family', accountType: 'personal' },
    ],
  },
};

// ---------------------------------------------------------------------------
// SEED FUNCTIONS
// ---------------------------------------------------------------------------

// Store goal IDs for linking
let footballGenicGoalId = null;
let byteFusionGoalId = null;

async function resetAll() {
  console.log('🗑  Resetting 2025 data...\n');

  // Delete 2025 cycles and their items
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

  // Delete Football Genic goal if exists (Byte Fusion is from 2026, keep it)
  try {
    const { goals } = await get('/api/goals');
    const fg = (goals || []).find(g => g.name === FOOTBALL_GENIC_GOAL.name);
    if (fg) {
      await del(`/api/goals/${fg.id}`);
      console.log(`  ✓ Deleted goal: ${FOOTBALL_GENIC_GOAL.name}`);
    }
  } catch {
    // No goals
  }

  // Note: We don't delete commitments as they may be shared with 2026
  console.log('');
}

async function seedGoals() {
  console.log('🎯 Creating goals...\n');
  const { goals: existing } = await get('/api/goals');

  // Football Genic
  const fgFound = (existing || []).find(g => g.name === FOOTBALL_GENIC_GOAL.name);
  if (fgFound) {
    footballGenicGoalId = fgFound.id;
    console.log(`  → Football Genic already exists (${footballGenicGoalId})`);
  } else {
    try {
      const result = await post('/api/goals', {
        name: FOOTBALL_GENIC_GOAL.name,
        type: FOOTBALL_GENIC_GOAL.type,
        targetAmount: FOOTBALL_GENIC_GOAL.targetAmount,
        monthlyTarget: FOOTBALL_GENIC_GOAL.monthlyTarget,
        priority: FOOTBALL_GENIC_GOAL.priority,
        status: FOOTBALL_GENIC_GOAL.status,
        allowWithdrawals: false,
      });
      footballGenicGoalId = result.id;
      await patch(`/api/goals/${footballGenicGoalId}`, {
        currentAmount: FOOTBALL_GENIC_GOAL.currentAmount,
      });
      console.log(`  ✓ Football Genic created (${footballGenicGoalId}) - R20K principal`);
    } catch (err) {
      console.error(`  ✗ Football Genic: ${err.message}`);
    }
  }

  // Byte Fusion - find existing goal from 2026 data
  const bfFound = (existing || []).find(g => g.name === BYTE_FUSION_GOAL_NAME);
  if (bfFound) {
    byteFusionGoalId = bfFound.id;
    console.log(`  ✓ Byte Fusion found (${byteFusionGoalId}) - will link 2025 contributions`);
  } else {
    console.log(`  ⚠ Byte Fusion goal not found - 2025 contributions won't be linked`);
  }

  console.log('');
}

// Build a lookup for commitment metadata
const commitmentLookup = new Map(COMMITMENTS.map(c => [c.label, c]));

async function seedCycle(cycleId, data) {
  console.log(`📅 Seeding ${cycleId}...`);

  // Calculate dates for this cycle
  const [year, month] = cycleId.split('-').map(Number);
  const cyclePaidDate = new Date(year, month - 1, 15).toISOString();
  const goalContribDate = new Date(year, month - 1, 25).toISOString(); // 25th for Football Genic

  // Check if cycle exists
  const { cycles } = await get('/api/cycles');
  const existingCycle = (cycles || []).find(c => c.id === cycleId);

  if (!existingCycle) {
    // Create cycle without spawning items from commitments
    await post('/api/cycles', {
      id: cycleId,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status,
      skipSpawn: true, // Don't spawn from 2026 commitments
    });
    console.log(`  ✓ Cycle created (${data.status})`);
  } else {
    console.log(`  → Cycle exists`);
  }

  // Get existing items
  const { items } = await get(`/api/cycle-items?cycleId=${cycleId}`);
  const existingLabels = new Set((items || []).map(i => i.label));

  console.log(`  → Found ${items?.length || 0} existing items`);

  // Create all items directly (treating everything as one-offs for historical data)
  let created = 0;
  for (const [label, itemData] of Object.entries(data.items)) {
    if (existingLabels.has(label)) continue;

    // Get metadata from commitment lookup or use defaults
    const meta = commitmentLookup.get(label) || {
      category: 'other',
      accountType: 'personal',
    };

    const paidDate = (label === 'Football Genic' || label === 'Byte Fusion') ? goalContribDate : cyclePaidDate;
    let linkedGoalId = undefined;
    if (label === 'Football Genic') linkedGoalId = footballGenicGoalId;
    if (label === 'Byte Fusion') linkedGoalId = byteFusionGoalId;

    try {
      await post('/api/cycle-items', {
        cycleId,
        label,
        amount: itemData.amount || meta.amount,
        category: meta.category,
        accountType: meta.accountType,
        status: 'paid',
        paidDate,
        ...(linkedGoalId && { linkedGoalId }),
      });
      created++;
    } catch (err) {
      console.error(`  ✗ ${label}: ${err.message}`);
    }
  }

  // Add explicit one-offs
  for (const oneOff of data.oneOffs || []) {
    if (existingLabels.has(oneOff.label)) continue;

    try {
      await post('/api/cycle-items', {
        cycleId,
        ...oneOff,
        status: 'paid',
        paidDate: cyclePaidDate,
      });
      created++;
    } catch (err) {
      console.error(`  ✗ ${oneOff.label}: ${err.message}`);
    }
  }

  console.log(`  → ${created} items created\n`);
}

async function seed() {
  console.log('🌱 Seeding 2025 historical data (Jan-Dec)...\n');

  if (RESET) {
    await resetAll();
  }

  // Goals first (for linking contributions)
  await seedGoals();

  // All 12 months - items created directly (not from commitments)
  for (const [cycleId, data] of Object.entries(MONTHS)) {
    await seedCycle(cycleId, data);
  }

  console.log('🎉 Done! 2025 historical data seeded.');
  console.log('   All 12 cycles are closed for trend analysis.');
  console.log('   Football Genic: R20K principal + R2K/month (Jan-Aug)');
  console.log('   Byte Fusion: R1.5K/month contributions (Sept-Dec)');
}

seed().catch(err => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
