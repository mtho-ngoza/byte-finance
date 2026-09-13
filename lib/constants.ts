import type { Category } from '@/types';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const CATEGORIES: Category[] = [
  'housing',
  'transport',
  'family',
  'utilities',
  'health',
  'education',
  'savings',
  'lifestyle',
  'business',
  'other',
];

export const CATEGORY_LABELS: Record<Category, string> = {
  housing: 'Housing',
  transport: 'Transport',
  family: 'Family',
  utilities: 'Utilities',
  health: 'Health',
  education: 'Education',
  savings: 'Savings',
  lifestyle: 'Lifestyle',
  business: 'Business',
  other: 'Other',
};

export const CATEGORY_OPTIONS = CATEGORIES.map((cat) => ({
  value: cat,
  label: CATEGORY_LABELS[cat],
}));

// ---------------------------------------------------------------------------
// Sub-categories
// ---------------------------------------------------------------------------

export const SUB_CATEGORIES: Partial<Record<Category, string[]>> = {
  transport: ['fuel', 'parking', 'tolls', 'maintenance', 'insurance'],
  utilities: ['electricity', 'water', 'internet', 'streaming'],
  lifestyle: ['groceries', 'dining', 'entertainment', 'shopping'],
  health: ['medical_aid', 'pharmacy', 'doctor'],
  family: ['school', 'childcare', 'support'],
};

export const SUB_CATEGORY_LABELS: Record<string, string> = {
  // Transport
  fuel: 'Fuel',
  parking: 'Parking',
  tolls: 'Tolls',
  maintenance: 'Maintenance',
  insurance: 'Insurance',
  // Utilities
  electricity: 'Electricity',
  water: 'Water',
  internet: 'Internet',
  streaming: 'Streaming',
  // Lifestyle
  groceries: 'Groceries',
  dining: 'Dining',
  entertainment: 'Entertainment',
  shopping: 'Shopping',
  // Health
  medical_aid: 'Medical Aid',
  pharmacy: 'Pharmacy',
  doctor: 'Doctor',
  // Family
  school: 'School',
  childcare: 'Childcare',
  support: 'Support',
};

export const getSubCategoryOptions = (category: Category) => {
  const subs = SUB_CATEGORIES[category];
  if (!subs) return [];
  return subs.map((sub) => ({
    value: sub,
    label: SUB_CATEGORY_LABELS[sub] || sub,
  }));
};

// ---------------------------------------------------------------------------
// Goal Types
// ---------------------------------------------------------------------------

export const GOAL_TYPE_ICONS: Record<string, string> = {
  savings: '💰',
  debt_payoff: '💳',
  investment: '📈',
  emergency_fund: '🛡️',
  purchase: '🛒',
  other: '🎯',
};

// ---------------------------------------------------------------------------
// Account Types
// ---------------------------------------------------------------------------

export const ACCOUNT_TYPES = [
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
] as const;
