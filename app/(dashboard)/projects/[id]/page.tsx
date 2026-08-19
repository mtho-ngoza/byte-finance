'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

  if (loading) {
    return <div className="animate-pulse space-y-4"><div className="h-8 w-48 bg-surface rounded" /></div>;
  }

  if (!project) return null;

  const transactions = project.transactions || [];
  const sortedTransactions = [...transactions].sort((a, b) => {
    const dateA = typeof a.date === 'string' ? new Date(a.date) : (a.date as any).toDate();
    const dateB = typeof b.date === 'string' ? new Date(b.date) : (b.date as any).toDate();
    return dateB.getTime() - dateA.getTime();
  });

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{project.name}</h1>
        {project.description && (
          <p className="text-sm text-text-secondary mt-1">{project.description}</p>
        )}
      </div>

      {/* Pool balance */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <p className="text-xs text-text-secondary mb-1">Current Pool Balance</p>
        <AmountDisplay amount={project.currentAmount || 0} size="lg" />
        {project.targetAmount && (
          <p className="text-xs text-text-secondary mt-2">
            Target: <AmountDisplay amount={project.targetAmount} size="xs" />
          </p>
        )}
      </div>

      {/* Add transaction button */}
      <button
        onClick={() => setShowAddTransaction(true)}
        className="w-full py-2.5 rounded-lg bg-primary text-background font-medium text-sm"
      >
        + Add Contribution / Payment
      </button>

      {/* Transaction form */}
      {showAddTransaction && (
        <TransactionForm
          onSave={handleAddTransaction}
          onCancel={() => setShowAddTransaction(false)}
        />
      )}

      {/* Transactions */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">Transaction History</h2>
        {sortedTransactions.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-6">No transactions yet</p>
        ) : (
          sortedTransactions.map((txn) => (
            <TransactionCard key={txn.id} transaction={txn} />
          ))
        )}
      </div>
    </div>
  );
}

function TransactionCard({ transaction }: { transaction: any }) {
  const dateValue = transaction.date;
  const date = typeof dateValue === 'object' && 'toDate' in dateValue && dateValue.toDate
    ? dateValue.toDate()
    : new Date(dateValue as Date);

  const formattedDate = date.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const isContribution = transaction.type === 'contribution';

  return (
    <div className="bg-surface border border-border rounded-xl p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{isContribution ? '💰' : '💳'}</span>
            <span className="text-sm font-medium text-text-primary">
              {transaction.description}
            </span>
          </div>
          {transaction.contributorName && (
            <p className="text-xs text-text-secondary">From: {transaction.contributorName}</p>
          )}
          <p className="text-xs text-text-secondary">{formattedDate}</p>
        </div>
        <div className="text-right">
          <p className={`text-base font-semibold ${isContribution ? 'text-success' : 'text-error'}`}>
            {isContribution ? '+' : '-'}
            <AmountDisplay amount={transaction.amount} size="sm" />
          </p>
        </div>
      </div>
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
