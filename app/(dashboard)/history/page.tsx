'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useCycles } from '@/hooks/use-cycles';
import { AmountDisplay } from '@/components/shared/amount-display';
import type { Category, Cycle } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const CATEGORY_LABELS: Record<Category, string> = {
  housing: 'Housing',
  transport: 'Transport',
  family: 'Family',
  utilities: 'Utilities',
  health: 'Health',
  education: 'Education',
  savings: 'Savings',
  lifestyle: 'Lifestyle',
  business: 'Business',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCycleId(id: string): { year: number; month: number } {
  const [y, m] = id.split('-');
  return { year: parseInt(y, 10), month: parseInt(m, 10) };
}

function formatCycleLabel(id: string): string {
  const { year, month } = parseCycleId(id);
  const date = new Date(year, month - 1);
  return date.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

function formatRands(cents: number): string {
  const rands = cents / 100;
  return `R${rands.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Custom tooltip for the bar chart
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 text-sm shadow-lg">
      <p className="text-text-secondary mb-1">{label}</p>
      <p className="text-text-primary font-medium">{formatRands(payload[0].value)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History Page
// ---------------------------------------------------------------------------

export default function HistoryPage() {
  const { cycles, loading } = useCycles();

  // Derive available years from cycles
  const availableYears = useMemo(() => {
    const years = [...new Set(cycles.map((c) => parseCycleId(c.id).year))].sort((a, b) => b - a);
    return years.length > 0 ? years : [new Date().getFullYear()];
  }, [cycles]);

  const [selectedYear, setSelectedYear] = useState<number>(() => availableYears[0] ?? new Date().getFullYear());

  // Update selectedYear if availableYears changes and current selection is gone
  const effectiveYear = availableYears.includes(selectedYear) ? selectedYear : (availableYears[0] ?? selectedYear);

  // Cycles for the selected year, sorted oldest → newest
  const yearCycles = useMemo(() => {
    return cycles
      .filter((c) => parseCycleId(c.id).year === effectiveYear)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [cycles, effectiveYear]);

  // Monthly bar chart data (12 months, fill missing with 0)
  const chartData = useMemo(() => {
    return MONTH_NAMES.map((name, idx) => {
      const monthNum = idx + 1;
      const cycle = yearCycles.find((c) => parseCycleId(c.id).month === monthNum);
      return {
        month: name,
        total: cycle ? cycle.totalPaid : 0,
      };
    });
  }, [yearCycles]);

  // Category breakdown aggregated across the year
  const categoryBreakdown = useMemo(() => {
    // We aggregate from cycle totals — cycles don't carry category breakdown directly,
    // so we show per-cycle totals grouped. If the API later exposes category data we can
    // swap this out. For now we show the overall paid total per cycle as "total".
    // The spec says "aggregate client-side from cycles", so we use totalPaid per cycle.
    const yearTotal = yearCycles.reduce((s, c) => s + c.totalPaid, 0);
    return { yearTotal };
  }, [yearCycles]);

  if (loading) {
    return <HistorySkeleton />;
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Page header + year selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-text-primary">History</h1>
        <select
          value={effectiveYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
          className="px-3 py-1.5 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
          aria-label="Select year"
        >
          {availableYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {yearCycles.length === 0 ? (
        <div className="text-center py-16 text-text-secondary text-sm">
          No data for {effectiveYear}.
        </div>
      ) : (
        <>
          {/* ── Spending Trend ── */}
          <section>
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
              Spending Trend
            </h2>
            <div className="p-4 rounded-xl border border-border bg-surface">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="month"
                    tick={{ fill: '#a1a1aa', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `R${(v / 100000).toFixed(0)}k`}
                    tick={{ fill: '#a1a1aa', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="total" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ── Category Breakdown ── */}
          <section>
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
              Category Breakdown
            </h2>
            <CategoryBreakdownSection cycles={yearCycles} yearTotal={categoryBreakdown.yearTotal} />
          </section>

          {/* ── Past Cycles ── */}
          <section>
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
              Past Cycles
            </h2>
            <div className="space-y-2">
              {[...yearCycles].reverse().map((cycle) => (
                <CycleRow key={cycle.id} cycle={cycle} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategoryBreakdownSection
// Cycles don't carry per-category totals in the Cycle document, so we show
// a breakdown by cycle status as a proxy. When the analytics API is wired up
// this component can be swapped for real category data.
// ---------------------------------------------------------------------------

interface CategoryBreakdownSectionProps {
  cycles: Cycle[];
  yearTotal: number;
}

function CategoryBreakdownSection({ cycles, yearTotal }: CategoryBreakdownSectionProps) {
  // Build a simple month-by-month breakdown showing paid vs committed
  // as the best available aggregation from the Cycle documents.
  const totalCommitted = cycles.reduce((s, c) => s + c.totalCommitted, 0);
  const totalPaid = cycles.reduce((s, c) => s + c.totalPaid, 0);
  const unpaid = totalCommitted - totalPaid;

  if (yearTotal === 0) {
    return (
      <div className="p-4 rounded-xl border border-border bg-surface text-center text-text-secondary text-sm">
        No spending data for this year.
      </div>
    );
  }

  const rows = [
    { label: 'Paid', amount: totalPaid, color: 'bg-primary' },
    { label: 'Committed (unpaid)', amount: unpaid > 0 ? unpaid : 0, color: 'bg-warning' },
  ];

  return (
    <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
      {rows.map(({ label, amount, color }) => {
        const pct = totalCommitted > 0 ? Math.round((amount / totalCommitted) * 100) : 0;
        return (
          <div key={label}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-text-primary">{label}</span>
              <div className="flex items-center gap-3">
                <AmountDisplay amount={amount} size="sm" className="text-text-secondary" />
                <span className="text-text-secondary w-8 text-right">{pct}%</span>
              </div>
            </div>
            <div className="h-2 bg-background rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${color}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      <div className="pt-2 border-t border-border flex items-center justify-between text-sm">
        <span className="text-text-secondary">Total Committed</span>
        <AmountDisplay amount={totalCommitted} size="sm" className="text-text-primary" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CycleRow
// ---------------------------------------------------------------------------

interface CycleRowProps {
  cycle: Cycle;
}

function CycleRow({ cycle }: CycleRowProps) {
  const { month, year } = parseCycleId(cycle.id);
  const monthName = new Date(year, month - 1).toLocaleDateString('en-ZA', {
    month: 'long',
    year: 'numeric',
  });

  const paidPct =
    cycle.totalCommitted > 0
      ? Math.round((cycle.totalPaid / cycle.totalCommitted) * 100)
      : 0;

  const isFullyPaid = cycle.paidCount >= cycle.itemCount && cycle.itemCount > 0;
  const isClosed = cycle.status === 'closed';

  return (
    <Link
      href={`/cycle/${cycle.id}`}
      className="flex items-center gap-4 p-4 rounded-xl border border-border bg-surface hover:border-primary/40 transition-colors"
    >
      {/* Month name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{monthName}</p>
        <p className="text-xs text-text-secondary mt-0.5">
          {cycle.paidCount} / {cycle.itemCount} items paid
        </p>
      </div>

      {/* Amounts */}
      <div className="text-right shrink-0">
        <p className="text-sm font-medium text-text-primary">
          <AmountDisplay amount={cycle.totalPaid} size="sm" className="inline" />
          <span className="text-text-secondary"> / </span>
          <AmountDisplay amount={cycle.totalCommitted} size="sm" className="inline text-text-secondary" />
        </p>
        <p className="text-xs text-text-secondary mt-0.5">{paidPct}% paid</p>
      </div>

      {/* Status badge */}
      <div className="shrink-0">
        {isFullyPaid ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            ✓ Done
          </span>
        ) : isClosed ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium">
            Closed
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-border text-text-secondary font-medium">
            Active
          </span>
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function HistorySkeleton() {
  return (
    <div className="space-y-8 pb-8 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-24 bg-surface rounded" />
        <div className="h-8 w-24 bg-surface rounded-lg" />
      </div>
      <section className="space-y-3">
        <div className="h-3 w-28 bg-surface rounded" />
        <div className="h-48 bg-surface rounded-xl" />
      </section>
      <section className="space-y-3">
        <div className="h-3 w-36 bg-surface rounded" />
        <div className="h-32 bg-surface rounded-xl" />
      </section>
      <section className="space-y-2">
        <div className="h-3 w-24 bg-surface rounded" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-surface rounded-xl" />
        ))}
      </section>
    </div>
  );
}
