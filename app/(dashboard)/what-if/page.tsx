'use client';

import { useState } from 'react';
import { useGoals } from '@/hooks/use-goals';
import { ScenarioCard } from '@/components/what-if/scenario-card';
import { ResultSummary } from '@/components/what-if/result-summary';
import { ProjectionChart } from '@/components/what-if/projection-chart';
import { DebtComparison } from '@/components/what-if/debt-comparison';
import type { WhatIfScenarioType, WhatIfResult, DebtStrategyComparison } from '@/types';

type GoalType = 'savings' | 'debt_payoff' | 'investment';

const SCENARIOS: Array<{
  type: WhatIfScenarioType;
  title: string;
  description: string;
  icon: string;
  requiresGoal: boolean;
  goalTypes: GoalType[];
}> = [
  {
    type: 'extra_savings',
    title: 'Extra Savings',
    description: 'See how extra monthly savings affects your goals',
    icon: '💰',
    requiresGoal: true,
    goalTypes: ['savings', 'investment'],
  },
  {
    type: 'one_time_boost',
    title: 'One-Time Boost',
    description: 'Add a lump sum to a goal',
    icon: '🚀',
    requiresGoal: true,
    goalTypes: ['savings', 'investment'],
  },
  {
    type: 'extra_debt_payment',
    title: 'Extra Debt Payment',
    description: 'Pay more on a debt each month',
    icon: '💳',
    requiresGoal: true,
    goalTypes: ['debt_payoff'],
  },
  {
    type: 'debt_strategy',
    title: 'Debt Strategy',
    description: 'Compare snowball vs avalanche',
    icon: '⚖️',
    requiresGoal: false,
    goalTypes: ['debt_payoff'],
  },
  {
    type: 'emergency_buffer',
    title: 'Emergency Buffer',
    description: 'Calculate your safety net timeline',
    icon: '🛡️',
    requiresGoal: false,
    goalTypes: [],
  },
];

