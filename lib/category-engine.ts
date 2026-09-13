import type { Category, CategoryConfidence, VendorRule } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CategorySuggestion {
  category: Category;
  subCategory?: string;
  confidence: CategoryConfidence;
  source: 'vendor_rule' | 'keyword' | 'default';
}

// ---------------------------------------------------------------------------
// Keyword-based fallback mappings (SA context)
// ---------------------------------------------------------------------------

interface KeywordMatch {
  category: Category;
  subCategory?: string;
}

const KEYWORD_CATEGORIES: Array<{ pattern: RegExp; match: KeywordMatch }> = [
  // Transport - Fuel
  { pattern: /engen|shell|bp|caltex|sasol|total|astron|puma/i, match: { category: 'transport', subCategory: 'fuel' } },
  // Transport - Tolls
  { pattern: /sanral|etoll|n1|n3|n4|toll/i, match: { category: 'transport', subCategory: 'tolls' } },
  // Transport - Parking
  { pattern: /parking|parkade/i, match: { category: 'transport', subCategory: 'parking' } },

  // Lifestyle - Groceries
  { pattern: /pick.?n.?pay|checkers|woolworths|spar|shoprite|makro|food.?lover|fruit.?veg/i, match: { category: 'lifestyle', subCategory: 'groceries' } },
  // Lifestyle - Dining
  { pattern: /nando|spur|wimpy|steers|kfc|mcdonalds|burger.?king|ocean.?basket|vida|mugg.?bean|seattle/i, match: { category: 'lifestyle', subCategory: 'dining' } },
  // Lifestyle - Shopping
  { pattern: /takealot|amazon|mr.?price|ackermans|pep|jet|edgars|truworths|cotton.?on/i, match: { category: 'lifestyle', subCategory: 'shopping' } },
  // Lifestyle - Entertainment
  { pattern: /ster.?kinekor|nu.?metro|netflix|showmax|dstv|multichoice/i, match: { category: 'lifestyle', subCategory: 'entertainment' } },

  // Health
  { pattern: /clicks|dis.?chem|pharmacy/i, match: { category: 'health', subCategory: 'pharmacy' } },
  { pattern: /discovery|bonitas|momentum|medical.?aid/i, match: { category: 'health', subCategory: 'medical_aid' } },
  { pattern: /doctor|dr\.|clinic|hospital|netcare|mediclinic|life.?healthcare/i, match: { category: 'health', subCategory: 'doctor' } },

  // Housing
  { pattern: /builders|cashbuild|game|hardware|tile|paint|plumber|electric/i, match: { category: 'housing' } },
  { pattern: /eskom|city.?power|joburg.?water|rand.?water|rates/i, match: { category: 'housing' } },

  // Utilities
  { pattern: /vodacom|mtn|cell.?c|telkom|rain|afrihost|fibre/i, match: { category: 'utilities', subCategory: 'internet' } },
  { pattern: /netflix|showmax|spotify|apple.?music|youtube/i, match: { category: 'utilities', subCategory: 'streaming' } },

  // Education
  { pattern: /unisa|university|college|school|tuition|udemy|coursera/i, match: { category: 'education' } },

  // Family
  { pattern: /creche|daycare|childcare|nanny/i, match: { category: 'family', subCategory: 'childcare' } },

  // Business
  { pattern: /sars|accountant|legal|attorney|office|stationery|cartridge/i, match: { category: 'business' } },
];

// ---------------------------------------------------------------------------
// Vendor normalization
// ---------------------------------------------------------------------------

/**
 * Normalize vendor name for consistent matching
 * - Trims whitespace
 * - Converts to title case
 * - Removes extra spaces
 */
export function normalizeVendor(vendor: string): string {
  if (!vendor) return '';

  return vendor
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Create a search key for fuzzy matching
 * - Lowercase, no spaces, no special chars
 */
export function vendorSearchKey(vendor: string): string {
  return vendor.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Category suggestion
// ---------------------------------------------------------------------------

/**
 * Suggest a category for a vendor based on rules and keyword fallbacks
 */
export function suggestCategory(
  vendor: string,
  rules: VendorRule[]
): CategorySuggestion {
  if (!vendor || !vendor.trim()) {
    return { category: 'other', confidence: 'low', source: 'default' };
  }

  const searchKey = vendorSearchKey(vendor);

  // 1. Check vendor rules (exact match on normalized vendor)
  const normalizedInput = normalizeVendor(vendor);
  const exactRule = rules.find(
    (r) => normalizeVendor(r.vendor) === normalizedInput
  );

  if (exactRule) {
    return {
      category: exactRule.category,
      subCategory: exactRule.subCategory,
      confidence: 'high',
      source: 'vendor_rule',
    };
  }

  // 2. Check vendor rules (fuzzy match on search key)
  const fuzzyRule = rules.find(
    (r) => vendorSearchKey(r.vendor) === searchKey
  );

  if (fuzzyRule) {
    return {
      category: fuzzyRule.category,
      subCategory: fuzzyRule.subCategory,
      confidence: 'high',
      source: 'vendor_rule',
    };
  }

  // 3. Keyword-based fallback
  for (const { pattern, match } of KEYWORD_CATEGORIES) {
    if (pattern.test(vendor)) {
      return {
        category: match.category,
        subCategory: match.subCategory,
        confidence: 'medium',
        source: 'keyword',
      };
    }
  }

  // 4. Default fallback
  return { category: 'other', confidence: 'low', source: 'default' };
}

// ---------------------------------------------------------------------------
// Confidence display helpers
// ---------------------------------------------------------------------------

export const CONFIDENCE_ICONS: Record<CategoryConfidence, string> = {
  high: '✓',
  medium: '~',
  low: '?',
};

export const CONFIDENCE_LABELS: Record<CategoryConfidence, string> = {
  high: 'Auto-categorized',
  medium: 'Suggested',
  low: 'Needs review',
};
