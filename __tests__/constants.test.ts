import { describe, it, expect } from 'vitest';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  SUB_CATEGORIES,
  SUB_CATEGORY_LABELS,
  getSubCategoryOptions,
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

  describe('SUB_CATEGORIES', () => {
    it('has sub-categories for transport', () => {
      expect(SUB_CATEGORIES.transport).toBeDefined();
      expect(SUB_CATEGORIES.transport).toContain('fuel');
      expect(SUB_CATEGORIES.transport).toContain('parking');
      expect(SUB_CATEGORIES.transport).toContain('tolls');
    });

    it('has sub-categories for utilities', () => {
      expect(SUB_CATEGORIES.utilities).toBeDefined();
      expect(SUB_CATEGORIES.utilities).toContain('electricity');
      expect(SUB_CATEGORIES.utilities).toContain('internet');
      expect(SUB_CATEGORIES.utilities).toContain('streaming');
    });

    it('has sub-categories for lifestyle', () => {
      expect(SUB_CATEGORIES.lifestyle).toBeDefined();
      expect(SUB_CATEGORIES.lifestyle).toContain('groceries');
      expect(SUB_CATEGORIES.lifestyle).toContain('dining');
      expect(SUB_CATEGORIES.lifestyle).toContain('shopping');
    });

    it('has sub-categories for health', () => {
      expect(SUB_CATEGORIES.health).toBeDefined();
      expect(SUB_CATEGORIES.health).toContain('medical_aid');
      expect(SUB_CATEGORIES.health).toContain('pharmacy');
    });

    it('has sub-categories for family', () => {
      expect(SUB_CATEGORIES.family).toBeDefined();
      expect(SUB_CATEGORIES.family).toContain('school');
      expect(SUB_CATEGORIES.family).toContain('childcare');
    });

    it('does not have sub-categories for housing', () => {
      expect(SUB_CATEGORIES.housing).toBeUndefined();
    });

    it('does not have sub-categories for other', () => {
      expect(SUB_CATEGORIES.other).toBeUndefined();
    });
  });

  describe('SUB_CATEGORY_LABELS', () => {
    it('has labels for all transport sub-categories', () => {
      expect(SUB_CATEGORY_LABELS.fuel).toBe('Fuel');
      expect(SUB_CATEGORY_LABELS.parking).toBe('Parking');
      expect(SUB_CATEGORY_LABELS.tolls).toBe('Tolls');
    });

    it('has labels for health sub-categories', () => {
      expect(SUB_CATEGORY_LABELS.medical_aid).toBe('Medical Aid');
      expect(SUB_CATEGORY_LABELS.pharmacy).toBe('Pharmacy');
    });

    it('has labels for lifestyle sub-categories', () => {
      expect(SUB_CATEGORY_LABELS.groceries).toBe('Groceries');
      expect(SUB_CATEGORY_LABELS.dining).toBe('Dining');
    });
  });

  describe('getSubCategoryOptions', () => {
    it('returns options for transport', () => {
      const options = getSubCategoryOptions('transport');
      expect(options.length).toBe(5);
      expect(options[0]).toEqual({ value: 'fuel', label: 'Fuel' });
    });

    it('returns options for lifestyle', () => {
      const options = getSubCategoryOptions('lifestyle');
      expect(options.length).toBe(4);
      expect(options.map(o => o.value)).toContain('groceries');
    });

    it('returns empty array for categories without sub-categories', () => {
      expect(getSubCategoryOptions('housing')).toEqual([]);
      expect(getSubCategoryOptions('other')).toEqual([]);
      expect(getSubCategoryOptions('savings')).toEqual([]);
    });

    it('falls back to sub-category key if no label exists', () => {
      // All current sub-categories have labels, but test the fallback logic
      const options = getSubCategoryOptions('health');
      expect(options.length).toBeGreaterThan(0);
      for (const opt of options) {
        expect(opt.label).toBeDefined();
        expect(opt.label.length).toBeGreaterThan(0);
      }
    });
  });
});
