interface AmountDisplayProps {
  amount: number; // cents
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  compact?: boolean; // Use abbreviated format (R 61.3k instead of R 61,275.00)
}

const sizeClasses = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl',
};

function formatZAR(cents: number): string {
  const rands = cents / 100;
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    currencyDisplay: 'symbol',
  })
    .format(rands)
    .replace('ZAR', 'R');
}

function formatZARCompact(cents: number): string {
  const rands = cents / 100;
  if (Math.abs(rands) >= 1000000) {
    return `R ${(rands / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(rands) >= 10000) {
    return `R ${(rands / 1000).toFixed(0)}k`;
  }
  if (Math.abs(rands) >= 1000) {
    return `R ${(rands / 1000).toFixed(1)}k`;
  }
  return `R ${rands.toFixed(0)}`;
}

export function AmountDisplay({ amount, className = '', size = 'md', compact = false }: AmountDisplayProps) {
  return (
    <span
      className={`font-mono whitespace-nowrap ${sizeClasses[size]} ${className}`}
      style={{ fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace' }}
    >
      {compact ? formatZARCompact(amount) : formatZAR(amount)}
    </span>
  );
}
