'use client';

import { InputHTMLAttributes } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Label text */
  label?: string;
  /** Additional container className */
  containerClassName?: string;
  /** Input size variant */
  inputSize?: 'sm' | 'md';
}

// ---------------------------------------------------------------------------
// DateInput Component
// ---------------------------------------------------------------------------

export function DateInput({
  label,
  containerClassName = '',
  inputSize = 'md',
  className = '',
  ...props
}: DateInputProps) {
  const sizeClasses = inputSize === 'sm'
    ? 'px-2 py-1.5 text-xs'
    : 'px-3 py-2 text-sm';

  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-xs text-text-secondary mb-1">{label}</label>
      )}
      <input
        type="date"
        className={`w-full ${sizeClasses} rounded-lg border border-border bg-background text-text-primary focus:outline-none focus:border-primary appearance-none [color-scheme:dark] ${className}`}
        style={{ colorScheme: 'dark' }}
        {...props}
      />
    </div>
  );
}
