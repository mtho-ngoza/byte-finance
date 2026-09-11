import { describe, it, expect } from 'vitest';
import {
  calculateGoalProjection,
  calculateExtraSavings,
  calculateOneTimeBoost,
  calculateDebtPayoff,
  calculateExtraDebtPayment,
  compareDebtStrategies,
  calculateEmergencyBuffer,
} from '@/lib/what-if-calculator';

describe('What-If Calculator', () => {
  describe('calculateGoalProjection', () => {
    it('should project timeline to reach goal', () => {
      const timeline = calculateGoalProjection(
        0,        // currentBalance
        100000,   // targetAmount (R1000)
        10000,    // monthlyAmount (R100)
        0         // oneTimeBoost
      );

      // Should take 10 months to save R1000 at R100/month
      expect(timeline.length).toBe(11); // Initial + 10 months
      expect(timeline[0].balance).toBe(0);
      expect(timeline[10].balance).toBe(100000);
    });

    it('should include one-time boost in initial balance', () => {
      const timeline = calculateGoalProjection(
        0,        // currentBalance
        100000,   // targetAmount
        10000,    // monthlyAmount
        50000     // oneTimeBoost (R500)
      );

      // R500 boost + 5 months of R100 = R1000
      expect(timeline.length).toBe(6); // Initial + 5 months
      expect(timeline[0].balance).toBe(50000);
      expect(timeline[5].balance).toBe(100000);
    });

    it('should return empty array if monthlyAmount is 0', () => {
      const timeline = calculateGoalProjection(0, 100000, 0, 0);
      expect(timeline).toHaveLength(0);
    });

    it('should handle already-reached goals', () => {
      const timeline = calculateGoalProjection(
        100000,   // currentBalance (already at target)
        100000,   // targetAmount
        10000,    // monthlyAmount
        0
      );

      expect(timeline.length).toBe(1); // Just initial point
      expect(timeline[0].balance).toBe(100000);
    });
  });

  describe('calculateExtraSavings', () => {
    it('should calculate time saved with extra monthly savings', () => {
      const result = calculateExtraSavings(
        0,        // currentBalance
        120000,   // targetAmount (R1200)
        10000,    // currentMonthly (R100)
        10000     // extraAmount (R100 more)
      );

      // Without extra: 12 months
      // With extra: 6 months
      expect(result.summary.timeSaved).toBe(6);
      expect(result.currentTimeline.length).toBe(13); // 12 months + initial
      expect(result.scenarioTimeline.length).toBe(7); // 6 months + initial
    });
  });

  describe('calculateOneTimeBoost', () => {
    it('should calculate time saved with one-time boost', () => {
      const result = calculateOneTimeBoost(
        0,        // currentBalance
        100000,   // targetAmount (R1000)
        10000,    // monthlyAmount (R100)
        50000     // boostAmount (R500)
      );

      // Without boost: 10 months
      // With boost: 5 months
      expect(result.summary.timeSaved).toBe(5);
    });
  });

  describe('calculateDebtPayoff', () => {
    it('should calculate interest-free debt payoff', () => {
      const result = calculateDebtPayoff(
        100000,   // currentBalance (R1000)
        0,        // interestRate (0%)
        10000,    // minimumPayment (R100)
        0         // extraPayment
      );

      // R1000 / R100 = 10 months
      expect(result.months).toBe(10);
      expect(result.totalInterest).toBe(0);
      expect(result.timeline.length).toBe(11); // Initial + 10 months
    });

    it('should calculate debt payoff with interest', () => {
      const result = calculateDebtPayoff(
        100000,   // currentBalance (R1000)
        0.12,     // interestRate (12% annual = 1% monthly)
        20000,    // minimumPayment (R200)
        0
      );

      // With 1% monthly interest, it takes longer
      expect(result.months).toBeGreaterThan(5);
      expect(result.months).toBeLessThan(7);
      expect(result.totalInterest).toBeGreaterThan(0);
    });

    it('should return empty result if payment is 0', () => {
      const result = calculateDebtPayoff(100000, 0.12, 0, 0);
      expect(result.months).toBe(0);
      expect(result.timeline).toHaveLength(0);
    });
  });

  describe('calculateExtraDebtPayment', () => {
    it('should calculate interest saved with extra payments', () => {
      const result = calculateExtraDebtPayment(
        100000,   // currentBalance (R1000)
        0.24,     // interestRate (24% annual = 2% monthly)
        10000,    // minimumPayment (R100)
        10000     // extraPayment (R100 extra)
      );

      expect(result.summary.timeSaved).toBeGreaterThan(0);
      expect(result.summary.interestSaved).toBeGreaterThan(0);
    });

    it('should show no interest saved for interest-free debt', () => {
      const result = calculateExtraDebtPayment(
        100000,   // currentBalance
        0,        // interestRate (0%)
        10000,    // minimumPayment
        10000     // extraPayment
      );

      expect(result.summary.interestSaved).toBe(0);
      expect(result.summary.timeSaved).toBe(5); // 10 months vs 5 months
    });
  });

  describe('compareDebtStrategies', () => {
    it('should compare snowball vs avalanche', () => {
      const debts = [
        { id: '1', name: 'Credit Card', balance: 50000, interestRate: 0.24, minimumPayment: 5000 },
        { id: '2', name: 'Personal Loan', balance: 100000, interestRate: 0.12, minimumPayment: 10000 },
      ];

      const result = compareDebtStrategies(debts, 10000); // R100 extra

      expect(result.snowball).toBeDefined();
      expect(result.avalanche).toBeDefined();
      // Avalanche should save more on interest (pays high-interest first)
      expect(result.avalanche.totalInterest).toBeLessThanOrEqual(result.snowball.totalInterest);
    });

    it('should handle single debt', () => {
      const debts = [
        { id: '1', name: 'Car Loan', balance: 100000, interestRate: 0.10, minimumPayment: 10000 },
      ];

      const result = compareDebtStrategies(debts, 5000);

      // With single debt, both strategies should be identical
      expect(result.snowball.totalInterest).toBe(result.avalanche.totalInterest);
      expect(result.snowball.payoffMonths).toBe(result.avalanche.payoffMonths);
    });

    it('should handle empty debt list', () => {
      const result = compareDebtStrategies([], 10000);

      expect(result.snowball.payoffMonths).toBe(0);
      expect(result.avalanche.payoffMonths).toBe(0);
    });
  });

  describe('calculateEmergencyBuffer', () => {
    it('should calculate timeline to reach emergency fund target', () => {
      const result = calculateEmergencyBuffer(
        50000,    // monthlyExpenses (R500)
        0,        // currentBalance
        6,        // targetMonths
        10000     // monthlySavings (R100)
      );

      // Target: R500 * 6 = R3000
      // At R100/month: 30 months
      expect(result.currentTimeline.length).toBeGreaterThan(1);
      expect(result.summary.monthlyRequired).toBeGreaterThan(0);
    });

    it('should calculate required monthly to reach target in 12 months', () => {
      const result = calculateEmergencyBuffer(
        50000,    // monthlyExpenses (R500)
        0,        // currentBalance
        6,        // targetMonths (6 months of expenses)
        0         // monthlySavings (none currently)
      );

      // Target: R500 * 6 = R3000, in 12 months = R250/month
      expect(result.summary.monthlyRequired).toBe(25000); // R250 in cents
    });

    it('should handle already-funded emergency buffer', () => {
      const result = calculateEmergencyBuffer(
        50000,    // monthlyExpenses (R500)
        300000,   // currentBalance (R3000 - already at 6 months)
        6,        // targetMonths
        10000     // monthlySavings
      );

      expect(result.summary.monthlyRequired).toBe(0);
    });
  });
});
