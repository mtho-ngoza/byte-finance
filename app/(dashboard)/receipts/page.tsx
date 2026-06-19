'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useReceipts } from '@/hooks/use-receipts';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useReceiptQueue } from '@/hooks/use-receipt-queue';
import { useReceiptUpload } from '@/hooks/use-receipt-upload';
import { AmountDisplay } from '@/components/shared/amount-display';
import { CurrencyInput } from '@/components/shared/currency-input';
import { useToast } from '@/components/shared/toast';
import type { Receipt, PendingReceipt } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MonthGroup {
  key: string; // "2026-06"
  month: number;
  label: string; // "June"
  receipts: Receipt[];
  totalAmount: number;
  needsAttentionCount: number;
}

interface YearGroup {
  year: number;
  months: MonthGroup[];
  totalAmount: number;
  receiptCount: number;
  needsAttentionCount: number;
}

// ---------------------------------------------------------------------------
// Helper: Group receipts by year and month
// ---------------------------------------------------------------------------

function groupByYearAndMonth(receipts: Receipt[]): YearGroup[] {
  const yearMap = new Map<number, Map<string, Receipt[]>>();

  for (const receipt of receipts) {
    const date = receipt.capturedAt
      ? new Date(typeof receipt.capturedAt === 'string' ? receipt.capturedAt : receipt.capturedAt.toDate())
      : new Date();
    const year = date.getFullYear();
    const monthKey = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!yearMap.has(year)) yearMap.set(year, new Map());
    const monthMap = yearMap.get(year)!;
    if (!monthMap.has(monthKey)) monthMap.set(monthKey, []);
    monthMap.get(monthKey)!.push(receipt);
  }

  // Sort years descending
  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => b - a);

  return sortedYears.map((year) => {
    const monthMap = yearMap.get(year)!;
    const sortedMonthKeys = Array.from(monthMap.keys()).sort((a, b) => b.localeCompare(a));

    const months: MonthGroup[] = sortedMonthKeys.map((key) => {
      const [, monthNum] = key.split('-').map(Number);
      const monthReceipts = monthMap.get(key)!;
      const label = new Date(year, monthNum - 1).toLocaleDateString('en-ZA', { month: 'long' });
      const totalAmount = monthReceipts.reduce((sum, r) => sum + (r.amountInCents || 0), 0);
      const needsAttentionCount = monthReceipts.filter((r) => !r.amountInCents || !r.vendor).length;

      return { key, month: monthNum, label, receipts: monthReceipts, totalAmount, needsAttentionCount };
    });

    const totalAmount = months.reduce((sum, m) => sum + m.totalAmount, 0);
    const receiptCount = months.reduce((sum, m) => sum + m.receipts.length, 0);
    const needsAttentionCount = months.reduce((sum, m) => sum + m.needsAttentionCount, 0);

    return { year, months, totalAmount, receiptCount, needsAttentionCount };
  });
}

// ---------------------------------------------------------------------------
// Main Receipts Page
// ---------------------------------------------------------------------------

