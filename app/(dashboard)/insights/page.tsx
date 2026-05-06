'use client';

import { useState } from 'react';
import { useInsights } from '@/hooks/use-insights';

const TYPE_CONFIG = {
  alert:       { icon: '⚠️', label: 'Alert',       color: 'border-warning/40 bg-warning/5',   badge: 'bg-warning/10 text-warning' },
  trend:       { icon: '📈', label: 'Trend',        color: 'border-border bg-surface',          badge: 'bg-blue-500/10 text-blue-400' },
  suggestion:  { icon: '💡', label: 'Suggestion',   color: 'border-border bg-surface',          badge: 'bg-primary/10 text-primary' },
  achievement: { icon: '🎉', label: 'Achievement',  color: 'border-primary/30 bg-primary/5',   badge: 'bg-primary/10 text-primary' },
} as const;

type InsightType = keyof typeof TYPE_CONFIG;

export default function InsightsPage() {
  const { insights, unreadCount, loading, dismiss, snooze, markAsRead } = useInsights();
  const [typeFilter, setTypeFilter] = useState<'all' | InsightType>('all');

  const filtered = typeFilter === 'all' ? insights : insights.filter((i) => i.type === typeFilter);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-7 w-32 bg-surface rounded" />
        {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-surface rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Insights</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-text-secondary mt-0.5">{unreadCount} unread</p>
          )}
        </div>
      </div>

      {/* Type filter chips */}
      {insights.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${
              typeFilter === 'all' ? 'bg-primary text-background' : 'bg-surface border border-border text-text-secondary hover:border-primary'
            }`}
          >
            All ({insights.length})
          </button>
          {(Object.keys(TYPE_CONFIG) as InsightType[]).map((t) => {
            const count = insights.filter((i) => i.type === t).length;
            if (count === 0) return null;
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  typeFilter === t ? 'bg-primary text-background' : 'bg-surface border border-border text-text-secondary hover:border-primary'
                }`}
              >
                {TYPE_CONFIG[t].icon} {TYPE_CONFIG[t].label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-text-secondary">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm">{typeFilter === 'all' ? 'No insights yet.' : `No ${TYPE_CONFIG[typeFilter as InsightType].label.toLowerCase()} insights.`}</p>
          {typeFilter === 'all' && <p className="text-xs mt-1">The AI analyzes your data nightly and weekly to surface trends and suggestions.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((insight) => {
            const config = TYPE_CONFIG[insight.type] ?? TYPE_CONFIG.suggestion;
            const isUnread = !insight.isRead;

            return (
              <div
                key={insight.id}
                className={`rounded-xl border p-4 ${config.color} ${isUnread ? 'ring-1 ring-primary/20' : ''}`}
                onClick={() => { if (isUnread) markAsRead(insight.id); }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0 mt-0.5">{config.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.badge}`}>
                        {config.label}
                      </span>
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Unread" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-text-primary">{insight.title}</p>
                    <p className="text-sm text-text-secondary mt-1">{insight.message}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3 ml-9">
                  <button
                    onClick={(e) => { e.stopPropagation(); dismiss(insight.id); }}
                    className="text-xs text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded hover:bg-background"
                  >
                    Dismiss
                  </button>
                  {insight.type !== 'achievement' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); snooze(insight.id, 7); }}
                      className="text-xs text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded hover:bg-background"
                    >
                      Snooze 7 days
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
