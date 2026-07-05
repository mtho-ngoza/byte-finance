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
