'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useGoals, GoalWithComputed } from '@/hooks/use-goals';
import { useCommitments } from '@/hooks/use-commitments';
import { AmountDisplay } from '@/components/shared/amount-display';
import { useToast } from '@/components/shared/toast';

export default function GoalDetailPage() {
  const params = useParams();
  const goalId = params.id as string;
  const { goals, loading, commitments } = useGoals();
  const { allCommitments } = useCommitments();

  const goal = goals.find((g) => g.id === goalId);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="h-32 bg-surface rounded-xl" />
        <div className="h-64 bg-surface rounded-xl" />
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary mb-4">Goal not found</p>
        <Link href="/goals" className="text-primary hover:underline">
          Back to Goals
        </Link>
      </div>
    );
  }

  return <GoalDetail goal={goal} allCommitments={allCommitments} />;
}

// ---------------------------------------------------------------------------
// GoalDetail Component
// ---------------------------------------------------------------------------

interface GoalDetailProps {
  goal: GoalWithComputed;
  allCommitments: import('@/types').Commitment[];
}

function GoalDetail({ goal, allCommitments }: GoalDetailProps) {
  const progressPercent = goal.targetAmount > 0
    ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
    : 0;

  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);

  // Sort contributions by date descending
  const sortedContributions = useMemo(() => {
    return [...(goal.contributions ?? [])].sort((a, b) => {
      const dateA = a.date?.toDate?.() ?? new Date(0);
      const dateB = b.date?.toDate?.() ?? new Date(0);
      return dateB.getTime() - dateA.getTime();
    });
  }, [goal.contributions]);

  // Group contributions by month
  const contributionsByMonth = useMemo(() => {
    const groups = new Map<string, typeof sortedContributions>();

    for (const contrib of sortedContributions) {
      const date = contrib.date?.toDate?.() ?? new Date();
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(contrib);
    }

    return Array.from(groups.entries()).map(([key, contribs]) => {
      const [year, month] = key.split('-');
      const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1);
      return {
        label: date.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }),
        total: contribs.reduce((sum, c) => sum + c.amount, 0),
        contributions: contribs,
      };
    });
  }, [sortedContributions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/goals"
          className="p-2 rounded-lg text-text-secondary hover:bg-surface transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
            <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{goal.name}</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary capitalize">{goal.type.replace('_', ' ')}</span>
            {goal.isOnTrack ? (
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">On Track</span>
            ) : (
              <span className="text-xs px-1.5 py-0.5 rounded bg-warning/10 text-warning">Behind</span>
            )}
          </div>
        </div>
      </div>

      {/* Progress Card */}
      <div className="p-4 rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-text-secondary">Progress</span>
          <span className="text-sm font-medium text-text-primary">{progressPercent}%</span>
        </div>

        <div className="h-3 bg-background rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-text-secondary mb-1">Current</p>
            <AmountDisplay amount={goal.currentAmount} size="sm" />
          </div>
          <div>
            <p className="text-xs text-text-secondary mb-1">Target</p>
            <AmountDisplay amount={goal.targetAmount} size="sm" />
          </div>
          <div>
            <p className="text-xs text-text-secondary mb-1">Remaining</p>
            <AmountDisplay amount={remaining} size="sm" />
          </div>
        </div>
      </div>

      {/* Monthly Info Card */}
      <div className="p-4 rounded-xl border border-border bg-surface">
        <h2 className="text-sm font-medium text-text-primary mb-3">Monthly Contribution</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-text-secondary mb-1">Effective Monthly</p>
            <AmountDisplay amount={goal.effectiveMonthlyTarget} size="sm" />
            {goal.linkedCommitments.length > 0 && (
              <p className="text-xs text-text-secondary mt-1">From linked commitments</p>
            )}
          </div>
          <div>
            <p className="text-xs text-text-secondary mb-1">Manual Target</p>
            <AmountDisplay amount={goal.monthlyTarget ?? 0} size="sm" />
          </div>
        </div>

        {/* Linked Commitments — editable */}
        <LinkedCommitmentsEditor goal={goal} allCommitments={allCommitments} />
      </div>

      {/* Timeline Info */}
      {(goal.estimatedCompletionDate || goal.daysUntilDeadline !== null) && (
        <div className="p-4 rounded-xl border border-border bg-surface">
          <h2 className="text-sm font-medium text-text-primary mb-3">Timeline</h2>

          <div className="space-y-3">
            {goal.estimatedCompletionDate && goal.currentAmount < goal.targetAmount && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Estimated Completion</span>
                <span className="text-sm text-text-primary">
                  {goal.estimatedCompletionDate.toLocaleDateString('en-ZA', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </div>
            )}

            {goal.daysUntilDeadline !== null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Target Deadline</span>
                <span className={`text-sm ${goal.daysUntilDeadline < 30 ? 'text-warning' : 'text-text-primary'}`}>
                  {goal.daysUntilDeadline > 0
                    ? `${goal.daysUntilDeadline} days remaining`
                    : goal.daysUntilDeadline === 0
                    ? 'Today!'
                    : `${Math.abs(goal.daysUntilDeadline)} days overdue`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contribution History */}
      <div className="p-4 rounded-xl border border-border bg-surface">
        <h2 className="text-sm font-medium text-text-primary mb-3">
          Contribution History ({sortedContributions.length})
        </h2>

        {sortedContributions.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-4">
            No contributions yet. Link a commitment and mark it as paid to see contributions here.
          </p>
        ) : (
          <div className="space-y-4">
            {contributionsByMonth.map(({ label, total, contributions }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-text-secondary">{label}</span>
                  <AmountDisplay amount={total} size="xs" />
                </div>
                <div className="space-y-2">
                  {contributions.map((contrib) => {
                    const date = contrib.date?.toDate?.() ?? new Date();
                    return (
                      <div
                        key={contrib.id}
                        className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                      >
                        <div>
                          <p className="text-sm text-text-primary">
                            {date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                          </p>
                          {contrib.note && (
                            <p className="text-xs text-text-secondary">{contrib.note}</p>
                          )}
                        </div>
                        <AmountDisplay amount={contrib.amount} size="sm" />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      {goal.notes && (
        <div className="p-4 rounded-xl border border-border bg-surface">
          <h2 className="text-sm font-medium text-text-primary mb-2">Notes</h2>
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{goal.notes}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkedCommitmentsEditor
// ---------------------------------------------------------------------------

interface LinkedCommitmentsEditorProps {
  goal: GoalWithComputed;
  allCommitments: import('@/types').Commitment[];
}

function LinkedCommitmentsEditor({ goal, allCommitments }: LinkedCommitmentsEditorProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState<string | null>(null);

  // Commitments currently linked to this goal
  const linked = allCommitments.filter((c) => c.linkedGoalId === goal.id);
  // Commitments not linked to any goal (available to link)
  const available = allCommitments.filter((c) => !c.linkedGoalId && c.isActive);

  const link = async (commitmentId: string) => {
    setSaving(commitmentId);
    try {
      const res = await fetch(`/api/commitments/${commitmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedGoalId: goal.id }),
      });
      if (!res.ok) throw new Error('Failed');
      toast('Commitment linked', 'success');
    } catch {
      toast('Failed to link commitment', 'error');
    } finally {
      setSaving(null);
    }
  };

  const unlink = async (commitmentId: string) => {
    setSaving(commitmentId);
    try {
      const res = await fetch(`/api/commitments/${commitmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedGoalId: null }),
      });
      if (!res.ok) throw new Error('Failed');
      toast('Commitment unlinked', 'success');
    } catch {
      toast('Failed to unlink commitment', 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-3">
      <p className="text-xs font-medium text-text-secondary">Linked Commitments</p>

      {/* Currently linked */}
      {linked.length > 0 ? (
        <div className="space-y-2">
          {linked.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-sm text-text-primary truncate">{c.label}</span>
                {!c.isActive && <span className="ml-1.5 text-xs text-text-secondary">(inactive)</span>}
              </div>
              <AmountDisplay amount={c.amount} size="xs" className="shrink-0" />
              <button
                onClick={() => unlink(c.id)}
                disabled={saving === c.id}
                className="text-xs text-warning hover:text-warning/70 transition-colors disabled:opacity-50 shrink-0"
              >
                {saving === c.id ? '…' : 'Unlink'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-secondary">No commitments linked yet.</p>
      )}

      {/* Link a new commitment */}
      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) link(e.target.value); e.target.value = ''; }}
            disabled={saving !== null}
            className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-text-primary text-xs focus:outline-none focus:border-primary disabled:opacity-50"
          >
            <option value="" disabled>+ Link a commitment…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>{c.label} (R{(c.amount / 100).toFixed(0)}/mo)</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
