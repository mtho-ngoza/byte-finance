'use client';

import Link from 'next/link';
import { ProgressRing } from '@/components/shared/progress-ring';
import { AmountDisplay } from '@/components/shared/amount-display';
import type { Folder } from '@/types';

interface FolderCardProps {
  folder: Folder;
  /** Total of all expense amounts in cents */
  totalBudgeted: number;
  /** Total of paid expense amounts in cents */
  totalPaid: number;
  /** Count of paid expenses */
  paidCount: number;
  /** Total expense count */
  totalCount: number;
}

const TYPE_LABELS: Record<Folder['type'], string> = {
  monthly: 'Monthly',
  project: 'Project',
  savings: 'Savings',
  goals: 'Goals',
};

export function FolderCard({
  folder,
  totalBudgeted,
  totalPaid,
  paidCount,
  totalCount,
}: FolderCardProps) {
  const progress = totalCount > 0 ? paidCount / totalCount : 0;
  const progressPct = Math.round(progress * 100);

  return (
    <Link
      href={`/folders/${folder.id}`}
      className="block rounded-xl border border-border bg-surface p-4 hover:border-primary/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: name + type */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            {folder.icon && <span className="text-lg">{folder.icon}</span>}
            <h3 className="font-semibold text-text-primary truncate">{folder.name}</h3>
          </div>
          <span className="text-xs text-text-secondary">{TYPE_LABELS[folder.type]}</span>
          {folder.period && (
            <span className="text-xs text-text-secondary ml-2">
              {new Date(folder.period.year, folder.period.month - 1).toLocaleString('en-ZA', {
                month: 'short',
                year: 'numeric',
              })}
            </span>
          )}
        </div>

        {/* Right: progress ring */}
        <ProgressRing value={progress} size={52} strokeWidth={5}>
          <span className="text-[10px] font-mono text-text-secondary">{progressPct}%</span>
        </ProgressRing>
      </div>

      {/* Budgeted / Paid */}
      <div className="mt-3 flex items-center justify-between text-sm">
        <div>
          <p className="text-text-secondary text-xs mb-0.5">Budgeted</p>
          <AmountDisplay amount={totalBudgeted} size="sm" />
        </div>
        <div className="text-right">
          <p className="text-text-secondary text-xs mb-0.5">Paid</p>
          <AmountDisplay amount={totalPaid} size="sm" className="text-primary" />
        </div>
      </div>

      {/* Income (monthly folders) */}
      {folder.income && (
        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-sm">
          <span className="text-text-secondary text-xs">
            Income{folder.income.source ? ` · ${folder.income.source}` : ''}
            {folder.income.verified && (
              <span className="ml-1 text-primary">✓</span>
            )}
          </span>
          <AmountDisplay amount={folder.income.amount} size="sm" className="text-text-primary" />
        </div>
      )}
    </Link>
  );
}
