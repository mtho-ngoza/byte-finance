'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { AmountDisplay } from '@/components/shared/amount-display';
import type { Category } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface YearReviewData {
  year: number;
  summary: {
    totalSpent: number;
    totalCommitted: number;
    totalIncome: number;
    totalVat: number;
    netIncome: number;
    savingsRate: number;
    spendingChange: number | null;
    prevYearSpent: number;
  };
  monthlyData: Array<{
    month: number;
    spent: number;
    committed: number;
    income: number;
  }>;
  topCategories: Array<{
    category: Category;
    amount: number;
  }>;
  goals: {
    completedThisYear: number;
    activeCount: number;
    averageProgress: number;
    completedGoals: Array<{ id: string; name: string; targetAmount: number }>;
  };
  wishlist: {
    total: number;
    completed: number;
    abandoned: number;
    carriedForward: number;
    active: number;
    successRate: number;
  };
  receipts: {
    count: number;
    total: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

const CATEGORY_COLORS: Record<Category, string> = {
  housing: '#f97316',
  transport: '#3b82f6',
  family: '#ec4899',
  utilities: '#8b5cf6',
  health: '#ef4444',
  education: '#06b6d4',
  savings: '#22c55e',
  lifestyle: '#f59e0b',
  business: '#6366f1',
  other: '#64748b',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRands(cents: number): string {
  const rands = cents / 100;
  if (rands >= 1000000) {
    return `R${(rands / 1000000).toFixed(1)}M`;
  }
  if (rands >= 1000) {
    return `R${(rands / 1000).toFixed(0)}k`;
  }
  return `R${rands.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Year Review Page
// ---------------------------------------------------------------------------

export default function YearReviewPage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [data, setData] = useState<YearReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Available years (current and past 5 years)
  const availableYears = Array.from({ length: 6 }, (_, i) => currentYear - i);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/year-review?year=${selectedYear}`);
        if (!res.ok) throw new Error('Failed to load review data');
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [selectedYear]);

  if (loading) {
    return <ReviewSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="text-center py-16 text-text-secondary">
        <p className="text-lg mb-2">Failed to load year review</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  const isCurrentYear = selectedYear === currentYear;
  const currentMonth = new Date().getMonth() + 1;

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Year in Review</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {isCurrentYear ? 'Your financial journey so far' : `Your ${selectedYear} financial summary`}
          </p>
        </div>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
          className="px-3 py-1.5 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
          aria-label="Select year"
        >
          {availableYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Hero Stats */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Spent"
          value={<AmountDisplay amount={data.summary.totalSpent} size="lg" />}
          subtext={data.summary.spendingChange !== null ? (
            <span className={data.summary.spendingChange >= 0 ? 'text-error' : 'text-primary'}>
              {data.summary.spendingChange >= 0 ? '+' : ''}{data.summary.spendingChange}% vs {selectedYear - 1}
            </span>
          ) : null}
        />
        <StatCard
          label="Net Income"
          value={<AmountDisplay amount={data.summary.netIncome} size="lg" />}
          subtext={data.summary.totalVat > 0 ? (
            <span className="text-text-secondary">After VAT</span>
          ) : null}
        />
        <StatCard
          label="Savings Rate"
          value={`${data.summary.savingsRate}%`}
          subtext={
            <span className={data.summary.savingsRate >= 20 ? 'text-primary' : 'text-warning'}>
              {data.summary.savingsRate >= 20 ? 'On track' : 'Below 20% target'}
            </span>
          }
        />
        <StatCard
          label="Receipts"
          value={data.receipts.count.toString()}
          subtext={<AmountDisplay amount={data.receipts.total} size="sm" className="text-text-secondary" />}
        />
      </section>

      {/* Monthly Spending Trend */}
      <section>
        <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
          Monthly Spending
        </h2>
        <div className="p-4 rounded-xl border border-border bg-surface">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.monthlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="month"
                tick={{ fill: '#a1a1aa', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(m) => MONTH_NAMES[m - 1]}
              />
              <YAxis
                tickFormatter={(v: number) => formatRands(v)}
                tick={{ fill: '#a1a1aa', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={45}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.[0]) return null;
                  return (
                    <div className="bg-surface border border-border rounded-lg px-3 py-2 text-sm shadow-lg">
                      <p className="text-text-secondary mb-1">{MONTH_NAMES[(label as number) - 1]}</p>
                      <p className="text-text-primary font-medium">
                        <AmountDisplay amount={payload[0].value as number} size="sm" className="inline" />
                      </p>
                    </div>
                  );
                }}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="spent" radius={[4, 4, 0, 0]} maxBarSize={32}>
                {data.monthlyData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={isCurrentYear && entry.month > currentMonth ? '#3f3f46' : '#22c55e'}
                    opacity={isCurrentYear && entry.month > currentMonth ? 0.3 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Category Breakdown */}
      {data.topCategories.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
            Top Spending Categories
          </h2>
          <div className="p-4 rounded-xl border border-border bg-surface">
            <div className="flex gap-6 items-center">
              {/* Pie Chart */}
              <div className="w-32 h-32 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.topCategories}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={50}
                      paddingAngle={2}
                    >
                      {data.topCategories.map((entry, index) => (
                        <Cell key={`pie-${index}`} fill={CATEGORY_COLORS[entry.category]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="flex-1 space-y-2">
                {data.topCategories.map((cat) => {
                  const pct = Math.round((cat.amount / data.summary.totalSpent) * 100);
                  return (
                    <div key={cat.category} className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[cat.category] }}
                      />
                      <span className="text-sm text-text-primary flex-1">
                        {CATEGORY_LABELS[cat.category]}
                      </span>
                      <span className="text-sm text-text-secondary">{pct}%</span>
                      <AmountDisplay amount={cat.amount} size="sm" className="text-text-secondary w-24 text-right" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Goals & Wishlist */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Goals Card */}
        <section className="p-4 rounded-xl border border-border bg-surface">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
            Goals
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary text-sm">Completed this year</span>
              <span className="text-2xl font-semibold text-primary">{data.goals.completedThisYear}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-secondary text-sm">Active goals</span>
              <span className="text-lg text-text-primary">{data.goals.activeCount}</span>
            </div>
            {data.goals.activeCount > 0 && (
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-text-secondary">Average progress</span>
                  <span className="text-text-primary">{data.goals.averageProgress}%</span>
                </div>
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${data.goals.averageProgress}%` }}
                  />
                </div>
              </div>
            )}
            {data.goals.completedGoals.length > 0 && (
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-text-secondary mb-2">Completed goals:</p>
                <div className="space-y-1">
                  {data.goals.completedGoals.slice(0, 3).map((g) => (
                    <Link
                      key={g.id}
                      href={`/goals/${g.id}`}
                      className="flex items-center justify-between text-sm hover:text-primary transition-colors"
                    >
                      <span className="text-text-primary">{g.name}</span>
                      <AmountDisplay amount={g.targetAmount} size="sm" className="text-text-secondary" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Wishlist Card */}
        <section className="p-4 rounded-xl border border-border bg-surface">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
            Wishlist
          </h2>
          {data.wishlist.total === 0 ? (
            <div className="text-center py-4 text-text-secondary text-sm">
              <p>No wishlist items for {selectedYear}</p>
              <Link href="/wishlist" className="text-primary hover:underline text-sm mt-2 inline-block">
                Create your first wishlist
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2">
                <div className="w-20 h-20 relative">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="text-border"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeDasharray={`${data.wishlist.successRate} 100`}
                      strokeLinecap="round"
                      className="text-primary"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-semibold text-text-primary">{data.wishlist.successRate}%</span>
                  </div>
                </div>
                <div className="text-sm text-text-secondary">
                  Success Rate
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2 rounded-lg bg-primary/10">
                  <div className="text-lg font-semibold text-primary">{data.wishlist.completed}</div>
                  <div className="text-xs text-text-secondary">Completed</div>
                </div>
                <div className="p-2 rounded-lg bg-warning/10">
                  <div className="text-lg font-semibold text-warning">{data.wishlist.carriedForward}</div>
                  <div className="text-xs text-text-secondary">Carried Over</div>
                </div>
                <div className="p-2 rounded-lg bg-error/10">
                  <div className="text-lg font-semibold text-error">{data.wishlist.abandoned}</div>
                  <div className="text-xs text-text-secondary">Abandoned</div>
                </div>
                <div className="p-2 rounded-lg bg-border">
                  <div className="text-lg font-semibold text-text-primary">{data.wishlist.active}</div>
                  <div className="text-xs text-text-secondary">Still Active</div>
                </div>
              </div>

              <Link
                href={`/wishlist?year=${selectedYear}`}
                className="block text-center text-sm text-primary hover:underline"
              >
                View {selectedYear} wishlist
              </Link>
            </div>
          )}
        </section>
      </div>

      {/* Year Insights */}
      <section className="p-4 rounded-xl border border-border bg-surface">
        <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
          Year Highlights
        </h2>
        <div className="space-y-3">
          {generateInsights(data, isCurrentYear)}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
}

function StatCard({ label, value, subtext }: StatCardProps) {
  return (
    <div className="p-4 rounded-xl border border-border bg-surface">
      <p className="text-xs text-text-secondary uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-semibold text-text-primary">{value}</p>
      {subtext && <p className="text-xs mt-1">{subtext}</p>}
    </div>
  );
}

function generateInsights(data: YearReviewData, isCurrentYear: boolean): React.ReactNode[] {
  const insights: React.ReactNode[] = [];

  // Spending trend
  if (data.summary.spendingChange !== null) {
    if (data.summary.spendingChange < -10) {
      insights.push(
        <InsightRow
          key="spending-down"
          icon="📉"
          text={`You spent ${Math.abs(data.summary.spendingChange)}% less than last year!`}
          type="positive"
        />
      );
    } else if (data.summary.spendingChange > 10) {
      insights.push(
        <InsightRow
          key="spending-up"
          icon="📈"
          text={`Spending increased ${data.summary.spendingChange}% compared to last year.`}
          type="warning"
        />
      );
    }
  }

  // Savings rate
  if (data.summary.savingsRate >= 30) {
    insights.push(
      <InsightRow
        key="savings-great"
        icon="💰"
        text={`Excellent! You saved ${data.summary.savingsRate}% of your income.`}
        type="positive"
      />
    );
  } else if (data.summary.savingsRate >= 20) {
    insights.push(
      <InsightRow
        key="savings-good"
        icon="✓"
        text={`Solid savings rate of ${data.summary.savingsRate}%.`}
        type="positive"
      />
    );
  } else if (data.summary.savingsRate < 10 && data.summary.netIncome > 0) {
    insights.push(
      <InsightRow
        key="savings-low"
        icon="⚠"
        text={`Low savings rate (${data.summary.savingsRate}%). Consider reviewing expenses.`}
        type="warning"
      />
    );
  }

  // Goals achievements
  if (data.goals.completedThisYear >= 3) {
    insights.push(
      <InsightRow
        key="goals-many"
        icon="🎯"
        text={`Amazing! You completed ${data.goals.completedThisYear} financial goals.`}
        type="positive"
      />
    );
  } else if (data.goals.completedThisYear >= 1) {
    insights.push(
      <InsightRow
        key="goals-some"
        icon="✓"
        text={`You completed ${data.goals.completedThisYear} goal${data.goals.completedThisYear > 1 ? 's' : ''} this year.`}
        type="positive"
      />
    );
  }

  // Wishlist success
  if (data.wishlist.total > 0) {
    if (data.wishlist.successRate >= 80) {
      insights.push(
        <InsightRow
          key="wishlist-great"
          icon="🌟"
          text={`${data.wishlist.successRate}% wishlist success rate - outstanding!`}
          type="positive"
        />
      );
    } else if (data.wishlist.successRate >= 50) {
      insights.push(
        <InsightRow
          key="wishlist-good"
          icon="👍"
          text={`Completed ${data.wishlist.completed} of ${data.wishlist.total} wishlist items.`}
          type="neutral"
        />
      );
    }
  }

  // Top category insight
  if (data.topCategories.length > 0) {
    const top = data.topCategories[0];
    const pct = Math.round((top.amount / data.summary.totalSpent) * 100);
    insights.push(
      <InsightRow
        key="top-cat"
        icon="📊"
        text={`${CATEGORY_LABELS[top.category]} is your biggest expense category (${pct}% of total).`}
        type="neutral"
      />
    );
  }

  // Receipts insight
  if (data.receipts.count >= 100) {
    insights.push(
      <InsightRow
        key="receipts-many"
        icon="🧾"
        text={`You captured ${data.receipts.count} receipts - great tracking!`}
        type="positive"
      />
    );
  }

  if (insights.length === 0) {
    insights.push(
      <InsightRow
        key="no-insights"
        icon="📝"
        text={isCurrentYear ? 'Keep tracking to unlock insights!' : 'Limited data available for this year.'}
        type="neutral"
      />
    );
  }

  return insights;
}

interface InsightRowProps {
  icon: string;
  text: string;
  type: 'positive' | 'warning' | 'neutral';
}

function InsightRow({ icon, text, type }: InsightRowProps) {
  const colors = {
    positive: 'bg-primary/10 text-primary',
    warning: 'bg-warning/10 text-warning',
    neutral: 'bg-border text-text-secondary',
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-background">
      <span className={`text-lg shrink-0 w-8 h-8 flex items-center justify-center rounded-full ${colors[type]}`}>
        {icon}
      </span>
      <span className="text-sm text-text-primary pt-1">{text}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ReviewSkeleton() {
  return (
    <div className="space-y-8 pb-8 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-36 bg-surface rounded" />
          <div className="h-4 w-48 bg-surface rounded mt-2" />
        </div>
        <div className="h-8 w-24 bg-surface rounded-lg" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-surface rounded-xl" />
        ))}
      </div>
      <section className="space-y-3">
        <div className="h-3 w-32 bg-surface rounded" />
        <div className="h-52 bg-surface rounded-xl" />
      </section>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="h-48 bg-surface rounded-xl" />
        <div className="h-48 bg-surface rounded-xl" />
      </div>
    </div>
  );
}
