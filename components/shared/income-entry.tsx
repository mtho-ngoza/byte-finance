'use client';

import { useState, useEffect } from 'react';
import { useUserProfile } from '@/hooks/use-user-profile';
import { getLastWorkingDayOfMonth } from '@/lib/payday-utils';

interface IncomeEntryProps {
  cycleId: string;
  currentIncome?: {
    amount: number;
    vatAmount?: number;
    receivedDate?: { toDate?: () => Date } | string;
  };
  onSave: (income: { amount: number; vatAmount?: number; receivedDate: string }) => Promise<void>;
}

export function IncomeEntry({ cycleId, currentIncome, onSave }: IncomeEntryProps) {
  const { profile } = useUserProfile();
  const [amount, setAmount] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Parse cycle ID to get the previous month (when salary was received)
  const [cycleYear, cycleMonth] = cycleId.split('-').map(Number);
  const prevMonth = cycleMonth === 1 ? 12 : cycleMonth - 1;
  const prevYear = cycleMonth === 1 ? cycleYear - 1 : cycleYear;
  const fundingMonthName = new Date(prevYear, prevMonth - 1).toLocaleDateString('en-ZA', { month: 'long' });
  const budgetMonthName = new Date(cycleYear, cycleMonth - 1).toLocaleDateString('en-ZA', { month: 'long' });

  // Default received date to last working day of previous month
  useEffect(() => {
    if (!receivedDate && !currentIncome?.receivedDate) {
      const lastWorkingDay = getLastWorkingDayOfMonth(prevYear, prevMonth);
      setReceivedDate(lastWorkingDay.toISOString().split('T')[0]);
    }
  }, [prevYear, prevMonth, receivedDate, currentIncome?.receivedDate]);

  // Populate from current income if exists
  useEffect(() => {
    if (currentIncome?.amount) {
      setAmount((currentIncome.amount / 100).toString());
    }
    if (currentIncome?.receivedDate) {
      const date = typeof currentIncome.receivedDate === 'string'
        ? currentIncome.receivedDate
        : currentIncome.receivedDate.toDate?.()?.toISOString().split('T')[0];
      if (date) setReceivedDate(date);
    }
  }, [currentIncome]);

  const vatPercentage = profile?.preferences?.vatPercentage;
  const hasVat = vatPercentage && vatPercentage > 0;

  const amountCents = Math.round(parseFloat(amount || '0') * 100);
  const vatAmount = hasVat ? Math.round(amountCents * (vatPercentage / (100 + vatPercentage))) : 0;
  const netAmount = amountCents - vatAmount;

  const handleSave = async () => {
    if (!amount || !receivedDate) return;
    setSaving(true);
    try {
      await onSave({
        amount: amountCents,
        vatAmount: hasVat ? vatAmount : undefined,
        receivedDate,
      });
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  };

  const formatAmount = (cents: number) => {
    return `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
  };

  // If income already set, show summary
  if (currentIncome?.amount && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full p-4 rounded-xl border border-border bg-surface hover:border-primary/50 transition-colors text-left"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-text-secondary">{fundingMonthName} Salary</p>
            <p className="text-lg font-semibold text-text-primary">
              {formatAmount(currentIncome.amount)}
            </p>
            {currentIncome.vatAmount && currentIncome.vatAmount > 0 && (
              <p className="text-xs text-text-secondary">
                Net: {formatAmount(currentIncome.amount - currentIncome.vatAmount)} (excl. VAT)
              </p>
            )}
          </div>
          <span className="text-text-secondary">Edit</span>
        </div>
      </button>
    );
  }

  // If no income, show prominent prompt
  if (!currentIncome?.amount && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full p-4 rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 hover:bg-primary/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-xl">💰</span>
          </div>
          <div className="text-left">
            <p className="font-medium text-text-primary">Add {fundingMonthName} Salary</p>
            <p className="text-sm text-text-secondary">
              Enter the paycheck that funds your {budgetMonthName} budget
            </p>
          </div>
        </div>
      </button>
    );
  }

  // Expanded form
  return (
    <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-text-primary">{fundingMonthName} Salary</h3>
        <button
          onClick={() => setExpanded(false)}
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-text-secondary">
        This is the paycheck received at the end of {fundingMonthName} that funds your {budgetMonthName} budget.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Amount (R)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="90000"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Received Date</label>
          <input
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {hasVat && amountCents > 0 && (
        <div className="p-3 rounded-lg bg-background text-sm">
          <div className="flex justify-between text-text-secondary">
            <span>VAT ({vatPercentage}%)</span>
            <span>{formatAmount(vatAmount)}</span>
          </div>
          <div className="flex justify-between font-medium text-text-primary mt-1">
            <span>Net Income</span>
            <span>{formatAmount(netAmount)}</span>
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !amount || !receivedDate}
        className="w-full py-2.5 rounded-lg bg-primary text-background font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving...' : 'Save Income'}
      </button>
    </div>
  );
}
