'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { CATEGORY_LABELS, SUB_CATEGORY_LABELS, getSubCategoryOptions } from '@/lib/constants';
import { useToast } from '@/components/shared/toast';
import { Skeleton } from '@/components/shared/skeleton';
import type { VendorRule, Category } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RuleFormData {
  vendor: string;
  category: Category;
  subCategory: string;
}

// ---------------------------------------------------------------------------
// Hook: useVendorRules
// ---------------------------------------------------------------------------

function useVendorRules() {
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

  const createRule = async (data: RuleFormData) => {
    const res = await fetch('/api/vendor-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create rule');
    }
    await fetchRules();
  };

  const updateRule = async (id: string, data: Partial<RuleFormData>) => {
    const res = await fetch(`/api/vendor-rules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update rule');
    }
    await fetchRules();
  };

  const deleteRule = async (id: string) => {
    const res = await fetch(`/api/vendor-rules/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete rule');
    }
    await fetchRules();
  };

  return { rules, loading, error, createRule, updateRule, deleteRule, refetch: fetchRules };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function RuleCard({
  rule,
  onEdit,
  onDelete,
}: {
  rule: VendorRule;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const categoryLabel = CATEGORY_LABELS[rule.category] || rule.category;
  const subCategoryLabel = rule.subCategory
    ? SUB_CATEGORY_LABELS[rule.subCategory] || rule.subCategory
    : null;

  return (
    <div className="p-4 bg-surface border border-border rounded-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{rule.vendor}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded">
              {categoryLabel}
            </span>
            {subCategoryLabel && (
              <span className="px-2 py-0.5 text-xs bg-background text-text-secondary rounded">
                {subCategoryLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-text-secondary">
            <span>
              {rule.confidence === 'user_set' ? 'Manual' : 'Learned'}
            </span>
            <span>{rule.matchCount} match{rule.matchCount !== 1 ? 'es' : ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="p-2 text-text-secondary hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
            aria-label="Edit rule"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-text-secondary hover:text-danger hover:bg-danger/5 rounded-lg transition-colors"
            aria-label="Delete rule"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initialData?: Partial<RuleFormData>;
  onSubmit: (data: RuleFormData) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [vendor, setVendor] = useState(initialData?.vendor || '');
  const [category, setCategory] = useState<Category>(initialData?.category || 'other');
  const [subCategory, setSubCategory] = useState(initialData?.subCategory || '');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const subCategoryOptions = getSubCategoryOptions(category);

  // Reset sub-category when category changes
  useEffect(() => {
    if (!subCategoryOptions.some((opt) => opt.value === subCategory)) {
      setSubCategory('');
    }
  }, [category, subCategoryOptions, subCategory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor.trim()) {
      toast('Vendor name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ vendor: vendor.trim(), category, subCategory });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-surface border border-border rounded-lg space-y-4">
      <div>
        <label className="block text-xs text-text-secondary mb-2">Vendor Name</label>
        <input
          type="text"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="e.g., Engen, Pick n Pay"
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary text-sm"
          disabled={!!initialData?.vendor}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-text-secondary mb-2">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary text-sm"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-text-secondary mb-2">Sub-category</label>
          <select
            value={subCategory}
            onChange={(e) => setSubCategory(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary text-sm"
            disabled={subCategoryOptions.length === 0}
          >
            <option value="">None</option>
            {subCategoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !vendor.trim()}
          className="px-4 py-2 bg-primary text-black font-medium rounded-lg text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function VendorRulesPage() {
  const { rules, loading, error, createRule, updateRule, deleteRule } = useVendorRules();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRule, setEditingRule] = useState<VendorRule | null>(null);
  const { toast, confirm } = useToast();

  const handleCreate = async (data: RuleFormData) => {
    await createRule(data);
    setShowAddForm(false);
    toast('Rule created', 'success');
  };

  const handleUpdate = async (data: RuleFormData) => {
    if (!editingRule) return;
    await updateRule(editingRule.id, data);
    setEditingRule(null);
    toast('Rule updated', 'success');
  };

  const handleDelete = (rule: VendorRule) => {
    confirm(`Delete rule for "${rule.vendor}"?`, async () => {
      try {
        await deleteRule(rule.id);
        toast('Rule deleted', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Failed to delete', 'error');
      }
    }, { title: 'Delete Vendor Rule', confirmLabel: 'Delete', danger: true });
  };

  if (loading) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings" className="p-2 -ml-2 text-text-secondary hover:text-primary">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-semibold text-text-primary">Vendor Rules</h1>
        </div>
        <Skeleton height={100} className="w-full" />
        <Skeleton height={100} className="w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings" className="p-2 -ml-2 text-text-secondary hover:text-primary">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-semibold text-text-primary">Vendor Rules</h1>
        </div>
        <div className="p-4 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/settings" className="p-2 -ml-2 text-text-secondary hover:text-primary">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Vendor Rules</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Auto-categorize receipts by vendor
            </p>
          </div>
        </div>
        {!showAddForm && !editingRule && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-black font-medium rounded-lg text-sm hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Rule
          </button>
        )}
      </div>

      {showAddForm && (
        <RuleForm
          onSubmit={handleCreate}
          onCancel={() => setShowAddForm(false)}
          submitLabel="Create Rule"
        />
      )}

      {editingRule && (
        <RuleForm
          initialData={{
            vendor: editingRule.vendor,
            category: editingRule.category,
            subCategory: editingRule.subCategory || '',
          }}
          onSubmit={handleUpdate}
          onCancel={() => setEditingRule(null)}
          submitLabel="Update Rule"
        />
      )}

      {rules.length === 0 && !showAddForm ? (
        <div className="p-8 bg-surface border border-border rounded-lg text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-text-secondary text-sm mb-4">
            No vendor rules yet. Create rules to auto-categorize your receipts.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-primary text-black font-medium rounded-lg text-sm hover:bg-primary/90 transition-colors"
          >
            Create First Rule
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onEdit={() => setEditingRule(rule)}
              onDelete={() => handleDelete(rule)}
            />
          ))}
        </div>
      )}

      <div className="p-4 bg-background border border-border rounded-lg">
        <h3 className="text-sm font-medium text-text-primary mb-2">How it works</h3>
        <ul className="text-xs text-text-secondary space-y-1">
          <li>When you upload a receipt, the vendor is matched against your rules.</li>
          <li>Matched receipts are auto-categorized with high confidence.</li>
          <li>Rules are also learned automatically when you assign categories.</li>
        </ul>
      </div>
    </div>
  );
}
