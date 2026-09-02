'use client';

interface ResultSummaryProps {
  timeSaved?: number;
  interestSaved?: number;
  currentDate?: string;
  newDate?: string;
  monthlyRequired?: number;
  formatAmount: (cents: number) => string;
}

export function ResultSummary({
  timeSaved,
  interestSaved,
  currentDate,
  newDate,
  monthlyRequired,
  formatAmount,
}: ResultSummaryProps) {
  const formatDate = (iso: string | undefined) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('en-ZA', {
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {timeSaved !== undefined && timeSaved > 0 && (
        <div className="p-3 rounded-lg bg-success/10 border border-success/20">
          <div className="text-2xl font-bold text-success">{timeSaved}</div>
          <div className="text-xs text-success/80">months saved</div>
        </div>
      )}

      {interestSaved !== undefined && interestSaved > 0 && (
        <div className="p-3 rounded-lg bg-success/10 border border-success/20">
          <div className="text-2xl font-bold text-success">{formatAmount(interestSaved)}</div>
          <div className="text-xs text-success/80">interest saved</div>
        </div>
      )}

      {monthlyRequired !== undefined && monthlyRequired > 0 && (
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="text-2xl font-bold text-primary">{formatAmount(monthlyRequired)}</div>
          <div className="text-xs text-primary/80">monthly needed</div>
        </div>
      )}

      {currentDate && (
        <div className="p-3 rounded-lg bg-surface border border-border">
          <div className="text-lg font-medium text-text-primary">{formatDate(currentDate)}</div>
          <div className="text-xs text-text-secondary">current completion</div>
        </div>
      )}

      {newDate && (
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="text-lg font-medium text-primary">{formatDate(newDate)}</div>
          <div className="text-xs text-primary/80">new completion</div>
        </div>
      )}
    </div>
  );
}
