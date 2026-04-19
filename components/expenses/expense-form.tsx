'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { CurrencyInput } from '@/components/shared/currency-input';
import type { Expense, ExpenseCategory } from '@/types';

const CATEGORIES: ExpenseCategory[] = [
  'housing', 'transport', 'family', 'business', 'living',
  'health', 'education', 'savings', 'entertainment', 'subscriptions', 'other',
];

interface ExpenseFormValues {
  label: string;
  amount: number;
  category: ExpenseCategory;
  accountType: 'personal' | 'business';
  dueDate: string;
  notes: string;
  tags: string;
}

interface ExpenseFormProps {
  folderId: string;
  expense?: Expense | null;
  onSubmit: (data: Partial<Expense>) => Promise<void>;
  onCancel: () => void;
}

export function ExpenseForm({ folderId, expense, onSubmit, onCancel }: ExpenseFormProps) {
  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<ExpenseFormValues>({
    defaultValues: {
      label: '',
      amount: 0,
      category: 'other',
      accountType: 'personal',
      dueDate: '',
      notes: '',
      tags: '',
    },
  });

  const amountValue = watch('amount');

  // Populate form when editing
  useEffect(() => {
    if (expense) {
      reset({
        label: expense.label,
        amount: expense.amount,
        category: expense.category,
        accountType: expense.accountType,
        dueDate: expense.dueDate
          ? new Date((expense.dueDate as unknown as { seconds: number }).seconds * 1000)
              .toISOString()
              .split('T')[0]
          : '',
        notes: expense.notes ?? '',
        tags: expense.tags?.join(', ') ?? '',
      });
    }
  }, [expense, reset]);

  async function onFormSubmit(values: ExpenseFormValues) {
    const tags = values.tags
      ? values.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const payload: Partial<Expense> = {
      folderId,
      label: values.label,
      amount: values.amount,
      category: values.category,
      accountType: values.accountType,
      notes: values.notes || undefined,
      tags: tags.length > 0 ? tags : undefined,
    };

    if (values.dueDate) {
      // Store as a plain object compatible with Firestore Timestamp shape
      const ts = new Date(values.dueDate).getTime() / 1000;
      (payload as Record<string, unknown>).dueDate = { seconds: Math.floor(ts), nanoseconds: 0 };
    }

    await onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      <h2 className="text-base font-semibold text-text-primary">
        {expense ? 'Edit Expense' : 'Add Expense'}
      </h2>

      {/* Label */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Label *</label>
        <input
          {...register('label', { required: 'Label is required' })}
          placeholder="e.g. Rent"
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary text-sm"
        />
        {errors.label && <p className="text-xs text-danger mt-1">{errors.label.message}</p>}
      </div>

      {/* Amount */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Amount *</label>
        <CurrencyInput
          value={amountValue}
          onChange={(cents) => setValue('amount', cents)}
        />
        {errors.amount && <p className="text-xs text-danger mt-1">Amount is required</p>}
      </div>

      {/* Category */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Category *</label>
        <select
          {...register('category', { required: true })}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary text-sm capitalize"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat} className="capitalize">
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Account type */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Account Type *</label>
        <div className="flex gap-2">
          {(['personal', 'business'] as const).map((type) => (
            <label key={type} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value={type}
                {...register('accountType')}
                className="accent-primary"
              />
              <span className="text-sm text-text-primary capitalize">{type}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Due date */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Due Date (optional)</label>
        <input
          type="date"
          {...register('dueDate')}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary text-sm"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Notes (optional)</label>
        <textarea
          {...register('notes')}
          rows={2}
          placeholder="Any additional notes..."
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary text-sm resize-none"
        />
      </div>

      {/* Tags */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Tags (optional, comma-separated)</label>
        <input
          {...register('tags')}
          placeholder="e.g. fixed, monthly"
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary text-sm"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg border border-border text-text-secondary text-sm hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? 'Saving…' : expense ? 'Save Changes' : 'Add Expense'}
        </button>
      </div>
    </form>
  );
}
