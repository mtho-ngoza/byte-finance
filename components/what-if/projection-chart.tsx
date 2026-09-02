'use client';

import type { ProjectionPoint } from '@/types';

interface ProjectionChartProps {
  currentTimeline: ProjectionPoint[];
  scenarioTimeline: ProjectionPoint[];
  formatAmount: (cents: number) => string;
  isDebt?: boolean;
}

export function ProjectionChart({
  currentTimeline,
  scenarioTimeline,
  formatAmount,
  isDebt = false,
}: ProjectionChartProps) {
  if (currentTimeline.length === 0 && scenarioTimeline.length === 0) {
    return (
      <div className="p-6 text-center text-text-secondary">
        No projection data available
      </div>
    );
  }

  // Combine and find max values for scaling
  const allPoints = [...currentTimeline, ...scenarioTimeline];
  const maxBalance = Math.max(...allPoints.map((p) => p.balance));
  const maxMonths = Math.max(currentTimeline.length, scenarioTimeline.length);

  // Chart dimensions
  const chartHeight = 160;
  const chartWidth = 100; // percentage

  const getY = (balance: number) => {
    if (maxBalance === 0) return chartHeight;
    return chartHeight - (balance / maxBalance) * chartHeight;
  };

  const getX = (index: number, total: number) => {
    if (total <= 1) return 0;
    return (index / (maxMonths - 1)) * chartWidth;
  };

  const buildPath = (timeline: ProjectionPoint[]) => {
    if (timeline.length === 0) return '';
    return timeline
      .map((p, i) => {
        const x = getX(i, maxMonths);
        const y = getY(p.balance);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  const currentPath = buildPath(currentTimeline);
  const scenarioPath = buildPath(scenarioTimeline);

  // Display key months
  const displayMonths = [0, Math.floor(maxMonths / 2), maxMonths - 1].filter(
    (i, idx, arr) => arr.indexOf(i) === idx && i < maxMonths
  );

  return (
    <div className="space-y-3">
      <div className="relative" style={{ height: chartHeight + 40 }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-text-secondary pr-2">
          <span>{formatAmount(maxBalance)}</span>
          <span>{formatAmount(Math.round(maxBalance / 2))}</span>
          <span>{formatAmount(0)}</span>
        </div>

        {/* Chart area */}
        <div className="ml-16 relative" style={{ height: chartHeight }}>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            {/* Grid lines */}
            <line
              x1="0"
              y1={chartHeight / 2}
              x2={chartWidth}
              y2={chartHeight / 2}
              stroke="currentColor"
              strokeOpacity="0.1"
              strokeDasharray="2"
            />

            {/* Current path */}
            {currentPath && (
              <path
                d={currentPath}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeOpacity="0.3"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Scenario path */}
            {scenarioPath && (
              <path
                d={scenarioPath}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* X-axis labels */}
          <div className="absolute bottom-[-24px] left-0 right-0 flex justify-between text-xs text-text-secondary">
            {displayMonths.map((i) => {
              const point = currentTimeline[i] || scenarioTimeline[i];
              return point ? <span key={i}>{point.month}</span> : null;
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-text-secondary/30" />
          <span className="text-text-secondary">Current pace</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-primary" />
          <span className="text-text-secondary">With changes</span>
        </div>
      </div>
    </div>
  );
}
