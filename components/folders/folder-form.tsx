'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Folder } from '@/types';

const FolderFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['monthly', 'project', 'savings', 'goals']),
  icon: z.string().optional(),
  color: z.string().optional(),
  period: z
    .object({
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(2000),
    })
    .optional(),
  income: z
    .object({
      amount: z.number().int().positive('Income must be a positive amount'),
      source: z.string().optional(),
      verified: z.boolean(),
    })
    .optional(),
});

type FolderFormValues = z.infer<typeof FolderFormSchema>;

interface FolderFormProps {
  /** Existing folder for edit mode */
  folder?: Folder;
  onSubmit: (values: FolderFormValues) => Promise<void>;
  onCancel: () => void;
}

const FOLDER_TYPES: { value: Folder['type']; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'project', label: 'Project' },
  { value: 'savings', label: 'Savings' },
  { value: 'goals', label: 'Goals' },
];

const PRESET_COLORS = [
  '#22c55e', '#3b82f6', '#f59e0b', '#ef4444',
  '#a855f7', '#ec4899', '#14b8a6', '#f97316',
];

export function FolderForm({ folder, onSubmit, onCancel }: FolderFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [showIncome, setShowIncome] = useState(!!folder?.income);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FolderFormValues>({
    resolver: zodResolver(FolderFormSchema),
    defaultValues: {
      name: folder?.name ?? '',
      type: folder?.type ?? 'monthly',
      icon: folder?.icon ?? '',
      color: folder?.color ?? '',
      period: folder?.period,
      income: folder?.income
        ? {
            amount: folder.income.amount,
            source: folder.income.source ?? '',
            verified: folder.income.verified,
          }
        : undefined,
    },
  });

  const selectedType = watch('type');
  const selectedColor = watch('color');

  const handleFormSubmit = async (values: FolderFormValues) => {
    setSubmitting(true);
    try {
      // Strip income if the section was hidden
      if (!showIncome) {
        values.income = undefined;
      }
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm text-text-secondary mb-1" htmlFor="folder-name">
          Name
        </label>
        <input
          id="folder-name"
          {...register('name')}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:outline-none focus:border-primary"
          placeholder="e.g. March 2026"
        />
        {errors.name && <p className="text-danger text-xs mt-1">{errors.name.message}</p>}
      </div>

      {/* Type */}
      <div>
        <label className="block text-sm text-text-secondary mb-1">Type</label>
        <div className="grid grid-cols-2 gap-2">
          {FOLDER_TYPES.map(({ value, label }) => (
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

      {/* Monthly period */}
      {selectedType === 'monthly' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-text-secondary mb-1" htmlFor="folder-month">
              Month
            </label>
            <input
              id="folder-month"
              type="number"
              min={1}
              max={12}
              {...register('period.month', { valueAsNumber: true })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1" htmlFor="folder-year">
              Year
            </label>
            <input
              id="folder-year"
              type="number"
              min={2000}
              {...register('period.year', { valueAsNumber: true })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      )}

      {/* Icon */}
      <div>
        <label className="block text-sm text-text-secondary mb-1" htmlFor="folder-icon">
          Icon (emoji)
        </label>
        <input
          id="folder-icon"
          {...register('icon')}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:outline-none focus:border-primary"
          placeholder="📁"
          maxLength={4}
        />
      </div>

      {/* Color */}
      <div>
        <label className="block text-sm text-text-secondary mb-2">Colour</label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setValue('color', color)}
              className={`w-7 h-7 rounded-full border-2 transition-transform ${
                selectedColor === color ? 'border-white scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Select colour ${color}`}
            />
          ))}
          {/* Clear colour */}
          {selectedColor && (
            <button
              type="button"
              onClick={() => setValue('color', '')}
              className="w-7 h-7 rounded-full border border-border text-text-secondary text-xs flex items-center justify-center hover:border-primary transition-colors"
              aria-label="Clear colour"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Income section (monthly folders) */}
      {selectedType === 'monthly' && (
        <div className="rounded-lg border border-border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Income</span>
            <button
              type="button"
              onClick={() => setShowIncome((v) => !v)}
              className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                showIncome
                  ? 'border-primary text-primary'
                  : 'border-border text-text-secondary hover:border-primary/50'
              }`}
            >
              {showIncome ? 'Hide' : 'Add income'}
            </button>
          </div>

          {showIncome && (
            <>
              {/* Amount in rands — convert to cents on submit */}
              <div>
                <label className="block text-xs text-text-secondary mb-1" htmlFor="income-amount">
                  Amount (ZAR cents)
                </label>
                <input
                  id="income-amount"
                  type="number"
                  min={1}
                  step={1}
                  {...register('income.amount', { valueAsNumber: true })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:outline-none focus:border-primary text-sm"
                  placeholder="e.g. 2500000 for R25,000"
                />
                {errors.income?.amount && (
                  <p className="text-danger text-xs mt-1">{errors.income.amount.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs text-text-secondary mb-1" htmlFor="income-source">
                  Source (optional)
                </label>
                <input
                  id="income-source"
                  {...register('income.source')}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:outline-none focus:border-primary text-sm"
                  placeholder="e.g. Salary, Freelance"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('income.verified')}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm text-text-secondary">Verified against bank statement</span>
              </label>
            </>
          )}
        </div>
      )}

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
          {submitting ? 'Saving…' : folder ? 'Save Changes' : 'Create Folder'}
        </button>
      </div>
    </form>
  );
}
