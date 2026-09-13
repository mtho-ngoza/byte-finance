import { useState, useEffect, useCallback, useMemo } from 'react';
import { suggestCategory, type CategorySuggestion } from '@/lib/category-engine';
import type { VendorRule } from '@/types';

/**
 * Hook to fetch and use vendor rules for category suggestions
 */
export function useVendorRules() {
  const [rules, setRules] = useState<VendorRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/vendor-rules');
      if (!res.ok) throw new Error('Failed to fetch rules');
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  /**
   * Get category suggestion for a vendor
   */
  const suggest = useCallback(
    (vendor: string): CategorySuggestion => {
      return suggestCategory(vendor, rules);
    },
    [rules]
  );

  /**
   * Learn from user's category assignment
   * Creates or updates a vendor rule
   */
  const learnFromAssignment = useCallback(
    async (vendor: string, category: string, subCategory?: string) => {
      if (!vendor.trim()) return;

      try {
        await fetch('/api/vendor-rules/learn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendor, category, subCategory }),
        });
        // Refetch rules to get updated data
        await fetchRules();
      } catch (err) {
        console.error('Failed to learn from assignment:', err);
      }
    },
    [fetchRules]
  );

  return {
    rules,
    loading,
    error,
    suggest,
    learnFromAssignment,
    refetch: fetchRules,
  };
}

/**
 * Lightweight hook that only provides category suggestion for a single vendor
 * Useful for forms where you want to suggest category as user types vendor
 */
export function useCategorySuggestion(vendor: string) {
  const { suggest, loading } = useVendorRules();

  const suggestion = useMemo(() => {
    if (!vendor || vendor.trim().length < 2) return null;
    return suggest(vendor);
  }, [vendor, suggest]);

  return { suggestion, loading };
}
