import { describe, it, expect } from 'vitest';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  GOAL_TYPE_ICONS,
  ACCOUNT_TYPES,
} from '@/lib/constants';

describe('constants', () => {
  describe('CATEGORIES', () => {
    it('contains expected categories', () => {
      expect(CATEGORIES).toContain('housing');
      expect(CATEGORIES).toContain('transport');
      expect(CATEGORIES).toContain('savings');
      expect(CATEGORIES).toContain('business');
      expect(CATEGORIES.length).toBe(10);
    });
  });

  describe('CATEGORY_LABELS', () => {
    it('has a label for every category', () => {
      for (const cat of CATEGORIES) {
        expect(CATEGORY_LABELS[cat]).toBeDefined();
        expect(typeof CATEGORY_LABELS[cat]).toBe('string');
      }
    });

    it('labels are properly formatted', () => {
      expect(CATEGORY_LABELS.housing).toBe('Housing');
      expect(CATEGORY_LABELS.business).toBe('Business');
    });
  });

  describe('CATEGORY_OPTIONS', () => {
    it('has same length as CATEGORIES', () => {
      expect(CATEGORY_OPTIONS.length).toBe(CATEGORIES.length);
    });

    it('each option has value and label', () => {
      for (const option of CATEGORY_OPTIONS) {
        expect(option.value).toBeDefined();
        expect(option.label).toBeDefined();
      }
    });

    it('values match categories', () => {
      const values = CATEGORY_OPTIONS.map((o) => o.value);
      expect(values).toEqual(CATEGORIES);
    });
  });

  describe('GOAL_TYPE_ICONS', () => {
    it('has icons for common goal types', () => {
      expect(GOAL_TYPE_ICONS.savings).toBeDefined();
      expect(GOAL_TYPE_ICONS.debt_payoff).toBeDefined();
      expect(GOAL_TYPE_ICONS.investment).toBeDefined();
    });

    it('icons are emoji strings', () => {
      expect(GOAL_TYPE_ICONS.savings).toBe('💰');
      expect(GOAL_TYPE_ICONS.debt_payoff).toBe('💳');
    });
  });

  describe('ACCOUNT_TYPES', () => {
    it('has personal and business accounts', () => {
      const values = ACCOUNT_TYPES.map((a) => a.value);
      expect(values).toContain('personal');
      expect(values).toContain('business');
    });

    it('each type has value and label', () => {
      for (const type of ACCOUNT_TYPES) {
        expect(type.value).toBeDefined();
        expect(type.label).toBeDefined();
      }
    });
  });
});
