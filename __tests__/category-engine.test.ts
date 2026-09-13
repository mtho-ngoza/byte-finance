import { describe, it, expect } from 'vitest';
import {
  normalizeVendor,
  vendorSearchKey,
  suggestCategory,
  CONFIDENCE_ICONS,
  CONFIDENCE_LABELS,
} from '@/lib/category-engine';
import type { VendorRule } from '@/types';
import { Timestamp } from 'firebase/firestore';

// Helper to create a mock VendorRule
function createRule(vendor: string, category: string, subCategory?: string): VendorRule {
  return {
    id: `rule-${Date.now()}`,
    vendor,
    category: category as VendorRule['category'],
    subCategory,
    confidence: 'user_set',
    matchCount: 1,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}

describe('Category Engine', () => {
  describe('normalizeVendor', () => {
    it('should return empty string for empty input', () => {
      expect(normalizeVendor('')).toBe('');
      expect(normalizeVendor('   ')).toBe('');
    });

    it('should convert to title case', () => {
      expect(normalizeVendor('engen')).toBe('Engen');
      expect(normalizeVendor('PICK N PAY')).toBe('Pick N Pay');
      expect(normalizeVendor('woolworths')).toBe('Woolworths');
    });

    it('should trim whitespace', () => {
      expect(normalizeVendor('  engen  ')).toBe('Engen');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeVendor('pick  n   pay')).toBe('Pick N Pay');
    });

    it('should handle mixed case', () => {
      expect(normalizeVendor('pIcK n PaY')).toBe('Pick N Pay');
    });
  });

  describe('vendorSearchKey', () => {
    it('should create lowercase key without special characters', () => {
      expect(vendorSearchKey('Pick n Pay')).toBe('picknpay');
      expect(vendorSearchKey("Dis-Chem")).toBe('dischem');
      expect(vendorSearchKey('KFC (Restaurant)')).toBe('kfcrestaurant');
    });

    it('should handle numbers', () => {
      expect(vendorSearchKey('7-Eleven')).toBe('7eleven');
    });
  });

  describe('suggestCategory', () => {
    describe('with vendor rules', () => {
      it('should match exact vendor rule', () => {
        const rules = [createRule('Engen', 'transport', 'fuel')];
        const result = suggestCategory('Engen', rules);

        expect(result.category).toBe('transport');
        expect(result.subCategory).toBe('fuel');
        expect(result.confidence).toBe('high');
        expect(result.source).toBe('vendor_rule');
      });

      it('should match vendor rule case-insensitively', () => {
        const rules = [createRule('Pick N Pay', 'lifestyle', 'groceries')];
        const result = suggestCategory('pick n pay', rules);

        expect(result.category).toBe('lifestyle');
        expect(result.subCategory).toBe('groceries');
        expect(result.confidence).toBe('high');
      });

      it('should match vendor rule with fuzzy search key', () => {
        const rules = [createRule('Dis-Chem', 'health', 'pharmacy')];
        const result = suggestCategory('DisChem', rules);

        expect(result.category).toBe('health');
        expect(result.confidence).toBe('high');
      });
    });

    describe('keyword fallback', () => {
      it('should match fuel stations', () => {
        const result = suggestCategory('Engen Garage', []);
        expect(result.category).toBe('transport');
        expect(result.subCategory).toBe('fuel');
        expect(result.confidence).toBe('medium');
        expect(result.source).toBe('keyword');

        expect(suggestCategory('Shell Petrol', []).category).toBe('transport');
        expect(suggestCategory('BP Express', []).category).toBe('transport');
        expect(suggestCategory('Caltex', []).category).toBe('transport');
        expect(suggestCategory('Sasol Garage', []).category).toBe('transport');
      });

      it('should match grocery stores', () => {
        const result = suggestCategory('Pick n Pay', []);
        expect(result.category).toBe('lifestyle');
        expect(result.subCategory).toBe('groceries');
        expect(result.confidence).toBe('medium');

        expect(suggestCategory('Checkers', []).category).toBe('lifestyle');
        expect(suggestCategory('Woolworths Food', []).category).toBe('lifestyle');
        expect(suggestCategory('Spar', []).category).toBe('lifestyle');
        expect(suggestCategory('Shoprite', []).category).toBe('lifestyle');
      });

      it('should match pharmacies', () => {
        const result = suggestCategory('Clicks Pharmacy', []);
        expect(result.category).toBe('health');
        expect(result.subCategory).toBe('pharmacy');

        expect(suggestCategory('Dis-Chem', []).category).toBe('health');
      });

      it('should match restaurants', () => {
        const result = suggestCategory('Nandos', []);
        expect(result.category).toBe('lifestyle');
        expect(result.subCategory).toBe('dining');

        expect(suggestCategory('Spur Steak', []).category).toBe('lifestyle');
        expect(suggestCategory('KFC Delivery', []).category).toBe('lifestyle');
        expect(suggestCategory('McDonalds', []).category).toBe('lifestyle');
      });

      it('should match streaming services as entertainment', () => {
        // Netflix/Showmax match entertainment pattern first (lifestyle)
        const result = suggestCategory('Netflix', []);
        expect(result.category).toBe('lifestyle');
        expect(result.subCategory).toBe('entertainment');

        expect(suggestCategory('Showmax', []).category).toBe('lifestyle');

        // Spotify only matches streaming pattern (utilities)
        expect(suggestCategory('Spotify', []).category).toBe('utilities');
        expect(suggestCategory('Spotify', []).subCategory).toBe('streaming');
      });

      it('should match internet providers', () => {
        const result = suggestCategory('Vodacom Fibre', []);
        expect(result.category).toBe('utilities');
        expect(result.subCategory).toBe('internet');

        expect(suggestCategory('MTN Mobile', []).category).toBe('utilities');
        expect(suggestCategory('Afrihost', []).category).toBe('utilities');
      });

      it('should match online shopping', () => {
        const result = suggestCategory('Takealot', []);
        expect(result.category).toBe('lifestyle');
        expect(result.subCategory).toBe('shopping');

        expect(suggestCategory('Amazon', []).category).toBe('lifestyle');
      });

      it('should match hardware stores as housing', () => {
        const result = suggestCategory('Builders Warehouse', []);
        expect(result.category).toBe('housing');

        expect(suggestCategory('Cashbuild', []).category).toBe('housing');
      });

      it('should match tolls', () => {
        const result = suggestCategory('SANRAL e-toll', []);
        expect(result.category).toBe('transport');
        expect(result.subCategory).toBe('tolls');
      });

      it('should match education', () => {
        const result = suggestCategory('UNISA Fees', []);
        expect(result.category).toBe('education');

        expect(suggestCategory('University of Cape Town', []).category).toBe('education');
      });
    });

    describe('default fallback', () => {
      it('should return other with low confidence for unknown vendors', () => {
        const result = suggestCategory('Random Unknown Store', []);

        expect(result.category).toBe('other');
        expect(result.confidence).toBe('low');
        expect(result.source).toBe('default');
      });

      it('should return other for empty vendor', () => {
        const result = suggestCategory('', []);
        expect(result.category).toBe('other');
        expect(result.confidence).toBe('low');
      });

      it('should return other for whitespace-only vendor', () => {
        const result = suggestCategory('   ', []);
        expect(result.category).toBe('other');
        expect(result.confidence).toBe('low');
      });
    });

    describe('rule priority over keywords', () => {
      it('should prefer vendor rule over keyword match', () => {
        // Engen would match fuel keyword, but we have a different rule
        const rules = [createRule('Engen', 'lifestyle', 'shopping')];
        const result = suggestCategory('Engen', rules);

        expect(result.category).toBe('lifestyle');
        expect(result.subCategory).toBe('shopping');
        expect(result.source).toBe('vendor_rule');
      });
    });
  });

  describe('Confidence helpers', () => {
    it('should have correct icons', () => {
      expect(CONFIDENCE_ICONS.high).toBe('✓');
      expect(CONFIDENCE_ICONS.medium).toBe('~');
      expect(CONFIDENCE_ICONS.low).toBe('?');
    });

    it('should have correct labels', () => {
      expect(CONFIDENCE_LABELS.high).toBe('Auto-categorized');
      expect(CONFIDENCE_LABELS.medium).toBe('Suggested');
      expect(CONFIDENCE_LABELS.low).toBe('Needs review');
    });
  });
});
