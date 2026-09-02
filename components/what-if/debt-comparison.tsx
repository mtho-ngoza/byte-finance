'use client';

import type { DebtStrategyComparison } from '@/types';

interface DebtComparisonProps {
  comparison: DebtStrategyComparison;
  formatAmount: (cents: number) => string;
}

export function DebtComparison({ comparison, formatAmount }: DebtComparisonProps) {
  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-ZA', {
      month: 'short',
      year: 'numeric',
    });
  };

  const snowballWins = comparison.interestDifference < 0;
  const avalancheWins = comparison.interestDifference > 0;
  const tie = comparison.interestDifference === 0;

  return (
    <div className="space-y-4">
      {/* Comparison cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Snowball */}
        <div
          className={`p-4 rounded-xl border ${
            snowballWins ? 'border-success bg-success/5' : 'border-border bg-surface'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🔵</span>
            <h3 className="font-medium text-text-primary">Snowball</h3>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            Pay smallest balance first for quick wins
          </p>
          <div className="space-y-2">
            <div>
              <div className="text-lg font-semibold text-text-primary">
                {formatAmount(comparison.snowball.totalInterest)}
              </div>
              <div className="text-xs text-text-secondary">total interest</div>
            </div>
            <div>
              <div className="text-sm font-medium text-text-primary">
                {comparison.snowball.payoffMonths} months
              </div>
              <div className="text-xs text-text-secondary">
                {formatDate(comparison.snowball.payoffDate)}
              </div>
            </div>
          </div>
        </div>

        {/* Avalanche */}
        <div
          className={`p-4 rounded-xl border ${
            avalancheWins ? 'border-success bg-success/5' : 'border-border bg-surface'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🔴</span>
            <h3 className="font-medium text-text-primary">Avalanche</h3>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            Pay highest interest first to save most
          </p>
          <div className="space-y-2">
            <div>
              <div className="text-lg font-semibold text-text-primary">
                {formatAmount(comparison.avalanche.totalInterest)}
              </div>
              <div className="text-xs text-text-secondary">total interest</div>
            </div>
            <div>
              <div className="text-sm font-medium text-text-primary">
                {comparison.avalanche.payoffMonths} months
              </div>
              <div className="text-xs text-text-secondary">
                {formatDate(comparison.avalanche.payoffDate)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      {!tie && (
        <div className="p-3 rounded-lg bg-success/10 border border-success/20">
          <div className="flex items-center gap-2">
            <span className="text-success">✓</span>
            <span className="text-sm text-success">
              {avalancheWins ? 'Avalanche' : 'Snowball'} saves you{' '}
              <strong>{formatAmount(Math.abs(comparison.interestDifference))}</strong> in interest
              {comparison.timeDifference !== 0 && (
                <>
                  {' '}
                  and{' '}
                  <strong>
                    {Math.abs(comparison.timeDifference)} month
                    {Math.abs(comparison.timeDifference) !== 1 ? 's' : ''}
                  </strong>
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {tie && (
        <div className="p-3 rounded-lg bg-surface border border-border text-center">
          <span className="text-sm text-text-secondary">
            Both strategies result in the same outcome
          </span>
        </div>
      )}

      {/* Recommendation */}
      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
        <h4 className="text-sm font-medium text-primary mb-1">Recommendation</h4>
        <p className="text-xs text-text-secondary">
          {avalancheWins
            ? 'Avalanche method saves the most money mathematically. Use this if you can stay motivated without quick wins.'
            : snowballWins
            ? 'Snowball method pays off debts faster. The psychological wins can help you stay on track.'
            : 'Either method works! Choose based on what keeps you motivated.'}
        </p>
      </div>
    </div>
  );
}
