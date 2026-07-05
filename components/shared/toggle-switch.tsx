'use client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToggleSwitchProps {
  /** Whether the toggle is on */
  checked: boolean;
  /** Called when toggle state changes */
  onChange: (checked: boolean) => void;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Disable the toggle */
  disabled?: boolean;
  /** Accessible label */
  label?: string;
  /** Title/tooltip text */
  title?: string;
}

// ---------------------------------------------------------------------------
// ToggleSwitch Component
// ---------------------------------------------------------------------------

export function ToggleSwitch({
  checked,
  onChange,
  size = 'md',
  disabled = false,
  label,
  title,
}: ToggleSwitchProps) {
  const sizeClasses = size === 'sm'
    ? { track: 'w-8 h-4', thumb: 'w-3 h-3', translate: 'translate-x-4' }
    : { track: 'w-10 h-5', thumb: 'w-4 h-4', translate: 'translate-x-5' };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative ${sizeClasses.track} rounded-full transition-colors shrink-0 ${
        checked ? 'bg-primary' : 'bg-border'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 ${sizeClasses.thumb} rounded-full bg-white transition-transform ${
          checked ? sizeClasses.translate : 'translate-x-0'
        }`}
      />
    </button>
  );
}
