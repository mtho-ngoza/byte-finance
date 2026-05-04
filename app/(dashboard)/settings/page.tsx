'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from '@/hooks/use-user-id';
import { useUserProfile } from '@/hooks/use-user-profile';
import { Skeleton } from '@/components/shared/skeleton';
import { useSage } from '@/hooks/use-sage';

// ---------------------------------------------------------------------------
// Sage Business Cloud Connection Component
// ---------------------------------------------------------------------------

function SageConnection() {
  const { connectionStatus, statusLoading, connect, disconnect } = useSage();
  const [disconnecting, setDisconnecting] = useState(false);

  // Show success/error banners from OAuth redirect query params
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('sage_connected') === '1') {
      setBanner({ type: 'success', message: 'Sage Business Cloud connected successfully.' });
      // Clean up query param without reload
      const url = new URL(window.location.href);
      url.searchParams.delete('sage_connected');
      window.history.replaceState({}, '', url.toString());
    } else if (params.get('sage_error')) {
      setBanner({ type: 'error', message: `Sage connection failed: ${params.get('sage_error')}` });
      const url = new URL(window.location.href);
      url.searchParams.delete('sage_error');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Sage Business Cloud? You can reconnect at any time.')) return;
    setDisconnecting(true);
    try {
      await disconnect();
      setBanner({ type: 'success', message: 'Sage disconnected.' });
    } catch (err) {
      console.error(err);
      setBanner({ type: 'error', message: 'Failed to disconnect Sage. Please try again.' });
    } finally {
      setDisconnecting(false);
    }
  };

  if (statusLoading) {
    return <Skeleton height={80} className="w-full" />;
  }

  return (
    <div className="p-4 bg-surface border border-border rounded-lg space-y-4">
      {banner && (
        <div
          className={`px-3 py-2 rounded-lg text-sm ${
            banner.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-danger/10 border border-danger/30 text-danger'
          }`}
        >
          {banner.message}
        </div>
      )}

      {connectionStatus?.connected ? (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">
                {connectionStatus.companyName || 'Connected'}
              </p>
              {connectionStatus.connectedAt && (
                <p className="text-xs text-text-secondary">
                  Connected {new Date(connectionStatus.connectedAt).toLocaleDateString('en-ZA')}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="px-3 py-1.5 text-sm border border-danger/40 text-danger rounded-lg hover:bg-danger/5 transition-colors disabled:opacity-50"
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-text-secondary">
              Link your Sage account to push receipts directly to transactions.
            </p>
          </div>
          <button
            onClick={connect}
            className="flex-shrink-0 px-4 py-2 bg-primary text-black font-medium rounded-lg text-sm hover:bg-primary/90 transition-colors"
          >
            Connect
          </button>
        </div>
      )}
    </div>
  );
}

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

      {/* Sage Business Cloud */}
      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Sage Business Cloud</h2>
          <p className="text-sm text-text-secondary mt-1">
            Connect your Sage account to match and push receipts to transactions.
          </p>
        </div>
        <SageConnection />
      </section>

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
