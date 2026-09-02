'use client';

import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';

interface MonthlyData {
  month: string;
  cycleId: string;
  committed: number;
  spent: number;
}

interface CategoryData {
  category: string;
  label: string;
  color: string;
  amount: number;
}

interface TopCategory {
  category: string;
  label: string;
  color: string;
  total: number;
  average: number;
}

interface TrendsData {
  monthlyTrend: MonthlyData[];
  categoryBreakdown: CategoryData[];
  topCategories: TopCategory[];
  months: number;
}

export default function TrendsPage() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);
  const [activeView, setActiveView] = useState<'overview' | 'categories'>('overview');

  const formatAmount = (cents: number) => {
    return `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
  };

  const formatCompact = (cents: number) => {
    const rands = cents / 100;
    if (rands >= 1000) {
      return `R${(rands / 1000).toFixed(1)}k`;
    }
    return `R${rands.toFixed(0)}`;
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/trends?months=${months}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error('Failed to fetch trends:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [months]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="h-64 bg-surface rounded-xl" />
        <div className="h-48 bg-surface rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-text-secondary">
        <p>Failed to load spending trends</p>
      </div>
    );
  }

  const totalSpent = data.monthlyTrend.reduce((sum, m) => sum + m.spent, 0);
  const avgMonthly = Math.round(totalSpent / data.months);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Spending Trends</h1>
          <p className="text-sm text-text-secondary mt-1">
            {formatAmount(avgMonthly)}/month average
          </p>
        </div>
        <select
          value={months}
          onChange={(e) => setMonths(parseInt(e.target.value))}
          className="px-3 py-1.5 rounded-lg border border-border bg-surface text-sm text-text-primary"
        >
          <option value={3}>3 months</option>
          <option value={6}>6 months</option>
          <option value={12}>12 months</option>
        </select>
      </div>

      {/* View Toggle */}
      <div className="flex gap-2">
        {(['overview', 'categories'] as const).map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeView === view
                ? 'bg-primary text-background'
                : 'bg-surface border border-border text-text-secondary hover:border-primary/50'
            }`}
          >
            {view === 'overview' ? 'Overview' : 'Categories'}
          </button>
        ))}
      </div>

      {activeView === 'overview' && (
        <>
          {/* Monthly Spending Bar Chart */}
          <div className="p-4 rounded-xl border border-border bg-surface">
            <h2 className="text-sm font-medium text-text-secondary mb-4">Monthly Spending</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlyTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCompact(v)}
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                  />
                  <Tooltip
                    formatter={(value) => formatAmount(Number(value ?? 0))}
                    contentStyle={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'var(--color-text-primary)' }}
                  />
                  <Bar dataKey="spent" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Spent" />
                  <Bar dataKey="committed" fill="var(--color-border)" radius={[4, 4, 0, 0]} name="Budget" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Current Month Category Breakdown */}
          {data.categoryBreakdown.length > 0 && (
            <div className="p-4 rounded-xl border border-border bg-surface">
              <h2 className="text-sm font-medium text-text-secondary mb-4">This Month by Category</h2>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="h-48 w-48 mx-auto md:mx-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.categoryBreakdown}
                        dataKey="amount"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                      >
                        {data.categoryBreakdown.map((entry) => (
                          <Cell key={entry.category} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatAmount(Number(value ?? 0))}
                        contentStyle={{
                          backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  {data.categoryBreakdown.slice(0, 6).map((cat) => (
                    <div key={cat.category} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <div className="min-w-0">
                        <div className="text-sm text-text-primary truncate">{cat.label}</div>
                        <div className="text-xs text-text-secondary">{formatAmount(cat.amount)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Top Categories */}
          <div className="p-4 rounded-xl border border-border bg-surface">
            <h2 className="text-sm font-medium text-text-secondary mb-4">Top Spending Categories</h2>
            <div className="space-y-3">
              {data.topCategories.map((cat, index) => {
                const percentage = totalSpent > 0 ? (cat.total / totalSpent) * 100 : 0;
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-secondary w-4">{index + 1}.</span>
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="text-sm text-text-primary">{cat.label}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-text-primary">
                          {formatAmount(cat.total)}
                        </span>
                        <span className="text-xs text-text-secondary ml-2">
                          ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                    <div className="ml-6 h-1.5 bg-background rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${percentage}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {activeView === 'categories' && (
        <>
          {/* Category Trends Over Time */}
          <div className="p-4 rounded-xl border border-border bg-surface">
            <h2 className="text-sm font-medium text-text-secondary mb-4">Category Trends</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.monthlyTrend.map((m) => {
                    const point: Record<string, string | number> = { month: m.month };
                    for (const cat of data.topCategories.slice(0, 5)) {
                      const catData = data.monthlyTrend.find((mt) => mt.cycleId === m.cycleId);
                      if (catData) {
                        // We need to get the category data from categoryTrends
                        point[cat.category] = 0; // Will be filled below
                      }
                    }
                    return point;
                  })}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCompact(v)}
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                  />
                  <Tooltip
                    formatter={(value) => formatAmount(Number(value ?? 0))}
                    contentStyle={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  {data.topCategories.slice(0, 5).map((cat) => (
                    <Line
                      key={cat.category}
                      type="monotone"
                      dataKey={cat.category}
                      name={cat.label}
                      stroke={cat.color}
                      strokeWidth={2}
                      dot={{ fill: cat.color, r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* All Categories List */}
          <div className="p-4 rounded-xl border border-border bg-surface">
            <h2 className="text-sm font-medium text-text-secondary mb-4">All Categories</h2>
            <div className="space-y-2">
              {data.topCategories.map((cat) => (
                <div
                  key={cat.category}
                  className="flex items-center justify-between p-3 rounded-lg bg-background"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-text-primary">{cat.label}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-text-primary">
                      {formatAmount(cat.total)}
                    </div>
                    <div className="text-xs text-text-secondary">
                      {formatAmount(cat.average)}/mo avg
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {data.monthlyTrend.every((m) => m.spent === 0) && (
        <div className="text-center py-12 text-text-secondary">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm">No spending data yet</p>
          <p className="text-xs mt-1">Mark items as paid to see your trends</p>
        </div>
      )}
    </div>
  );
}
