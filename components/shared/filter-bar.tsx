'use client';

import { useAppStore } from '@/stores/app-store';

interface FilterBarProps {
  availableYears?: number[];
  showYearFilter?: boolean;
  showAccountFilter?: boolean;
}

export function FilterBar({
  availableYears,
  showYearFilter = true,
  showAccountFilter = true,
}: FilterBarProps) {
  const { accountFilter, selectedYear, setAccountFilter, setSelectedYear } = useAppStore();

  // Default years: current year and 3 years back
  const currentYear = new Date().getFullYear();
  const years = availableYears ?? [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Year filter */}
      {showYearFilter && (
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
          className="px-3 py-1.5 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
          aria-label="Select year"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      )}

      {/* Account type filter */}
      {showAccountFilter && (
        <div className="flex rounded-lg border border-border overflow-hidden">
          <FilterButton
            active={accountFilter === 'all'}
            onClick={() => setAccountFilter('all')}
          >
            All
          </FilterButton>
          <FilterButton
            active={accountFilter === 'personal'}
            onClick={() => setAccountFilter('personal')}
          >
            Personal
          </FilterButton>
          <FilterButton
            active={accountFilter === 'business'}
            onClick={() => setAccountFilter('business')}
          >
            Business
          </FilterButton>
        </div>
      )}
    </div>
  );
}

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function FilterButton({ active, onClick, children }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-primary text-background'
          : 'bg-surface text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}
