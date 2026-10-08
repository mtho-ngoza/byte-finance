'use client';

import { useState, useEffect, useRef } from 'react';

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
  // Track if user is actively editing
  const [isFocused, setIsFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState(() =>
    value === 0 ? '' : String(value / 100)
  );
  const lastExternalValue = useRef(value);

  // Only sync from external value when not focused and value actually changed externally
  useEffect(() => {
    if (!isFocused && value !== lastExternalValue.current) {
      setDisplayValue(value === 0 ? '' : String(value / 100));
      lastExternalValue.current = value;
    }
  }, [value, isFocused]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    // Allow digits, one decimal point, and up to 2 decimal places
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
      setDisplayValue(raw);
      const parsed = parseFloat(raw);
      const cents = isNaN(parsed) ? 0 : Math.round(parsed * 100);
      onChange(cents);
      lastExternalValue.current = cents;
    }
  }

  function handleFocus() {
    setIsFocused(true);
  }

  function handleBlur() {
    setIsFocused(false);
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
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full pl-7 pr-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary"
        style={{ fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace' }}
      />
    </div>
  );
}
