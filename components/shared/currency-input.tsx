'use client';

import { useState, useEffect } from 'react';

interface CurrencyInputProps {
  value: number; // cents
  onChange: (cents: number) => void;
  placeholder?: string;
  className?: string;
}

export function CurrencyInput({
  value,
  onChange,
  placeholder = '0.00',
  className = '',
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState(() =>
    value === 0 ? '' : (value / 100).toFixed(2)
  );

  // Sync display when external value changes
  useEffect(() => {
    setDisplayValue(value === 0 ? '' : (value / 100).toFixed(2));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    // Allow digits, one decimal point, and up to 2 decimal places
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
      setDisplayValue(raw);
      const parsed = parseFloat(raw);
      onChange(isNaN(parsed) ? 0 : Math.round(parsed * 100));
    }
  }

  function handleBlur() {
    if (displayValue !== '') {
      const parsed = parseFloat(displayValue);
      if (!isNaN(parsed)) {
        setDisplayValue(parsed.toFixed(2));
      }
    }
  }

  return (
    <div className={`relative flex items-center ${className}`}>
      <span
        className="absolute left-3 text-text-secondary select-none"
        style={{ fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace' }}
      >
        R
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full pl-7 pr-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary"
        style={{ fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace' }}
      />
    </div>
  );
}
