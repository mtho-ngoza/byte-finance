import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  calculateExtraSavings,
  calculateOneTimeBoost,
  calculateExtraDebtPayment,
  compareDebtStrategies,
  calculateEmergencyBuffer,
} from '@/lib/what-if-calculator';
import type { Goal } from '@/types';

export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const { scenario, goalId, amount, targetMonths, extraBudget } = body;

  if (!scenario) {
    return NextResponse.json({ error: 'scenario is required' }, { status: 400 });
  }

  const db = getAdminDb();

  try {
    switch (scenario) {
      case 'extra_savings': {
        if (!goalId || amount === undefined) {
          return NextResponse.json(
            { error: 'goalId and amount are required for extra_savings' },
            { status: 400 }
          );
        }

        const goalDoc = await db.doc(`users/${userId}/goals/${goalId}`).get();
        if (!goalDoc.exists) {
          return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
        }

        const goal = { id: goalDoc.id, ...goalDoc.data() } as Goal;
        const currentBalance = (goal.contributions ?? []).reduce((sum, c) => sum + c.amount, 0);
        const monthlyTarget = goal.monthlyTarget ?? 0;

        // Get linked commitment amounts
        const commitmentsSnap = await db
          .collection(`users/${userId}/commitments`)
          .where('linkedGoalId', '==', goalId)
          .where('isActive', '==', true)
          .get();
        const linkedAmount = commitmentsSnap.docs.reduce((sum, doc) => sum + (doc.data().amount ?? 0), 0);
        const effectiveMonthly = linkedAmount > 0 ? linkedAmount : monthlyTarget;

        const result = calculateExtraSavings(
          currentBalance,
          goal.targetAmount,
          effectiveMonthly,
          amount
        );

        return NextResponse.json({
          scenario: 'extra_savings',
          goalName: goal.name,
          input: { extraAmount: amount, currentMonthly: effectiveMonthly },
          ...result,
        });
      }

      case 'one_time_boost': {
        if (!goalId || amount === undefined) {
          return NextResponse.json(
            { error: 'goalId and amount are required for one_time_boost' },
            { status: 400 }
          );
        }

        const goalDoc = await db.doc(`users/${userId}/goals/${goalId}`).get();
        if (!goalDoc.exists) {
          return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
        }

        const goal = { id: goalDoc.id, ...goalDoc.data() } as Goal;
        const currentBalance = (goal.contributions ?? []).reduce((sum, c) => sum + c.amount, 0);
        const monthlyTarget = goal.monthlyTarget ?? 0;

        // Get linked commitment amounts
        const commitmentsSnap = await db
          .collection(`users/${userId}/commitments`)
          .where('linkedGoalId', '==', goalId)
          .where('isActive', '==', true)
          .get();
        const linkedAmount = commitmentsSnap.docs.reduce((sum, doc) => sum + (doc.data().amount ?? 0), 0);
        const effectiveMonthly = linkedAmount > 0 ? linkedAmount : monthlyTarget;

        const result = calculateOneTimeBoost(
          currentBalance,
          goal.targetAmount,
          effectiveMonthly,
          amount
        );

        return NextResponse.json({
          scenario: 'one_time_boost',
          goalName: goal.name,
          input: { boostAmount: amount, currentMonthly: effectiveMonthly },
          ...result,
        });
      }

      case 'extra_debt_payment': {
        if (!goalId || amount === undefined) {
          return NextResponse.json(
            { error: 'goalId and amount are required for extra_debt_payment' },
            { status: 400 }
          );
        }

        const goalDoc = await db.doc(`users/${userId}/goals/${goalId}`).get();
        if (!goalDoc.exists) {
          return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
        }

        const goal = { id: goalDoc.id, ...goalDoc.data() } as Goal;
        if (goal.type !== 'debt_payoff' || !goal.debtTracking) {
          return NextResponse.json(
            { error: 'Goal must be a debt_payoff type with debt tracking' },
            { status: 400 }
          );
        }

        // Current balance = original - contributions (what's been paid off)
        const paidOff = (goal.contributions ?? []).reduce((sum, c) => sum + c.amount, 0);
        const currentBalance = goal.debtTracking.originalBalance - paidOff;

        const result = calculateExtraDebtPayment(
          currentBalance,
          goal.debtTracking.interestRate ?? 0,
          goal.debtTracking.minimumPayment ?? 0,
          amount
        );

        return NextResponse.json({
          scenario: 'extra_debt_payment',
          goalName: goal.name,
          input: {
            extraPayment: amount,
            minimumPayment: goal.debtTracking.minimumPayment ?? 0,
            interestRate: goal.debtTracking.interestRate ?? 0,
          },
          ...result,
        });
      }

      case 'debt_strategy': {
        // Get all debt_payoff goals
        const goalsSnap = await db
          .collection(`users/${userId}/goals`)
          .where('type', '==', 'debt_payoff')
          .where('status', '==', 'active')
          .get();

        const debts = goalsSnap.docs
          .map((doc) => {
            const data = doc.data() as Goal;
            if (!data.debtTracking) return null;

            const paidOff = (data.contributions ?? []).reduce((sum, c) => sum + c.amount, 0);
            const currentBalance = data.debtTracking.originalBalance - paidOff;

            if (currentBalance <= 0) return null;

            return {
              id: doc.id,
              name: data.name,
              balance: currentBalance,
              interestRate: data.debtTracking.interestRate ?? 0,
              minimumPayment: data.debtTracking.minimumPayment ?? 0,
            };
          })
          .filter((d): d is NonNullable<typeof d> => d !== null);

        if (debts.length === 0) {
          return NextResponse.json(
            { error: 'No active debts found for comparison' },
            { status: 400 }
          );
        }

        const result = compareDebtStrategies(debts, extraBudget ?? 0);

        return NextResponse.json({
          scenario: 'debt_strategy',
          debts: debts.map((d) => ({ id: d.id, name: d.name, balance: d.balance })),
          input: { extraBudget: extraBudget ?? 0 },
          comparison: result,
        });
      }

      case 'emergency_buffer': {
        if (targetMonths === undefined) {
          return NextResponse.json(
            { error: 'targetMonths is required for emergency_buffer' },
            { status: 400 }
          );
        }

        // Get current cycle for monthly expenses
        const now = new Date();
        const cycleId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const cycleDoc = await db.doc(`users/${userId}/cycles/${cycleId}`).get();

        let monthlyExpenses = 0;
        if (cycleDoc.exists) {
          monthlyExpenses = cycleDoc.data()?.totalCommitted ?? 0;
        }

        // Find emergency fund goal
        const emergencyGoalsSnap = await db
          .collection(`users/${userId}/goals`)
          .where('type', '==', 'savings')
          .where('status', '==', 'active')
          .get();

        // Look for a goal with "emergency" in the name
        const emergencyGoal = emergencyGoalsSnap.docs.find((doc) =>
          doc.data().name.toLowerCase().includes('emergency')
        );

        let currentBalance = 0;
        let monthlySavings = 0;
        let goalName = 'Emergency Fund';

        if (emergencyGoal) {
          const data = emergencyGoal.data() as Goal;
          currentBalance = (data.contributions ?? []).reduce((sum, c) => sum + c.amount, 0);
          monthlySavings = data.monthlyTarget ?? 0;
          goalName = data.name;

          // Check for linked commitments
          const commitmentsSnap = await db
            .collection(`users/${userId}/commitments`)
            .where('linkedGoalId', '==', emergencyGoal.id)
            .where('isActive', '==', true)
            .get();
          const linkedAmount = commitmentsSnap.docs.reduce(
            (sum, doc) => sum + (doc.data().amount ?? 0),
            0
          );
          if (linkedAmount > 0) {
            monthlySavings = linkedAmount;
          }
        }

        const result = calculateEmergencyBuffer(
          monthlyExpenses,
          currentBalance,
          targetMonths,
          monthlySavings
        );

        return NextResponse.json({
          scenario: 'emergency_buffer',
          goalName,
          input: {
            monthlyExpenses,
            currentBalance,
            targetMonths,
            currentMonthlySavings: monthlySavings,
          },
          ...result,
        });
      }

      default:
        return NextResponse.json({ error: 'Unknown scenario type' }, { status: 400 });
    }
  } catch (error) {
    console.error('What-if calculation error:', error);
    return NextResponse.json({ error: 'Calculation failed' }, { status: 500 });
  }
}
