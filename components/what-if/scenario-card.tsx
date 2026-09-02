'use client';

import type { WhatIfScenarioType } from '@/types';

interface ScenarioCardProps {
  type: WhatIfScenarioType;
  title: string;
  description: string;
  icon: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export function ScenarioCard({
  title,
  description,
  icon,
  selected,
  onClick,
  disabled,
}: ScenarioCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-4 rounded-xl border text-left transition-all ${
        selected
          ? 'border-primary bg-primary/10'
          : disabled
          ? 'border-border bg-surface/50 opacity-50 cursor-not-allowed'
          : 'border-border bg-surface hover:border-primary/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <h3 className="font-medium text-text-primary">{title}</h3>
          <p className="text-sm text-text-secondary mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  );
}
