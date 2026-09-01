'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AmountDisplay } from '@/components/shared/amount-display';
import { CurrencyInput } from '@/components/shared/currency-input';
import { DateInput } from '@/components/shared/date-input';
import { InlineReceiptCapture } from '@/components/shared/inline-receipt-capture';
import { useToast } from '@/components/shared/toast';
import type { Project } from '@/types';

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<any | null>(null);
  const [showEditProject, setShowEditProject] = useState(false);

  useEffect(() => {
    fetchProject();
  }, [id]);

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error('Project not found');
      const data = await res.json();
      setProject(data);
    } catch (error) {
      console.error('Failed to fetch project:', error);
      toast('Project not found', 'error');
      router.push('/projects');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTransaction = async (transactionData: any) => {
    try {
      const res = await fetch(`/api/projects/${id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transactionData),
      });
      if (!res.ok) throw new Error('Failed to add transaction');
      await fetchProject();
      setShowAddTransaction(false);
      toast('Transaction added successfully', 'success');
    } catch (error) {
      console.error('Failed to add transaction:', error);
      toast('Failed to add transaction', 'error');
    }
  };

  const handleEditTransaction = async (transactionId: string, data: any) => {
    try {
      const res = await fetch(`/api/projects/${id}/transactions/${transactionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update transaction');
      await fetchProject();
      setEditingTransaction(null);
      toast('Transaction updated', 'success');
    } catch (error) {
      console.error('Failed to update transaction:', error);
      toast('Failed to update transaction', 'error');
    }
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    try {
      const res = await fetch(`/api/projects/${id}/transactions/${transactionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete transaction');
      await fetchProject();
      toast('Transaction deleted', 'success');
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      toast('Failed to delete transaction', 'error');
    }
  };

  const handleEditProject = async (data: any) => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update project');
      await fetchProject();
      setShowEditProject(false);
      toast('Project updated', 'success');
    } catch (error) {
      console.error('Failed to update project:', error);
      toast('Failed to update project', 'error');
    }
  };

  if (loading) {
    return <div className="animate-pulse space-y-4"><div className="h-8 w-48 bg-surface rounded" /></div>;
  }

  if (!project) return null;

  // Helper to parse various date formats from API/Firestore
  const parseDate = (dateValue: unknown): Date => {
    if (!dateValue) return new Date();
    if (typeof dateValue === 'string') return new Date(dateValue);
    if (dateValue instanceof Date) return dateValue;
    // Firestore Timestamp serialized to JSON: { _seconds, _nanoseconds }
    if (typeof dateValue === 'object' && '_seconds' in (dateValue as object)) {
      return new Date((dateValue as { _seconds: number })._seconds * 1000);
    }
    // Firestore Timestamp with toDate method
    if (typeof dateValue === 'object' && 'toDate' in (dateValue as object)) {
      return (dateValue as { toDate: () => Date }).toDate();
    }
    return new Date();
  };

  const transactions = project.transactions || [];
  const sortedTransactions = [...transactions].sort((a, b) => {
    const dateA = parseDate(a.date);
    const dateB = parseDate(b.date);
    return dateB.getTime() - dateA.getTime();
  });

  // Group transactions by month
  const groupedTransactions = sortedTransactions.reduce((groups, txn) => {
    const date = parseDate(txn.date);
    const monthKey = date.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
    if (!groups[monthKey]) {
      groups[monthKey] = [];
    }
    groups[monthKey].push(txn);
    return groups;
  }, {} as Record<string, typeof sortedTransactions>);

  // Calculate balance from transactions (always accurate)
  const calculatedBalance = transactions.reduce((sum, txn) => {
    return sum + (txn.type === 'contribution' ? txn.amount : -txn.amount);
  }, 0);

  // Calculate totals for summary
  const totalContributions = transactions
    .filter(t => t.type === 'contribution')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalPayments = transactions
    .filter(t => t.type === 'payment')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-text-secondary mt-1">{project.description}</p>
          )}
        </div>
        <button
          onClick={() => setShowEditProject(true)}
          className="p-2 rounded-lg hover:bg-surface text-text-secondary"
          title="Edit project"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </div>

      {/* Edit project form */}
      {showEditProject && (
        <ProjectEditForm
          project={project}
          onSave={handleEditProject}
          onCancel={() => setShowEditProject(false)}
        />
      )}

      {/* Pool balance */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <p className="text-xs text-text-secondary mb-1">Current Pool Balance</p>
        <AmountDisplay amount={calculatedBalance} size="lg" />
        {project.targetAmount && project.targetAmount > 0 && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-text-secondary mb-1">
              <span>Target</span>
              <AmountDisplay amount={project.targetAmount} size="xs" />
            </div>
            <div className="h-1.5 bg-background rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(100, (calculatedBalance / project.targetAmount) * 100)}%` }}
              />
            </div>
          </div>
        )}
        <div className="flex gap-4 mt-3 pt-3 border-t border-border">
          <div className="flex-1">
            <p className="text-xs text-text-secondary">Total In</p>
            <p className="text-sm font-medium text-success">+<AmountDisplay amount={totalContributions} size="sm" /></p>
          </div>
          <div className="flex-1">
            <p className="text-xs text-text-secondary">Total Out</p>
            <p className="text-sm font-medium text-error">-<AmountDisplay amount={totalPayments} size="sm" /></p>
          </div>
        </div>
      </div>

      {/* Add transaction button */}
      <button
        onClick={() => setShowAddTransaction(true)}
        className="w-full py-2.5 rounded-lg bg-primary text-background font-medium text-sm"
      >
        + Add Contribution / Payment
      </button>

      {/* Add transaction form */}
      {showAddTransaction && (
        <TransactionForm
          onSave={handleAddTransaction}
          onCancel={() => setShowAddTransaction(false)}
        />
      )}

      {/* Edit transaction form */}
      {editingTransaction && (
        <EditTransactionForm
          transaction={editingTransaction}
          parseDate={parseDate}
          onSave={(data) => handleEditTransaction(editingTransaction.id, data)}
          onCancel={() => setEditingTransaction(null)}
        />
      )}

      {/* Transactions */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-text-secondary">Transaction History</h2>
        {sortedTransactions.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-6">No transactions yet</p>
        ) : (
          Object.entries(groupedTransactions).map(([month, txns]) => (
            <div key={month} className="space-y-2">
              <h3 className="text-xs font-medium text-text-secondary sticky top-0 bg-background py-1">{month}</h3>
              <div className="space-y-2">
                {txns.map((txn) => (
                  <TransactionCard
                    key={txn.id}
                    transaction={txn}
                    parseDate={parseDate}
                    onEdit={() => setEditingTransaction(txn)}
                    onDelete={() => handleDeleteTransaction(txn.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TransactionCard({
  transaction,
  parseDate,
  onEdit,
  onDelete,
}: {
  transaction: any;
  parseDate: (d: unknown) => Date;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const date = parseDate(transaction.date);
  const dayLabel = date.getDate();
  const isContribution = transaction.type === 'contribution';

  return (
    <div
      className="flex items-center gap-3 bg-surface border border-border rounded-lg p-3 relative"
      onClick={() => setShowActions(!showActions)}
    >
      {/* Day badge */}
      <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center shrink-0">
        <span className="text-sm font-semibold text-text-primary">{dayLabel}</span>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{transaction.description}</p>
        <div className="flex items-center gap-2">
          {transaction.contributorName && (
            <p className="text-xs text-text-secondary">From: {transaction.contributorName}</p>
          )}
          {transaction.receiptId && (
            <Link
              href={`/receipts/${transaction.receiptId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Receipt
            </Link>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className={`text-sm font-semibold shrink-0 ${isContribution ? 'text-success' : 'text-error'}`}>
        {isContribution ? '+' : '-'}<AmountDisplay amount={transaction.amount} size="sm" />
      </div>

      {/* Action buttons - show on tap */}
      {showActions && !confirmDelete && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 bg-surface border border-border rounded-lg p-1 shadow-lg z-10">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-2 rounded hover:bg-background text-text-secondary"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            className="p-2 rounded hover:bg-background text-error"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="absolute inset-0 bg-surface/95 rounded-lg flex items-center justify-center gap-2 z-10">
          <span className="text-xs text-text-secondary">Delete?</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="px-3 py-1 rounded bg-error text-white text-xs font-medium"
          >
            Yes
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); setShowActions(false); }}
            className="px-3 py-1 rounded bg-surface border border-border text-text-secondary text-xs"
          >
            No
          </button>
        </div>
      )}
    </div>
  );
}

function TransactionForm({ onSave, onCancel }: {
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<'contribution' | 'payment'>('contribution');
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');
  const [contributorName, setContributorName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptId, setReceiptId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      toast('Amount must be positive', 'error');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        type,
        amount,
        description,
        contributorName: contributorName || undefined,
        date,
        receiptId,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">Add Transaction</h3>
            <button type="button" onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-background text-text-secondary">
              ✕
            </button>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            >
              <option value="contribution">💰 Contribution (Money IN)</option>
              <option value="payment">💳 Payment (Money OUT)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Amount</label>
            <CurrencyInput value={amount} onChange={setAmount} />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Description</label>
            <input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === 'contribution' ? 'e.g., First installment' : 'e.g., Materials deposit'}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          {type === 'contribution' && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Contributor Name (optional)</label>
              <input
                value={contributorName}
                onChange={(e) => setContributorName(e.target.value)}
                placeholder="e.g., Uncle Joe"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
              />
            </div>
          )}

          {type === 'payment' && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Receipt (optional)</label>
              <InlineReceiptCapture
                onCaptured={(id) => setReceiptId(id)}
                onError={(msg) => toast(msg, 'error')}
              />
            </div>
          )}

          <DateInput
            label="Date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border text-text-secondary text-sm font-medium">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50">
              {saving ? 'Adding...' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditTransactionForm({
  transaction,
  parseDate,
  onSave,
  onCancel,
}: {
  transaction: any;
  parseDate: (d: unknown) => Date;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<'contribution' | 'payment'>(transaction.type);
  const [amount, setAmount] = useState(transaction.amount);
  const [description, setDescription] = useState(transaction.description);
  const [contributorName, setContributorName] = useState(transaction.contributorName || '');
  const [date, setDate] = useState(parseDate(transaction.date).toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      toast('Amount must be positive', 'error');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        type,
        amount,
        description,
        contributorName: contributorName || undefined,
        date,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">Edit Transaction</h3>
            <button type="button" onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-background text-text-secondary">
              ✕
            </button>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            >
              <option value="contribution">Contribution (Money IN)</option>
              <option value="payment">Payment (Money OUT)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Amount</label>
            <CurrencyInput value={amount} onChange={setAmount} />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Description</label>
            <input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          {type === 'contribution' && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Contributor Name (optional)</label>
              <input
                value={contributorName}
                onChange={(e) => setContributorName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
              />
            </div>
          )}

          <DateInput
            label="Date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border text-text-secondary text-sm font-medium">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProjectEditForm({
  project,
  onSave,
  onCancel,
}: {
  project: Project;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [type, setType] = useState(project.type);
  const [targetAmount, setTargetAmount] = useState(project.targetAmount || 0);
  const [status, setStatus] = useState(project.status);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast('Name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        type,
        targetAmount: targetAmount || null,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">Edit Project</h3>
            <button type="button" onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-background text-text-secondary">
              ✕
            </button>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
              >
                <option value="construction">Construction</option>
                <option value="family">Family</option>
                <option value="event">Event</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Target Amount (optional)</label>
            <CurrencyInput value={targetAmount} onChange={setTargetAmount} />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border text-text-secondary text-sm font-medium">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
