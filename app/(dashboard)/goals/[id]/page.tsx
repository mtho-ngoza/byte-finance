'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useGoals, GoalWithComputed } from '@/hooks/use-goals';
import { useCommitments } from '@/hooks/use-commitments';
import { AmountDisplay } from '@/components/shared/amount-display';
import { CurrencyInput } from '@/components/shared/currency-input';
import { DateInput } from '@/components/shared/date-input';
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

interface UnlinkedPayment {
  paymentId: string;
  cycleItemId: string;
  cycleId: string;
  cycleName: string;
  itemLabel: string;
  amount: number;
  date: string;
  note?: string;
}

function GoalDetail({ goal, allCommitments }: GoalDetailProps) {
  const { toast } = useToast();
  const [showAddContribution, setShowAddContribution] = useState(false);
  const [contributionAmount, setContributionAmount] = useState(0);
  const [contributionDate, setContributionDate] = useState(new Date().toISOString().split('T')[0]);
  const [contributionNote, setContributionNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Link past payments state
  const [showLinkPayments, setShowLinkPayments] = useState(false);
  const [unlinkedPayments, setUnlinkedPayments] = useState<UnlinkedPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState(false);
  const [paymentSearch, setPaymentSearch] = useState('');

  const fetchUnlinkedPayments = async () => {
    setLoadingPayments(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}/unlinked-payments`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setUnlinkedPayments(data.payments ?? []);
    } catch {
      toast('Failed to load payments', 'error');
    } finally {
      setLoadingPayments(false);
    }
  };

  const togglePaymentSelection = (paymentKey: string) => {
    setSelectedPayments((prev) => {
      const next = new Set(prev);
      if (next.has(paymentKey)) {
        next.delete(paymentKey);
      } else {
        next.add(paymentKey);
      }
      return next;
    });
  };

  // Filter payments by search
  const filteredPayments = useMemo(() => {
    if (!paymentSearch.trim()) return unlinkedPayments;
    const q = paymentSearch.toLowerCase();
    return unlinkedPayments.filter((p) =>
      p.itemLabel.toLowerCase().includes(q) ||
      p.cycleName.toLowerCase().includes(q) ||
      (p.note && p.note.toLowerCase().includes(q))
    );
  }, [unlinkedPayments, paymentSearch]);

  const handleLinkPayments = async () => {
    if (selectedPayments.size === 0) return;

    const paymentsToLink = unlinkedPayments.filter((p) =>
      selectedPayments.has(`${p.cycleItemId}-${p.paymentId}`)
    );

    setLinking(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}/link-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payments: paymentsToLink }),
      });
      if (!res.ok) throw new Error('Failed to link');
      const data = await res.json();
      toast(`Linked ${data.linked} payments (R${(data.totalAdded / 100).toFixed(2)})`, 'success');
      setShowLinkPayments(false);
      setSelectedPayments(new Set());
      setPaymentSearch('');
      setUnlinkedPayments([]);
    } catch {
      toast('Failed to link payments', 'error');
    } finally {
      setLinking(false);
    }
  };

  const progressPercent = goal.targetAmount > 0
    ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
    : 0;

  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);

  const handleAddContribution = async () => {
    if (contributionAmount <= 0) {
      toast('Please enter a valid amount', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}/contribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: contributionAmount,
          date: contributionDate,
          note: contributionNote.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to add contribution');
      toast('Contribution added', 'success');
      setShowAddContribution(false);
      setContributionAmount(0);
      setContributionNote('');
    } catch {
      toast('Failed to add contribution', 'error');
    } finally {
      setSaving(false);
    }
  };

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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-text-primary">
            Contribution History ({sortedContributions.length})
          </h2>
          {!showAddContribution && !showLinkPayments && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowLinkPayments(true);
                  fetchUnlinkedPayments();
                }}
                className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Link past
              </button>
              <button
                onClick={() => setShowAddContribution(true)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Add manual
              </button>
            </div>
          )}
        </div>

        {/* Link Past Payments UI */}
        {showLinkPayments && (
          <div className="mb-4 p-3 rounded-lg bg-background border border-border">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-text-secondary">Select payments to link to this goal</p>
              <button
                onClick={() => { setShowLinkPayments(false); setSelectedPayments(new Set()); setPaymentSearch(''); }}
                className="text-xs text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
            </div>

            {loadingPayments ? (
              <div className="flex items-center justify-center py-6">
                <svg className="w-5 h-5 animate-spin text-text-secondary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : unlinkedPayments.length === 0 ? (
              <p className="text-sm text-text-secondary text-center py-4">
                No unlinked payments found in recent cycles.
              </p>
            ) : (
              <>
                {/* Search input */}
                <div className="mb-3">
                  <input
                    type="text"
                    value={paymentSearch}
                    onChange={(e) => setPaymentSearch(e.target.value)}
                    placeholder="Search payments..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1 mb-3">
                  {filteredPayments.length === 0 ? (
                    <p className="text-sm text-text-secondary text-center py-4">
                      No payments match your search.
                    </p>
                  ) : filteredPayments.map((payment) => {
                    const key = `${payment.cycleItemId}-${payment.paymentId}`;
                    const isSelected = selectedPayments.has(key);
                    const date = new Date(payment.date);

                    return (
                      <label
                        key={key}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-surface border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => togglePaymentSelection(key)}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary truncate">{payment.itemLabel}</p>
                          <p className="text-xs text-text-secondary">
                            {date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {' · '}{payment.cycleName}
                            {payment.note && ` · ${payment.note}`}
                          </p>
                        </div>
                        <span className="text-sm font-mono text-text-primary shrink-0">
                          R{(payment.amount / 100).toFixed(2)}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {selectedPayments.size > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-xs text-text-secondary">
                      {selectedPayments.size} selected · R
                      {(unlinkedPayments
                        .filter((p) => selectedPayments.has(`${p.cycleItemId}-${p.paymentId}`))
                        .reduce((sum, p) => sum + p.amount, 0) / 100
                      ).toFixed(2)}
                    </span>
                    <button
                      onClick={handleLinkPayments}
                      disabled={linking}
                      className="px-3 py-1.5 rounded-lg bg-primary text-background text-sm font-medium disabled:opacity-50"
                    >
                      {linking ? 'Linking...' : 'Link Selected'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Add Contribution Form */}
        {showAddContribution && (
          <div className="mb-4 p-3 rounded-lg bg-background border border-border space-y-3">
            <p className="text-xs text-text-secondary">Record a past contribution</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Amount</label>
                <CurrencyInput value={contributionAmount} onChange={setContributionAmount} />
              </div>
              <DateInput
                label="Date"
                value={contributionDate}
                onChange={(e) => setContributionDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Note (optional)</label>
              <input
                type="text"
                value={contributionNote}
                onChange={(e) => setContributionNote(e.target.value)}
                placeholder="e.g. Bank transfer"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddContribution(false)}
                className="flex-1 py-2 rounded-lg border border-border text-text-secondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAddContribution}
                disabled={saving || contributionAmount <= 0}
                className="flex-1 py-2 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add Contribution'}
              </button>
            </div>
          </div>
        )}

        {sortedContributions.length === 0 && !showAddContribution ? (
          <p className="text-sm text-text-secondary text-center py-4">
            No contributions yet. Link a commitment and mark it as paid, or add a manual contribution.
          </p>
        ) : sortedContributions.length === 0 ? null : (
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
