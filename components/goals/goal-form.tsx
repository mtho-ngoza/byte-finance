'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CurrencyInput } from '@/components/shared/currency-input';
import type { Goal } from '@/types';

const GoalFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  type: z.enum(['savings', 'purchase', 'debt_payoff', 'milestone']),
  targetAmount: z.number().int().min(0).optional(),
  currentAmount: z.number().int().min(0),
  year: z.number().int().min(2000, 'Year must be 2000 or later'),
  priority: z.enum(['high', 'medium', 'low']),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  startDate: z.string().optional(),
  targetDate: z.string().optional(),
  expectedMonthlyContribution: z.number().int().min(0).optional(),
  linkedExpenseLabel: z.string().optional(),
  notes: z.string().optional(),
  // Debt tracking fields
  debtOriginalBalance: z.number().int().min(0).optional(),
  debtCurrentBalance: z.number().int().min(0).optional(),
  debtInterestRate: z.number().min(0).max(100).optional(),
  debtMinimumPayment: z.number().int().min(0).optional(),
  debtLender: z.string().optional(),
  debtAccountNumber: z.string().optional(),
});

type GoalFormValues = z.infer<typeof GoalFormSchema>;

interface GoalFormProps {
  goal?: Goal;
  onSubmit: (values: GoalFormValues) => Promise<void>;
  onCancel: () => void;
}

const GOAL_TYPES: { value: Goal['type']; label: string }[] = [
  { value: 'savings', label: 'Savings' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'debt_payoff', label: 'Debt Payoff' },
  { value: 'milestone', label: 'Milestone' },
];

