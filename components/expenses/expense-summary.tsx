'use client';

import { AmountDisplay } from '@/components/shared/amount-display';
import type { Expense, Folder } from '@/types';

interface ExpenseSummaryProps {
  expenses: Expense[];
  folder: Folder;
}

export function ExpenseSummary({ expenses, folder }: ExpenseSummaryProps) {
  const totalBudgeted = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalPaid = expenses.reduce((sum, e) => (e.status === 'paid' ? sum + e.amount : sum), 0);
  const income = folder.income?.amount ?? 0;
  const balance = income > 0 ? income - totalBudgeted : totalBudgeted - totalPaid;

  const balanceLabel = income > 0 ? 'Balance (income − budgeted)' : 'Remaining (budgeted − paid)';
  const isNegativeBalance = income > 0 && balance < 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="grid grid-cols-3 gap-4">
        {/* Total budgeted */}
        <div className="text-center">
          <p className="text-xs text-text-secondary mb-1">Budgeted</p>
          <AmountDisplay amount={totalBudgeted} size="sm" className="text-text-primary" />
        </div>

        {/* Total paid */}
        <div className="text-center">
          <p className="text-xs text-text-secondary mb-1">Paid</p>
          <AmountDisplay amount={totalPaid} size="sm" className="text-primary" />
        </div>

        {/* Balance */}
        <div className="text-center">
          <p className="text-xs text-text-secondary mb-1 truncate" title={balanceLabel}>
            {income > 0 ? 'Balance' : 'Remaining'}
          </p>
          <AmountDisplay
            amount={Math.abs(balance)}
            size="sm"
            className={isNegativeBalance ? 'text-danger' : 'text-warning'}
          />
          {isNegativeBalance && (
            <p className="text-xs text-danger mt-0.5">Over budget</p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {totalBudgeted > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-text-secondary mb-1">
            <span>{Math.round((totalPaid / totalBudgeted) * 100)}% paid</span>
            <span>{expenses.filter((e) => e.status === 'paid').length}/{expenses.length} items</span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (totalPaid / totalBudgeted) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
