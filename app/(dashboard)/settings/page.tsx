'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from '@/hooks/use-user-id';
import { useUserProfile } from '@/hooks/use-user-profile';
import { Skeleton } from '@/components/shared/skeleton';

// ---------------------------------------------------------------------------
// VAT Config Component
// ---------------------------------------------------------------------------

function VatConfig() {
  const userId = useUserId();
  const { profile, loading } = useUserProfile();
  const [saving, setSaving] = useState(false);
  const [vatPercentage, setVatPercentage] = useState<number | null>(null);

  // Sync state when profile loads
  useEffect(() => {
    if (profile?.preferences?.vatPercentage !== undefined) {
      setVatPercentage(profile.preferences.vatPercentage);
    }
  }, [profile]);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    try {
      const ref = doc(db, `users/${userId}`);
      await setDoc(ref, {
        preferences: {
          ...profile?.preferences,
          vatPercentage: vatPercentage ?? undefined,
        },
        updatedAt: Timestamp.now(),
      }, { merge: true });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Skeleton height={80} className="w-full" />;
  }

  const currentVat = profile?.preferences?.vatPercentage;
  const hasChanges = vatPercentage !== (currentVat ?? null);

  return (
    <div className="p-4 bg-surface border border-border rounded-lg space-y-4">
      <div>
        <label className="block text-xs text-text-secondary mb-2">VAT Percentage</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={vatPercentage ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              setVatPercentage(val === '' ? null : Math.min(100, Math.max(0, parseFloat(val) || 0)));
            }}
            placeholder="15"
            min={0}
            max={100}
            step="0.1"
            className="w-24 px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary text-sm"
          />
          <span className="text-sm text-text-secondary">%</span>
        </div>
        <p className="text-xs text-text-secondary mt-1">
          SA VAT is 15%. Leave empty to disable VAT calculation.
        </p>
      </div>

      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 bg-primary text-black font-medium rounded-lg text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export Data Component
// ---------------------------------------------------------------------------

function ExportData() {
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null);

  const handleExport = async (format: 'json' | 'csv') => {
    setExporting(format);
    try {
      const res = await fetch(`/api/export?format=${format}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `byte-finance-export-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="p-4 bg-surface border border-border rounded-lg space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handleExport('json')}
          disabled={exporting !== null}
          className="py-3 px-4 bg-background border border-border rounded-lg hover:border-primary transition-colors disabled:opacity-50"
        >
          <p className="text-sm font-medium text-text-primary">
            {exporting === 'json' ? 'Exporting...' : 'Export JSON'}
          </p>
          <p className="text-xs text-text-secondary mt-0.5">Complete backup</p>
        </button>
        <button
          onClick={() => handleExport('csv')}
          disabled={exporting !== null}
          className="py-3 px-4 bg-background border border-border rounded-lg hover:border-primary transition-colors disabled:opacity-50"
        >
          <p className="text-sm font-medium text-text-primary">
            {exporting === 'csv' ? 'Exporting...' : 'Export CSV'}
          </p>
          <p className="text-xs text-text-secondary mt-0.5">Spreadsheet format</p>
        </button>
      </div>
      <p className="text-xs text-text-secondary">
        JSON includes all data. CSV contains cycle items only.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-8">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
      </div>

      {/* VAT Config */}
      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">VAT</h2>
          <p className="text-sm text-text-secondary mt-1">
            Set VAT percentage for business income. Used for statement reconciliation.
          </p>
        </div>
        <VatConfig />
      </section>

      {/* Quick Links */}
      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Manage</h2>
        </div>
        <div className="space-y-2">
          <Link
            href="/plan"
            className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg hover:bg-background transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-text-primary">Commitments</p>
              <p className="text-xs text-text-secondary">Manage recurring monthly expenses</p>
            </div>
            <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/goals"
            className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg hover:bg-background transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-text-primary">Goals</p>
              <p className="text-xs text-text-secondary">Manage savings and investment goals</p>
            </div>
            <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Export Data */}
      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Export Data</h2>
          <p className="text-sm text-text-secondary mt-1">
            Download your financial data for backup or analysis.
          </p>
        </div>
        <ExportData />
      </section>
    </div>
  );
}