const PRIORITIES: { value: Goal['priority']; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const STATUSES: { value: Goal['status']; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function timestampToDateString(ts: unknown): string {
  if (!ts) return '';
  const seconds = (ts as { seconds: number }).seconds;
  if (!seconds) return '';
  return new Date(seconds * 1000).toISOString().split('T')[0];
}

export function GoalForm({ goal, onSubmit, onCancel }: GoalFormProps) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = useForm<GoalFormValues>({
    resolver: zodResolver(GoalFormSchema),
    defaultValues: {
      title: goal?.title ?? '',
      type: goal?.type ?? 'savings',
      targetAmount: goal?.targetAmount ?? 0,
      currentAmount: goal?.currentAmount ?? 0,
      year: goal?.year ?? new Date().getFullYear(),
      priority: goal?.priority ?? 'medium',
      status: goal?.status ?? 'pending',
      startDate: timestampToDateString(goal?.startDate),
      targetDate: timestampToDateString(goal?.targetDate),
      expectedMonthlyContribution: goal?.expectedMonthlyContribution ?? 0,
      linkedExpenseLabel: goal?.linkedExpenseLabel ?? '',
      notes: goal?.notes ?? '',
      debtOriginalBalance: goal?.debtTracking?.originalBalance ?? 0,
      debtCurrentBalance: goal?.debtTracking?.currentBalance ?? 0,
      debtInterestRate: goal?.debtTracking?.interestRate ?? 0,
      debtMinimumPayment: goal?.debtTracking?.minimumPayment ?? 0,
      debtLender: goal?.debtTracking?.lender ?? '',
      debtAccountNumber: goal?.debtTracking?.accountNumber ?? '',
    },
  });

  const selectedType = watch('type');

  const handleFormSubmit = async (values: GoalFormValues) => {
    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Title */}
      <div>
        <label className="block text-sm text-text-secondary mb-1" htmlFor="goal-title">
          Title
        </label>
        <input
          id="goal-title"
          {...register('title')}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:outline-none focus:border-primary"
          placeholder="e.g. Emergency Fund"
        />
        {errors.title && <p className="text-danger text-xs mt-1">{errors.title.message}</p>}
      </div>

      {/* Type */}
      <div>
        <label className="block text-sm text-text-secondary mb-1">Type</label>
        <div className="grid grid-cols-2 gap-2">
          {GOAL_TYPES.map(({ value, label }) => (
            <label
              key={value}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                selectedType === value
                  ? 'border-primary text-primary'
                  : 'border-border text-text-secondary'
              }`}
            >
              <input type="radio" value={value} {...register('type')} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Target Amount */}
      <div>
        <label className="block text-sm text-text-secondary mb-1">Target Amount (optional)</label>
        <Controller
          name="targetAmount"
          control={control}
          render={({ field }) => (
            <CurrencyInput
              value={field.value ?? 0}
              onChange={field.onChange}
              placeholder="0.00"
            />
          )}
        />
      </div>

      {/* Current Amount */}
      <div>
        <label className="block text-sm text-text-secondary mb-1">Current Amount</label>
        <Controller
          name="currentAmount"
          control={control}
          render={({ field }) => (
            <CurrencyInput
              value={field.value}
              onChange={field.onChange}
              placeholder="0.00"
            />
          )}
        />
      </div>

      {/* Year and Priority */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-text-secondary mb-1" htmlFor="goal-year">
            Year
          </label>
          <input
            id="goal-year"
            type="number"
            min={2000}
            {...register('year', { valueAsNumber: true })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:outline-none focus:border-primary"
          />
          {errors.year && <p className="text-danger text-xs mt-1">{errors.year.message}</p>}
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">Priority</label>
          <select
            {...register('priority')}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:outline-none focus:border-primary"
          >
            {PRIORITIES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Status */}
      <div>
        <label className="block text-sm text-text-secondary mb-1">Status</label>
        <select
          {...register('status')}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:outline-none focus:border-primary"
        >
          {STATUSES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-text-secondary mb-1" htmlFor="goal-start-date">
            Start Date (optional)
          </label>
          <input
            id="goal-start-date"
            type="date"
            {...register('startDate')}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1" htmlFor="goal-target-date">
            Target Date (optional)
          </label>
          <input
            id="goal-target-date"
            type="date"
            {...register('targetDate')}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Expected Monthly Contribution */}
      <div>
        <label className="block text-sm text-text-secondary mb-1">
          Expected Monthly Contribution (optional)
        </label>
        <Controller
          name="expectedMonthlyContribution"
          control={control}
          render={({ field }) => (
            <CurrencyInput
              value={field.value ?? 0}
              onChange={field.onChange}
              placeholder="0.00"
            />
          )}
        />
      </div>

      {/* Linked Expense Label */}
      <div>
        <label className="block text-sm text-text-secondary mb-1" htmlFor="goal-linked-expense">
          Linked Expense Label (optional)
        </label>
        <input
          id="goal-linked-expense"
          {...register('linkedExpenseLabel')}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:outline-none focus:border-primary"
          placeholder="e.g. Savings"
        />
        <p className="text-xs text-text-secondary mt-1">
          Expenses with this label will auto-link to this goal
        </p>
      </div>

      {/* Debt Tracking (conditional) */}
      {selectedType === 'debt_payoff' && (
        <div className="rounded-lg border border-border p-3 space-y-3">
          <h4 className="text-sm font-medium text-text-primary">Debt Details</h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Original Balance</label>
              <Controller
                name="debtOriginalBalance"
                control={control}
                render={({ field }) => (
                  <CurrencyInput
                    value={field.value ?? 0}
                    onChange={field.onChange}
                    placeholder="0.00"
                  />
                )}
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Current Balance</label>
              <Controller
                name="debtCurrentBalance"
                control={control}
                render={({ field }) => (
                  <CurrencyInput
                    value={field.value ?? 0}
                    onChange={field.onChange}
                    placeholder="0.00"
                  />
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1" htmlFor="debt-interest">
                Interest Rate (%)
              </label>
              <input
                id="debt-interest"
                type="number"
                step="0.1"
                min={0}
                max={100}
                {...register('debtInterestRate', { valueAsNumber: true })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-primary"
                placeholder="e.g. 15.5"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Minimum Payment</label>
              <Controller
                name="debtMinimumPayment"
                control={control}
                render={({ field }) => (
                  <CurrencyInput
                    value={field.value ?? 0}
                    onChange={field.onChange}
                    placeholder="0.00"
                  />
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1" htmlFor="debt-lender">
                Lender
              </label>
              <input
                id="debt-lender"
                {...register('debtLender')}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-primary"
                placeholder="e.g. FNB"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1" htmlFor="debt-account">
                Account Number
              </label>
              <input
                id="debt-account"
                {...register('debtAccountNumber')}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-primary"
                placeholder="e.g. 1234567890"
              />
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-sm text-text-secondary mb-1" htmlFor="goal-notes">
          Notes (optional)
        </label>
        <textarea
          id="goal-notes"
          {...register('notes')}
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:outline-none focus:border-primary resize-none"
          placeholder="Any additional notes..."
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-border py-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-lg bg-primary py-2 text-background font-semibold disabled:opacity-50 transition-opacity"
        >
          {submitting ? 'Saving...' : goal ? 'Save Changes' : 'Create Goal'}
        </button>
      </div>
    </form>
  );
}
