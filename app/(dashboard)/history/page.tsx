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
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useCycles } from '@/hooks/use-cycles';
import { useCycleItems } from '@/hooks/use-cycle-items';
import { useAppStore } from '@/stores/app-store';
import { AmountDisplay } from '@/components/shared/amount-display';
import type { Cycle, Category } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<Category, string> = {
  housing: '#8b5cf6',    // violet
  transport: '#3b82f6',  // blue
  family: '#ec4899',     // pink
  health: '#10b981',     // emerald
  utilities: '#6366f1',  // indigo
  education: '#f59e0b',  // amber
  savings: '#22c55e',    // green
  lifestyle: '#f97316',  // orange
  business: '#06b6d4',   // cyan
  other: '#6b7280',      // gray
};

const CATEGORY_LABELS: Record<Category, string> = {
  housing: 'Housing',
  transport: 'Transport',
  family: 'Family',
  health: 'Health',
  utilities: 'Utilities',
  education: 'Education',
  savings: 'Savings',
  lifestyle: 'Lifestyle',
  business: 'Business',
  other: 'Other',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------------------
// Main History Page
// ---------------------------------------------------------------------------

export default function HistoryPage() {
  const { cycles, loading } = useCycles();
  const { selectedYear, setSelectedYear, accountFilter } = useAppStore();
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  // Get available years from cycles
  const availableYears = useMemo(() => {
    const years = [...new Set(cycles.map((c) => parseInt(c.id.split('-')[0], 10)))];
    return years.sort((a, b) => b - a);
  }, [cycles]);

  // Filter cycles by selected year
  const yearCycles = useMemo(() => {
    return cycles
      .filter((c) => parseInt(c.id.split('-')[0], 10) === selectedYear)
      .sort((a, b) => a.id.localeCompare(b.id)); // Ascending for chart
  }, [cycles, selectedYear]);

  // Selected cycle for details (default to most recent closed)
  const displayCycleId = selectedCycleId ?? yearCycles.find((c) => c.status === 'closed')?.id ?? yearCycles[0]?.id;

  // Prepare bar chart data (monthly spending)
  const barChartData = useMemo(() => {
    return yearCycles.map((cycle) => {
      const month = parseInt(cycle.id.split('-')[1], 10);
      return {
        name: MONTHS[month - 1],
        cycleId: cycle.id,
        total: cycle.totalPaid / 100,
        committed: cycle.totalCommitted / 100,
      };
    });
  }, [yearCycles]);

  // Calculate year totals
  const yearTotals = useMemo(() => {
    return yearCycles.reduce(
      (acc, cycle) => ({
        committed: acc.committed + cycle.totalCommitted,
        paid: acc.paid + cycle.totalPaid,
      }),
      { committed: 0, paid: 0 }
    );
  }, [yearCycles]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="h-64 bg-surface rounded-xl" />
        <div className="h-48 bg-surface rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with year selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">History</h1>
          <p className="text-sm text-text-secondary">
            {yearCycles.length} cycle{yearCycles.length !== 1 ? 's' : ''} in {selectedYear}
          </p>
        </div>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
          className="px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary"
        >
          {availableYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {/* Year Summary */}
      <div className="p-4 bg-surface border border-border rounded-xl">
        <h2 className="text-sm font-medium text-text-secondary mb-3">Year Summary</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-text-secondary">Total Committed</p>
            <AmountDisplay amount={yearTotals.committed} size="lg" />
          </div>
          <div>
            <p className="text-xs text-text-secondary">Total Paid</p>
            <AmountDisplay amount={yearTotals.paid} size="lg" />
          </div>
        </div>
      </div>

      {/* Monthly Spending Chart */}
      {barChartData.length > 0 && (
        <div className="p-4 bg-surface border border-border rounded-xl">
          <h2 className="text-sm font-medium text-text-primary mb-4">Monthly Spending</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  axisLine={{ stroke: '#374151' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `R${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#f3f4f6' }}
                  formatter={(value) => [`R${Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, 'Paid']}
                />
                <Bar
                  dataKey="total"
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(data) => {
                    const payload = data as { cycleId?: string };
                    if (payload.cycleId) setSelectedCycleId(payload.cycleId);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {displayCycleId && (
        <CategoryBreakdown cycleId={displayCycleId} accountFilter={accountFilter} />
      )}

      {/* Past Cycles List */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-text-primary">Past Cycles</h2>
        {yearCycles.length === 0 ? (
          <p className="text-sm text-text-secondary py-4 text-center">No cycles for {selectedYear}</p>
        ) : (
          <div className="space-y-2">
            {[...yearCycles].reverse().map((cycle) => (
              <CycleRow
                key={cycle.id}
                cycle={cycle}
                isSelected={cycle.id === displayCycleId}
                onClick={() => setSelectedCycleId(cycle.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategoryBreakdown Component
// ---------------------------------------------------------------------------

interface CategoryBreakdownProps {
  cycleId: string;
  accountFilter: 'all' | 'personal' | 'business';
}

function CategoryBreakdown({ cycleId, accountFilter }: CategoryBreakdownProps) {
  const { items, loading } = useCycleItems(cycleId);

  const categoryData = useMemo(() => {
    const filtered = items.filter((item) => {
      if (accountFilter === 'all') return true;
      return item.accountType === accountFilter;
    });

    const categoryTotals = new Map<Category, number>();
    for (const item of filtered) {
      if (item.status === 'paid') {
        const current = categoryTotals.get(item.category) ?? 0;
        categoryTotals.set(item.category, current + item.amount);
      }
    }

    return Array.from(categoryTotals.entries())
      .map(([category, amount]) => ({
        name: CATEGORY_LABELS[category],
        value: amount / 100,
        category,
        color: CATEGORY_COLORS[category],
      }))
      .sort((a, b) => b.value - a.value);
  }, [items, accountFilter]);

  const totalPaid = categoryData.reduce((sum, d) => sum + d.value, 0);

  if (loading) {
    return <div className="h-48 bg-surface rounded-xl animate-pulse" />;
  }

  if (categoryData.length === 0) {
    return null;
  }

  const cycleName = formatCycleId(cycleId);

  return (
    <div className="p-4 bg-surface border border-border rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-text-primary">
          Category Breakdown — {cycleName}
        </h2>
        <Link
          href={`/cycle/${cycleId}`}
          className="text-xs text-primary hover:underline"
        >
          View details
        </Link>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Pie Chart */}
        <div className="h-48 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categoryData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
              >
                {categoryData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                }}
                formatter={(value) => [`R${Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, '']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend / List */}
        <div className="flex-1 space-y-2">
          {categoryData.slice(0, 6).map((item) => {
            const percent = totalPaid > 0 ? Math.round((item.value / totalPaid) * 100) : 0;
            return (
              <div key={item.category} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-text-primary">{item.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm text-text-primary">
                    R{item.value.toLocaleString('en-ZA', { minimumFractionDigits: 0 })}
                  </span>
                  <span className="text-xs text-text-secondary ml-2">{percent}%</span>
                </div>
              </div>
            );
          })}
          {categoryData.length > 6 && (
            <p className="text-xs text-text-secondary">+{categoryData.length - 6} more</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CycleRow Component
// ---------------------------------------------------------------------------

interface CycleRowProps {
  cycle: Cycle;
  isSelected: boolean;
  onClick: () => void;
}

function CycleRow({ cycle, isSelected, onClick }: CycleRowProps) {
  const progressPercent = cycle.totalCommitted > 0
    ? Math.round((cycle.totalPaid / cycle.totalCommitted) * 100)
    : 0;

  const unpaidCount = cycle.itemCount - cycle.paidCount;
  const isPastCycle = cycle.status === 'closed';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-surface hover:bg-background'
      }`}
    >
      <div>
        <p className="text-sm font-medium text-text-primary">{formatCycleId(cycle.id)}</p>
        <p className="text-xs text-text-secondary">
          {cycle.paidCount} / {cycle.itemCount} paid
          {cycle.status === 'active' && (
            <span className="ml-2 text-primary">Current</span>
          )}
          {isPastCycle && unpaidCount > 0 && (
            <span className="ml-2 text-error">{unpaidCount} unpaid</span>
          )}
        </p>
      </div>
      <div className="text-right">
        <AmountDisplay amount={cycle.totalPaid} size="sm" />
        <p className="text-xs text-text-secondary">{progressPercent}% paid</p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCycleId(id: string): string {
  const [year, month] = id.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1);
  return date.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}
