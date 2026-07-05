'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReceiptItem {
  id: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  vendor?: string;
  amountInCents?: number;
  cycleItemId?: string;
  capturedAt?: string;
}

interface ReceiptMonthGroup {
  key: string;
  label: string;
  receipts: ReceiptItem[];
}

export interface GroupedReceiptPickerProps {
  receipts: ReceiptItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  filterLinked?: boolean;
  currentReceiptId?: string;
  /** Use collapsible month sections (default: true) */
  collapsible?: boolean;
  /** Max height of the picker (default: 'max-h-48') */
  maxHeight?: string;
  /** Empty state message */
  emptyMessage?: string;
}

// ---------------------------------------------------------------------------
// Helper: Group receipts by month
// ---------------------------------------------------------------------------

function groupReceiptsByMonth(receipts: ReceiptItem[]): ReceiptMonthGroup[] {
  const monthMap = new Map<string, ReceiptItem[]>();

  for (const receipt of receipts) {
    const date = receipt.capturedAt ? new Date(receipt.capturedAt) : new Date();
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap.has(key)) monthMap.set(key, []);
    monthMap.get(key)!.push(receipt);
  }

  const sortedKeys = Array.from(monthMap.keys()).sort((a, b) => b.localeCompare(a));

  return sortedKeys.map((key) => {
    const [year, monthNum] = key.split('-').map(Number);
    const label = new Date(year, monthNum - 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
    return { key, label, receipts: monthMap.get(key)! };
  });
}

// ---------------------------------------------------------------------------
// ReceiptThumbnail - Reusable receipt thumbnail display
// ---------------------------------------------------------------------------

interface ReceiptThumbnailProps {
  receipt: ReceiptItem;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

function ReceiptThumbnail({ receipt, isSelected, onClick, disabled, size = 'md' }: ReceiptThumbnailProps) {
  const sizeClass = size === 'sm' ? 'w-12 h-12' : 'aspect-square';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative ${sizeClass} rounded-lg overflow-hidden border-2 transition-colors ${
        isSelected ? 'border-primary' : 'border-transparent hover:border-primary/40'
      }`}
    >
      {receipt.thumbnailUrl || receipt.imageUrl ? (
        <img
          src={receipt.thumbnailUrl || receipt.imageUrl}
          alt={receipt.vendor || 'Receipt'}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-surface flex items-center justify-center text-text-secondary text-base">
          📄
        </div>
      )}
      {receipt.amountInCents && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[9px] text-white font-mono">
          R{(receipt.amountInCents / 100).toFixed(0)}
        </div>
      )}
      {isSelected && (
        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="7" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// GroupedReceiptPicker Component
// ---------------------------------------------------------------------------

export function GroupedReceiptPicker({
  receipts,
  selectedId,
  onSelect,
  disabled,
  filterLinked = true,
  currentReceiptId,
  collapsible = true,
  maxHeight = 'max-h-48',
  emptyMessage = 'No unlinked receipts available.',
}: GroupedReceiptPickerProps) {
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return new Set([currentKey]);
  });

  // Filter out receipts that are linked to other cycle items
  const filteredReceipts = filterLinked
    ? receipts.filter((r) => {
        if (currentReceiptId && r.id === currentReceiptId) return true;
        if (selectedId && r.id === selectedId) return true;
        const isLinked = r.cycleItemId && typeof r.cycleItemId === 'string' && r.cycleItemId.length > 0;
        return !isLinked;
      })
    : receipts;

  const groups = groupReceiptsByMonth(filteredReceipts);

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (filteredReceipts.length === 0) {
    return (
      <div className="text-center py-4 text-text-secondary text-sm">
        <p className="text-xl mb-1">📷</p>
        <p className="text-xs">{emptyMessage}</p>
      </div>
    );
  }

  // Non-collapsible simple view
  if (!collapsible) {
    return (
      <div className={`${maxHeight} overflow-y-auto space-y-3`}>
        {groups.map(({ key, label, receipts: monthReceipts }) => (
          <div key={key}>
            <p className="text-xs text-text-secondary mb-1.5">{label}</p>
            <div className="flex flex-wrap gap-1.5">
              {monthReceipts.map((r) => (
                <ReceiptThumbnail
                  key={r.id}
                  receipt={r}
                  isSelected={r.id === selectedId}
                  onClick={() => onSelect(r.id)}
                  disabled={disabled}
                  size="sm"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Collapsible view with expandable months
  return (
    <div className={`space-y-2 ${maxHeight} overflow-y-auto`}>
      {groups.map((group) => {
        const isExpanded = expandedMonths.has(group.key);
        return (
          <div key={group.key} className="rounded-lg border border-border/50 bg-background overflow-hidden">
            {/* Month header */}
            <button
              onClick={() => toggleMonth(group.key)}
              className="w-full px-3 py-2 flex items-center justify-between hover:bg-surface/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-semibold text-[10px]">{group.receipts.length}</span>
                </div>
                <span className="text-sm font-medium text-text-primary">{group.label}</span>
              </div>
              <svg
                className={`w-4 h-4 text-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Receipts grid */}
            {isExpanded && (
              <div className="px-2 pb-2 pt-1">
                <div className="grid grid-cols-4 gap-1.5">
                  {group.receipts.map((r) => (
                    <ReceiptThumbnail
                      key={r.id}
                      receipt={r}
                      isSelected={r.id === selectedId}
                      onClick={() => onSelect(r.id)}
                      disabled={disabled}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