export default function ReceiptsPage() {
  const { receipts, needsAttention, complete, loading } = useReceipts();
  const { processQueue, getQueue } = useReceiptQueue();
  const [showCapture, setShowCapture] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<PendingReceipt[]>([]);
  const [search, setSearch] = useState('');
  const [filterAttention, setFilterAttention] = useState(false);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  // Process any queued uploads on page open
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const queue = await getQueue();
        if (!cancelled) setPendingQueue(queue);
        await processQueue();
        const updated = await getQueue();
        if (!cancelled) setPendingQueue(updated);
      } catch {
        // IndexedDB may be unavailable
      }
    }
    init();
    return () => { cancelled = true; };
  }, [getQueue, processQueue]);

  // Group receipts by year and month
  const yearGroups = useMemo(() => groupByYearAndMonth(receipts), [receipts]);

  // Auto-expand current year and current/previous month on load
  useEffect(() => {
    if (yearGroups.length > 0 && expandedYears.size === 0) {
      const currentYear = new Date().getFullYear();
      setExpandedYears(new Set([currentYear]));

      // Expand current and previous month
      const currentYearGroup = yearGroups.find((y) => y.year === currentYear);
      if (currentYearGroup && currentYearGroup.months.length > 0) {
        const initial = new Set<string>();
        if (currentYearGroup.months[0]) initial.add(currentYearGroup.months[0].key);
        if (currentYearGroup.months[1]) initial.add(currentYearGroup.months[1].key);
        setExpandedMonths(initial);
      }
    }
  }, [yearGroups]);

  // Filter receipts
  const q = search.toLowerCase();
  const baseList = filterAttention ? needsAttention : receipts;
  const filteredReceipts = useMemo(() => {
    if (!q && !filterAttention) return null; // Use grouped view
    return baseList.filter((r) => {
      if (!q) return true;
      return (
        r.vendor?.toLowerCase().includes(q) ||
        r.note?.toLowerCase().includes(q) ||
        (r.amountInCents !== undefined && `r${(r.amountInCents / 100).toFixed(0)}`.includes(q))
      );
    });
  }, [baseList, q, filterAttention]);

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const unlinked = complete.filter((r) => !r.cycleItemId);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-32 bg-surface rounded" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const isSearching = q || filterAttention;

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Receipts</h1>
          <p className="text-sm text-text-secondary">
            {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
            {needsAttention.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] font-medium">
                {needsAttention.length} need attention
              </span>
            )}
            {unlinked.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                {unlinked.length} unlinked
              </span>
            )}
          </p>
        </div>

        {/* Pending upload indicator */}
        {pendingQueue.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border text-sm">
              <span className="inline-block animate-spin text-primary">⟳</span>
              <span className="text-text-secondary">{pendingQueue.length} pending</span>
            </div>
          </div>
        )}
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendor, note, amount..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        <button
          onClick={() => setFilterAttention(!filterAttention)}
          className={`px-3 py-2 rounded-lg border text-sm transition-colors whitespace-nowrap ${
            filterAttention ? 'border-warning bg-warning/10 text-warning' : 'border-border text-text-secondary hover:border-primary'
          }`}
        >
          ⚠️ {needsAttention.length}
        </button>
      </div>

      {/* Content */}
      {isSearching ? (
        /* Flat search results */
        <section>
          <h2 className="text-sm font-medium text-text-secondary mb-3">
            {filterAttention ? `Needs Attention (${filteredReceipts?.length || 0})` : `Search Results (${filteredReceipts?.length || 0})`}
          </h2>
          {filteredReceipts && filteredReceipts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredReceipts.map((receipt) => (
                <ReceiptCard key={receipt.id} receipt={receipt} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-text-secondary">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-sm">No receipts found</p>
            </div>
          )}
        </section>
      ) : (
        /* Grouped by year and month */
        <div className="space-y-3">
          {yearGroups.length === 0 ? (
            <div className="text-center py-12 text-text-secondary">
              <p className="text-4xl mb-3">📷</p>
              <p className="text-sm font-medium text-text-primary mb-1">No receipts yet</p>
              <p className="text-xs">Tap the camera button to capture your first receipt.</p>
            </div>
          ) : (
            yearGroups.map((yearGroup) => (
              <YearSection
                key={yearGroup.year}
                group={yearGroup}
                isExpanded={expandedYears.has(yearGroup.year)}
                expandedMonths={expandedMonths}
                onToggleYear={() => toggleYear(yearGroup.year)}
                onToggleMonth={toggleMonth}
              />
            ))
          )}
        </div>
      )}

      {/* Tax Export */}
      <TaxExportSection receiptsCount={receipts.length} />

      {/* Capture FAB */}
      <button
        onClick={() => setShowCapture(true)}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-primary text-background shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors z-40"
        aria-label="Capture receipt"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* Capture Modal */}
      {showCapture && <ReceiptCapture onClose={() => setShowCapture(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// YearSection Component
// ---------------------------------------------------------------------------

interface YearSectionProps {
  group: YearGroup;
  isExpanded: boolean;
  expandedMonths: Set<string>;
  onToggleYear: () => void;
  onToggleMonth: (key: string) => void;
}

function YearSection({ group, isExpanded, expandedMonths, onToggleYear, onToggleMonth }: YearSectionProps) {
  const isCurrentYear = group.year === new Date().getFullYear();

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Year header */}
      <button
        onClick={onToggleYear}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-background/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isCurrentYear ? 'bg-primary/15' : 'bg-background'}`}>
            <span className={`font-bold text-lg ${isCurrentYear ? 'text-primary' : 'text-text-secondary'}`}>
              {group.year.toString().slice(-2)}
            </span>
          </div>
          <div className="text-left">
            <p className="text-base font-semibold text-text-primary">{group.year}</p>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span>{group.receiptCount} receipts</span>
              <span>·</span>
              <AmountDisplay amount={group.totalAmount} size="xs" />
              {group.needsAttentionCount > 0 && (
                <span className="text-warning">
                  · {group.needsAttentionCount} need attention
                </span>
              )}
            </div>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded months */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {group.months.map((month) => (
            <MonthSection
              key={month.key}
              group={month}
              isExpanded={expandedMonths.has(month.key)}
              onToggle={() => onToggleMonth(month.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MonthSection Component
// ---------------------------------------------------------------------------

interface MonthSectionProps {
  group: MonthGroup;
  isExpanded: boolean;
  onToggle: () => void;
}

function MonthSection({ group, isExpanded, onToggle }: MonthSectionProps) {
  return (
    <div className="rounded-lg border border-border/50 bg-background overflow-hidden">
      {/* Month header */}
      <button
        onClick={onToggle}
        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-surface/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-semibold text-xs">
              {group.receipts.length}
            </span>
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-text-primary">{group.label}</p>
            <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
              <AmountDisplay amount={group.totalAmount} size="xs" />
              {group.needsAttentionCount > 0 && (
                <span className="text-warning">· {group.needsAttentionCount} need attention</span>
              )}
            </div>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-2 pb-2 pt-1">
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
            {group.receipts.map((receipt) => (
              <ReceiptCard key={receipt.id} receipt={receipt} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReceiptCard Component
// ---------------------------------------------------------------------------

interface ReceiptCardProps {
  receipt: Receipt;
  compact?: boolean;
}

function ReceiptCard({ receipt, compact }: ReceiptCardProps) {
  const capturedAt = receipt.capturedAt
    ? new Date(typeof receipt.capturedAt === 'string' ? receipt.capturedAt : receipt.capturedAt.toDate()).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
    : '';

  const needsAttention = !receipt.amountInCents || !receipt.vendor;

  if (compact) {
    return (
      <Link
        href={`/receipts/${receipt.id}`}
        className="relative aspect-square bg-background rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all"
      >
        {receipt.thumbnailUrl || receipt.imageUrl ? (
          <img
            src={receipt.thumbnailUrl || receipt.imageUrl}
            alt="Receipt"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-secondary">
            <span className="text-xl">📄</span>
          </div>
        )}
        {needsAttention && (
          <div className="absolute top-1 right-1 w-5 h-5 bg-warning rounded-full flex items-center justify-center text-[10px] font-bold">
            !
          </div>
        )}
        {/* Quick info overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
          <p className="text-[10px] text-white font-medium truncate">
            {receipt.amountInCents ? `R${(receipt.amountInCents / 100).toFixed(0)}` : '—'}
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/receipts/${receipt.id}`}
      className="bg-surface border border-border rounded-xl overflow-hidden text-left hover:border-primary transition-colors block"
    >
      {/* Image */}
      <div className="aspect-[4/3] bg-background relative">
        {receipt.thumbnailUrl || receipt.imageUrl ? (
          <img
            src={receipt.thumbnailUrl || receipt.imageUrl}
            alt="Receipt"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-secondary">
            <span className="text-2xl">📄</span>
          </div>
        )}
        {needsAttention && (
          <div className="absolute top-2 right-2 w-6 h-6 bg-warning rounded-full flex items-center justify-center text-xs">
            ?
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2">
        <div className="flex items-center justify-between">
          {receipt.amountInCents ? (
            <AmountDisplay amount={receipt.amountInCents} size="sm" />
          ) : (
            <span className="text-sm text-warning">No amount</span>
          )}
        </div>
        <p className="text-xs text-text-secondary truncate">
          {receipt.vendor || 'No vendor'}
        </p>
        <p className="text-[10px] text-text-secondary mt-0.5">{capturedAt}</p>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// TaxExportSection
// ---------------------------------------------------------------------------

function TaxExportSection({ receiptsCount }: { receiptsCount: number }) {
  const [showPanel, setShowPanel] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState<'csv' | 'zip' | null>(null);
  const { toast } = useToast();

  const handleExport = async (format: 'csv' | 'zip') => {
    setExporting(format);
    try {
      const params = new URLSearchParams({ format });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/receipts/export?${params}`);
      if (!res.ok) { toast('Export failed', 'error'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateLabel = from && to ? `${from}_to_${to}` : new Date().toISOString().slice(0, 10);
      a.download = `receipts-${dateLabel}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast(`Exported ${format.toUpperCase()} successfully`, 'success');
    } catch {
      toast('Export failed', 'error');
    } finally {
      setExporting(null);
    }
  };

  if (receiptsCount === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="w-full flex items-center justify-between text-sm"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🧾</span>
          <span className="font-medium text-text-primary">Tax Export</span>
        </div>
        <svg className={`w-4 h-4 text-text-secondary transition-transform ${showPanel ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showPanel && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-text-secondary">Filter by date range (optional) then export all receipts as CSV or ZIP with images.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleExport('csv')} disabled={exporting !== null}
              className="py-2.5 rounded-lg border border-border text-sm text-text-primary hover:border-primary transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {exporting === 'csv' ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : '📄'}
              CSV Summary
            </button>
            <button onClick={() => handleExport('zip')} disabled={exporting !== null}
              className="py-2.5 rounded-lg bg-primary text-background text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {exporting === 'zip' ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : '📦'}
              ZIP + Images
            </button>
          </div>
          <p className="text-[10px] text-text-secondary">ZIP includes all receipt images + CSV.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReceiptCapture
// ---------------------------------------------------------------------------

function ReceiptCapture({ onClose }: { onClose: () => void }) {
  const { location, getSuggestedVendors } = useGeolocation();
  const { upload, status: uploadStatus, isUploading: saving } = useReceiptUpload();
  const { toast } = useToast();

  const [step, setStep] = useState<'camera' | 'form'>('camera');
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [amount, setAmount] = useState(0);
  const [vendor, setVendor] = useState('');
  const [note, setNote] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const suggestedVendors = getSuggestedVendors([]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error('Camera error:', err);
      toast('Could not access camera. Please grant permission.', 'error');
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      setImageData(canvas.toDataURL('image/jpeg', 0.8));
      canvas.toBlob((blob) => { if (blob) setImageBlob(blob); }, 'image/jpeg', 0.8);
      setStep('form');
      stopCamera();
    }
  }, [stopCamera]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImageData(ev.target?.result as string);
    reader.readAsDataURL(file);
    setImageBlob(file);
    stopCamera();
    setStep('form');
  }, [stopCamera]);

  const handleSave = async () => {
    if (!imageBlob) return;
    const result = await upload({
      imageBlob,
      amount,
      vendor,
      note,
      location: location ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy } : undefined,
    });
    if (!result.success && result.error) toast(result.error, 'error');
    onClose();
  };

  useEffect(() => { startCamera(); return stopCamera; }, [startCamera, stopCamera]);

  const handleClose = () => { stopCamera(); onClose(); };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {step === 'camera' ? (
        <>
          <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover" onLoadedMetadata={() => videoRef.current?.play()} />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-6">
            <button onClick={handleClose} className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white" aria-label="Close">✕</button>
            <button onClick={capturePhoto} className="w-16 h-16 rounded-full bg-white border-4 border-white/50" aria-label="Take photo" />
            <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white" aria-label="Upload from gallery">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
            </button>
          </div>
        </>
      ) : (
        <div className="flex-1 relative">
          {imageData && <img src={imageData} alt="Captured receipt" className="w-full h-full object-contain" />}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-black/50 p-4 space-y-4">
            <div>
              <label className="block text-xs text-white/70 mb-1">Amount</label>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>
            <div>
              <label className="block text-xs text-white/70 mb-1">Vendor</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {suggestedVendors.slice(0, 6).map((v) => (
                  <button key={v} onClick={() => setVendor(v)} className={`px-3 py-1.5 rounded-full text-sm transition-colors ${vendor === v ? 'bg-primary text-black' : 'bg-white/20 text-white hover:bg-white/30'}`}>{v}</button>
                ))}
              </div>
              <input type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Or type vendor name..." className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:border-primary text-sm" />
            </div>
            <div>
              <label className="block text-xs text-white/70 mb-1">Note (optional)</label>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Quick context..." className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:border-primary text-sm" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setStep('camera'); setImageData(null); setImageBlob(null); startCamera(); }} className="flex-1 py-3 rounded-lg border border-white/30 text-white font-medium">Retake</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-lg bg-primary text-black font-medium disabled:opacity-50">{saving ? (uploadStatus || 'Saving...') : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
