'use client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProgressBarProps {
  /** Progress percentage (0-100) */
  value: number;
  /** Height variant */
  size?: 'sm' | 'md' | 'lg';
  /** Color variant or custom class */
  color?: 'primary' | 'warning' | 'error' | 'success' | string;
  /** Whether progress is "on track" (used for conditional coloring) */
  isOnTrack?: boolean;
  /** Show overflow indicator when value > 100 */
  showOverflow?: boolean;
  /** Additional className for the track */
  className?: string;
}

// ---------------------------------------------------------------------------
// ProgressBar Component
// ---------------------------------------------------------------------------

export function ProgressBar({
  value,
  size = 'md',
  color,
  isOnTrack,
  showOverflow = false,
  className = '',
}: ProgressBarProps) {
  const clampedValue = showOverflow ? Math.min(100, value) : Math.min(100, Math.max(0, value));

  const heightClass = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  }[size];

  // Determine bar color
  let barColorClass: string;
  if (color) {
    // If explicit color is provided, use it
    if (['primary', 'warning', 'error', 'success'].includes(color)) {
      barColorClass = `bg-${color}`;
    } else {
      barColorClass = color; // Custom class
    }
  } else if (isOnTrack !== undefined) {
    // Use on-track logic
    barColorClass = isOnTrack ? 'bg-primary' : 'bg-warning';
  } else if (value > 100) {
    // Over 100% defaults to error
    barColorClass = 'bg-error';
  } else {
    // Default to primary
    barColorClass = 'bg-primary';
  }

  return (
    <div className={`${heightClass} bg-background rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all ${barColorClass}`}
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
}