export default function WhatIfPage() {
  const { goals, goalsByType, loading } = useGoals();
  const [selectedScenario, setSelectedScenario] = useState<WhatIfScenarioType | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [targetMonths, setTargetMonths] = useState<string>('6');
  const [extraBudget, setExtraBudget] = useState<string>('');
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [debtComparison, setDebtComparison] = useState<DebtStrategyComparison | null>(null);
  const [goalName, setGoalName] = useState<string>('');

  const formatAmount = (cents: number) => {
    return `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
  };

  const scenarioConfig = SCENARIOS.find((s) => s.type === selectedScenario);
  const hasDebts = goalsByType.debt_payoff.length > 0;
  const hasSavingsGoals = goalsByType.savings.length > 0 || goalsByType.investment.length > 0;

  // Filter goals based on scenario type
  const availableGoals = selectedScenario
    ? goals.filter((g) => {
        const config = SCENARIOS.find((s) => s.type === selectedScenario);
        return config?.goalTypes.includes(g.type) && g.status === 'active';
      })
    : [];

  const handleCalculate = async () => {
    if (!selectedScenario) return;

    setCalculating(true);
    setResult(null);
    setDebtComparison(null);

    try {
      const body: Record<string, unknown> = { scenario: selectedScenario };

      if (selectedGoalId) body.goalId = selectedGoalId;
      if (amount) body.amount = Math.round(parseFloat(amount) * 100);
      if (targetMonths) body.targetMonths = parseInt(targetMonths);
      if (extraBudget) body.extraBudget = Math.round(parseFloat(extraBudget) * 100);

      const res = await fetch('/api/what-if', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Calculation failed');
      }

      const data = await res.json();

      if (selectedScenario === 'debt_strategy') {
        setDebtComparison(data.comparison);
      } else {
        setResult({
          currentTimeline: data.currentTimeline,
          scenarioTimeline: data.scenarioTimeline,
          summary: data.summary,
        });
        setGoalName(data.goalName || '');
      }
    } catch (error) {
      console.error('What-if calculation failed:', error);
    } finally {
      setCalculating(false);
    }
  };

  const resetForm = () => {
    setSelectedGoalId('');
    setAmount('');
    setResult(null);
    setDebtComparison(null);
    setGoalName('');
  };

  const handleScenarioSelect = (type: WhatIfScenarioType) => {
    setSelectedScenario(type);
    resetForm();
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">What If Calculator</h1>
        <p className="text-sm text-text-secondary mt-1">
          Explore hypothetical changes to your finances
        </p>
      </div>

      {/* Scenario Selection */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">Choose a scenario</h2>
        <div className="grid grid-cols-2 gap-3">
          {SCENARIOS.map((scenario) => {
            let disabled = false;
            if (scenario.goalTypes.includes('debt_payoff') && !hasDebts) {
              disabled = scenario.type !== 'debt_strategy' || !hasDebts;
            }
            if (
              scenario.requiresGoal &&
              scenario.goalTypes.some((t) => t === 'savings' || t === 'investment') &&
              !hasSavingsGoals
            ) {
              disabled = true;
            }

            return (
              <ScenarioCard
                key={scenario.type}
                type={scenario.type}
                title={scenario.title}
                description={scenario.description}
                icon={scenario.icon}
                selected={selectedScenario === scenario.type}
                onClick={() => handleScenarioSelect(scenario.type)}
                disabled={disabled}
              />
            );
          })}
        </div>
      </div>

      {/* Input Form */}
      {selectedScenario && (
        <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
          <h2 className="font-medium text-text-primary">{scenarioConfig?.title}</h2>

          {/* Goal selector for goal-specific scenarios */}
          {scenarioConfig?.requiresGoal && (
            <div>
              <label className="block text-sm text-text-secondary mb-1">Select Goal</label>
              <select
                value={selectedGoalId}
                onChange={(e) => setSelectedGoalId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary"
              >
                <option value="">Choose a goal...</option>
                {availableGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.name} ({formatAmount(goal.calculatedBalance)} / {formatAmount(goal.targetAmount)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Amount input for savings/debt scenarios */}
          {(selectedScenario === 'extra_savings' ||
            selectedScenario === 'one_time_boost' ||
            selectedScenario === 'extra_debt_payment') && (
            <div>
              <label className="block text-sm text-text-secondary mb-1">
                {selectedScenario === 'one_time_boost' ? 'Boost Amount (R)' : 'Extra Amount per Month (R)'}
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                placeholder="e.g., 500"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary"
              />
            </div>
          )}

          {/* Extra budget for debt strategy */}
          {selectedScenario === 'debt_strategy' && (
            <div>
              <label className="block text-sm text-text-secondary mb-1">
                Extra Monthly Budget Beyond Minimums (R)
              </label>
              <input
                type="number"
                value={extraBudget}
                onChange={(e) => setExtraBudget(e.target.value)}
                min="0"
                placeholder="e.g., 1000"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary"
              />
            </div>
          )}

          {/* Target months for emergency buffer */}
          {selectedScenario === 'emergency_buffer' && (
            <div>
              <label className="block text-sm text-text-secondary mb-1">
                Target Emergency Coverage (months)
              </label>
              <select
                value={targetMonths}
                onChange={(e) => setTargetMonths(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary"
              >
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="9">9 months</option>
                <option value="12">12 months</option>
              </select>
            </div>
          )}

          {/* Calculate button */}
          <button
            onClick={handleCalculate}
            disabled={
              calculating ||
              (scenarioConfig?.requiresGoal && !selectedGoalId) ||
              ((selectedScenario === 'extra_savings' ||
                selectedScenario === 'one_time_boost' ||
                selectedScenario === 'extra_debt_payment') &&
                !amount)
            }
            className="w-full py-2.5 rounded-lg bg-primary text-background font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {calculating ? 'Calculating...' : 'Calculate'}
          </button>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-text-primary">
              {goalName ? `Results for ${goalName}` : 'Results'}
            </h2>
            <button
              onClick={resetForm}
              className="text-sm text-text-secondary hover:text-text-primary"
            >
              Clear
            </button>
          </div>

          {/* Summary */}
          <ResultSummary
            timeSaved={result.summary.timeSaved}
            interestSaved={result.summary.interestSaved}
            currentDate={result.summary.currentCompletionDate}
            newDate={result.summary.newCompletionDate}
            monthlyRequired={result.summary.monthlyRequired}
            formatAmount={formatAmount}
          />

          {/* Chart */}
          {(result.currentTimeline.length > 0 || result.scenarioTimeline.length > 0) && (
            <div className="p-4 rounded-xl border border-border bg-surface">
              <h3 className="text-sm font-medium text-text-secondary mb-4">Projection</h3>
              <ProjectionChart
                currentTimeline={result.currentTimeline}
                scenarioTimeline={result.scenarioTimeline}
                formatAmount={formatAmount}
                isDebt={selectedScenario === 'extra_debt_payment'}
              />
            </div>
          )}
        </div>
      )}

      {/* Debt Strategy Comparison */}
      {debtComparison && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-text-primary">Debt Strategy Comparison</h2>
            <button
              onClick={resetForm}
              className="text-sm text-text-secondary hover:text-text-primary"
            >
              Clear
            </button>
          </div>

          <DebtComparison comparison={debtComparison} formatAmount={formatAmount} />
        </div>
      )}

      {/* Empty state */}
      {!selectedScenario && goals.length === 0 && (
        <div className="text-center py-8 text-text-secondary">
          <p className="text-4xl mb-3">🤔</p>
          <p className="text-sm">Create some goals first to use the What-If calculator</p>
        </div>
      )}
    </div>
  );
}
