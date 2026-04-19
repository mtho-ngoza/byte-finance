interface AmountDisplayProps {
  amount: number; // cents
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
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

export function AmountDisplay({ amount, className = '', size = 'md' }: AmountDisplayProps) {
  return (
    <span
      className={`font-mono ${sizeClasses[size]} ${className}`}
      style={{ fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace' }}
    >
      {formatZAR(amount)}
    </span>
  );
}
