'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { doc, setDoc, updateDoc, Timestamp, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from '@/hooks/use-user-id';
import { useUserProfile } from '@/hooks/use-user-profile';
import { Skeleton } from '@/components/shared/skeleton';
import { useSage } from '@/hooks/use-sage';
import { useToast } from '@/components/shared/toast';

// ---------------------------------------------------------------------------
// SageConnection
// ---------------------------------------------------------------------------

function SageConnection() {
  const { connectionStatus, statusLoading, connect, disconnect } = useSage();
  const [disconnecting, setDisconnecting] = useState(false);
  const { toast, confirm } = useToast();
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('sage_connected') === '1') {
      setBanner({ type: 'success', message: 'Sage Business Cloud connected successfully.' });
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

  const handleDisconnect = () => {
    confirm('You can reconnect at any time.', async () => {
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
    }, { title: 'Disconnect Sage Business Cloud', confirmLabel: 'Disconnect', danger: true });
  };

  if (statusLoading) return <Skeleton height={80} className="w-full" />;

  return (
    <div className="p-4 bg-surface border border-border rounded-lg space-y-4">
      {banner && (
        <div className={`px-3 py-2 rounded-lg text-sm ${banner.type === 'success' ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-danger/10 border border-danger/30 text-danger'}`}>
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
              <p className="text-sm font-medium text-text-primary">{connectionStatus.companyName || 'Connected'}</p>
              {connectionStatus.connectedAt && (
                <p className="text-xs text-text-secondary">Connected {new Date(connectionStatus.connectedAt).toLocaleDateString('en-ZA')}</p>
              )}
            </div>
          </div>
          <button onClick={handleDisconnect} disabled={disconnecting} className="px-3 py-1.5 text-sm border border-danger/40 text-danger rounded-lg hover:bg-danger/5 transition-colors disabled:opacity-50">
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-text-secondary">Link your Sage account to push receipts directly to transactions.</p>
          <button onClick={connect} className="flex-shrink-0 px-4 py-2 bg-primary text-black font-medium rounded-lg text-sm hover:bg-primary/90 transition-colors">Connect</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProfileSettings
// ---------------------------------------------------------------------------

function ProfileSettings() {
  const userId = useUserId();
  const { profile, loading } = useUserProfile();
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (profile?.displayName !== undefined) setDisplayName(profile.displayName);
  }, [profile]);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    try {
      await setDoc(doc(db, `users/${userId}`), { displayName, updatedAt: Timestamp.now() }, { merge: true });
      toast('Display name updated', 'success');
    } catch (err) {
      console.error(err);
      toast('Failed to update display name', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton height={80} className="w-full" />;

  return (
    <div className="p-4 bg-surface border border-border rounded-lg space-y-4">
      <div>
        <label className="block text-xs text-text-secondary mb-2">Display Name</label>
        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name"
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary text-sm" />
      </div>
      {profile?.email && (
        <div>
          <label className="block text-xs text-text-secondary mb-1">Email</label>
          <p className="text-sm text-text-secondary">{profile.email}</p>
        </div>
      )}
      {displayName !== (profile?.displayName ?? '') && (
        <button onClick={handleSave} disabled={saving || !displayName.trim()}
          className="w-full py-2 bg-primary text-black font-medium rounded-lg text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppearanceSettings
// ---------------------------------------------------------------------------

function AppearanceSettings() {
  const userId = useUserId();
  const { profile, loading } = useUserProfile();
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const currentTheme = profile?.preferences?.theme ?? 'dark';

  const handleThemeChange = async (theme: 'dark' | 'light') => {
    if (!userId) return;
    setSaving(true);
    try {
      await setDoc(doc(db, `users/${userId}`), { preferences: { ...profile?.preferences, theme }, updatedAt: Timestamp.now() }, { merge: true });
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(theme);
      localStorage.setItem('byte-theme', theme);
      toast(`${theme === 'dark' ? 'Dark' : 'Light'} theme applied`, 'success');
    } catch (err) {
      console.error(err);
      toast('Failed to update theme', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton height={80} className="w-full" />;

  return (
    <div className="p-4 bg-surface border border-border rounded-lg space-y-4">
      <div>
        <label className="block text-xs text-text-secondary mb-3">Theme</label>
        <div className="grid grid-cols-2 gap-3">
          {(['dark', 'light'] as const).map((t) => (
            <button key={t} onClick={() => handleThemeChange(t)} disabled={saving}
              className={`py-3 px-4 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 ${currentTheme === t ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:border-primary/50'}`}>
              {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotificationSettings
// ---------------------------------------------------------------------------

function NotificationSettings() {
  const userId = useUserId();
  const { profile, loading } = useUserProfile();
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const notificationsEnabled = profile?.preferences?.notificationsEnabled ?? false;

  const handleToggle = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await setDoc(doc(db, `users/${userId}`), { preferences: { ...profile?.preferences, notificationsEnabled: !notificationsEnabled }, updatedAt: Timestamp.now() }, { merge: true });
      toast(notificationsEnabled ? 'Notifications disabled' : 'Notifications enabled', 'success');
    } catch (err) {
      console.error(err);
      toast('Failed to update notification preferences', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton height={60} className="w-full" />;

  return (
    <div className="p-4 bg-surface border border-border rounded-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">Push Notifications</p>
          <p className="text-xs text-text-secondary mt-0.5">Receive alerts for due items and goal milestones</p>
        </div>
        <button onClick={handleToggle} disabled={saving} role="switch" aria-checked={notificationsEnabled}
          className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-50 ${notificationsEnabled ? 'bg-primary' : 'bg-border'}`}>
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${notificationsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VatConfig
// ---------------------------------------------------------------------------

function VatConfig() {
  const userId = useUserId();
  const { profile, loading } = useUserProfile();
  const [saving, setSaving] = useState(false);
  const [vatPercentage, setVatPercentage] = useState<number | null>(null);

  useEffect(() => {
    if (profile?.preferences?.vatPercentage !== undefined) setVatPercentage(profile.preferences.vatPercentage);
  }, [profile]);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    try {
      await setDoc(doc(db, `users/${userId}`), { preferences: { ...profile?.preferences, vatPercentage: vatPercentage ?? undefined }, updatedAt: Timestamp.now() }, { merge: true });
      toast('VAT updated', 'success');
    } finally {
      setSaving(false);
    }
  }

  const { toast } = useToast();
  if (loading) return <Skeleton height={80} className="w-full" />;

  return (
    <div className="p-4 bg-surface border border-border rounded-lg space-y-4">
      <div>
        <label className="block text-xs text-text-secondary mb-2">VAT Percentage</label>
        <div className="flex items-center gap-2">
          <input type="number" value={vatPercentage ?? ''} onChange={(e) => { const v = e.target.value; setVatPercentage(v === '' ? null : Math.min(30, Math.max(0, parseFloat(v) || 0))); }}
            placeholder="15" min={0} max={30} step="0.1"
            className="w-24 px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary text-sm" />
          <span className="text-sm text-text-secondary">%</span>
        </div>
        <p className="text-xs text-text-secondary mt-1">SA VAT is 15%. Leave empty to disable VAT calculation.</p>
      </div>
      {vatPercentage !== (profile?.preferences?.vatPercentage ?? null) && (
        <button onClick={handleSave} disabled={saving}
          className="w-full py-2 bg-primary text-black font-medium rounded-lg text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PaydaySettings
// ---------------------------------------------------------------------------

function PaydaySettings() {
  const userId = useUserId();
  const { profile, loading } = useUserProfile();
  const [saving, setSaving] = useState(false);
  const [payDayType, setPayDayType] = useState<'last_working_day' | 'fixed'>('last_working_day');
  const [payDayFixed, setPayDayFixed] = useState<number>(25);
  const { toast } = useToast();

  useEffect(() => {
    if (profile?.preferences?.payDayType) setPayDayType(profile.preferences.payDayType);
    if (profile?.preferences?.payDayFixed) setPayDayFixed(profile.preferences.payDayFixed);
  }, [profile]);

  const hasChanges =
    payDayType !== (profile?.preferences?.payDayType ?? 'last_working_day') ||
    (payDayType === 'fixed' && payDayFixed !== (profile?.preferences?.payDayFixed ?? 25));

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    try {
      // Use updateDoc (not setDoc) because deleteField() only works with updateDoc
      const updateData: Record<string, unknown> = {
        'preferences.payDayType': payDayType,
        updatedAt: Timestamp.now(),
      };

      if (payDayType === 'fixed') {
        updateData['preferences.payDayFixed'] = payDayFixed;
      } else {
        updateData['preferences.payDayFixed'] = deleteField();
      }

      await updateDoc(doc(db, `users/${userId}`), updateData);
      toast('Payday settings updated', 'success');
    } catch (err) {
      console.error(err);
      toast('Failed to update payday settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton height={120} className="w-full" />;

  // Preview calculation
  const now = new Date();
  const previewMonth = now.toLocaleDateString('en-ZA', { month: 'long' });

  return (
    <div className="p-4 bg-surface border border-border rounded-lg space-y-4">
      <div>
        <label className="block text-xs text-text-secondary mb-3">When do you get paid?</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setPayDayType('last_working_day')}
            className={`py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
              payDayType === 'last_working_day'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-text-secondary hover:border-primary/50'
            }`}
          >
            Last working day
          </button>
          <button
            onClick={() => setPayDayType('fixed')}
            className={`py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
              payDayType === 'fixed'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-text-secondary hover:border-primary/50'
            }`}
          >
            Fixed day
          </button>
        </div>
      </div>

      {payDayType === 'fixed' && (
        <div>
          <label className="block text-xs text-text-secondary mb-2">Day of month</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={payDayFixed}
              onChange={(e) => setPayDayFixed(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
              min={1}
              max={31}
              className="w-20 px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary text-sm"
            />
            <span className="text-sm text-text-secondary">of each month</span>
          </div>
        </div>
      )}

      <div className="p-3 bg-background rounded-lg">
        <p className="text-xs text-text-secondary">
          <strong className="text-text-primary">How it works:</strong> Your {previewMonth} budget starts when you receive your{' '}
          {new Date(now.getFullYear(), now.getMonth() - 1).toLocaleDateString('en-ZA', { month: 'long' })} paycheck and ends the day before your {previewMonth} paycheck.
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
// DataMaintenance
// ---------------------------------------------------------------------------

interface MisalignedItem {
  cycleItemId: string;
  label: string;
  currentCycleId: string;
  payments: Array<{
    id: string;
    amount: number;
    date: string;
    correctCycleId: string;
  }>;
}

interface DiagnosticResult {
  summary: {
    itemsChecked: number;
    paymentsChecked: number;
    misalignedCount: number;
    affectedItems: number;
  };
  misalignedItems: MisalignedItem[];
}

function DataMaintenance() {
  const [diagnosing, setDiagnosing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixingDates, setFixingDates] = useState(false);
  const [mergingDuplicates, setMergingDuplicates] = useState(false);
  const [fixingOrphanedReceipts, setFixingOrphanedReceipts] = useState(false);
  const [fixingTotals, setFixingTotals] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [fixResult, setFixResult] = useState<{ fixCount: number; message: string } | null>(null);
  const [datesFixResult, setDatesFixResult] = useState<{ fixedCount: number; totalCycles: number } | null>(null);
  const [mergeResult, setMergeResult] = useState<{ mergedCount: number; deletedCount: number; message: string } | null>(null);
  const [orphanedResult, setOrphanedResult] = useState<{ fixedCount: number; totalLinkedReceipts: number } | null>(null);
  const [totalsResult, setTotalsResult] = useState<{ fixedCount: number; totalItems: number } | null>(null);
  const { toast, confirm } = useToast();

  const runDiagnostic = async () => {
    setDiagnosing(true);
    setResult(null);
    setFixResult(null);
    try {
      const res = await fetch('/api/cycle-items/fix-misaligned-payments');
      if (!res.ok) throw new Error('Failed to run diagnostic');
      const data = await res.json();
      setResult(data);
      if (data.summary.misalignedCount === 0) {
        toast('No misaligned payments found', 'success');
      }
    } catch (err) {
      console.error(err);
      toast('Failed to run diagnostic', 'error');
    } finally {
      setDiagnosing(false);
    }
  };

  const applyFixes = () => {
    confirm(
      `This will move ${result?.summary.misalignedCount} payments to their correct cycles. This action cannot be undone.`,
      async () => {
        setFixing(true);
        try {
          const res = await fetch('/api/cycle-items/fix-misaligned-payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dryRun: false }),
          });
          if (!res.ok) throw new Error('Failed to apply fixes');
          const data = await res.json();
          setFixResult(data);
          setResult(null);
          toast(`Fixed ${data.fixCount} misaligned payments`, 'success');
        } catch (err) {
          console.error(err);
          toast('Failed to apply fixes', 'error');
        } finally {
          setFixing(false);
        }
      },
      { title: 'Fix Misaligned Payments', confirmLabel: 'Apply Fixes', danger: true }
    );
  };

  const fixCycleDates = () => {
    confirm(
      'This will recalculate all cycle date ranges based on your payday settings. Run this if cycles are overlapping.',
      async () => {
        setFixingDates(true);
        setDatesFixResult(null);
        try {
          const res = await fetch('/api/cycles/fix-dates', { method: 'POST' });
          if (!res.ok) throw new Error('Failed to fix cycle dates');
          const data = await res.json();
          setDatesFixResult(data);
          toast(`Fixed ${data.fixedCount} of ${data.totalCycles} cycles`, 'success');
        } catch (err) {
          console.error(err);
          toast('Failed to fix cycle dates', 'error');
        } finally {
          setFixingDates(false);
        }
      },
      { title: 'Fix Cycle Dates', confirmLabel: 'Fix Dates' }
    );
  };

  const mergeDuplicates = () => {
    confirm(
      'This will merge duplicate cycle items (same commitment in same cycle) into single items with all payments combined.',
      async () => {
        setMergingDuplicates(true);
        setMergeResult(null);
        try {
          const res = await fetch('/api/cycle-items/fix-misaligned-payments?dryRun=false', { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to merge duplicates');
          const data = await res.json();
          setMergeResult(data);
          if (data.mergedCount > 0) {
            toast(`Merged ${data.mergedCount} groups, deleted ${data.deletedCount} duplicates`, 'success');
          } else {
            toast('No duplicate items found', 'success');
          }
        } catch (err) {
          console.error(err);
          toast('Failed to merge duplicates', 'error');
        } finally {
          setMergingDuplicates(false);
        }
      },
      { title: 'Merge Duplicate Items', confirmLabel: 'Merge' }
    );
  };

  const fixOrphanedReceipts = () => {
    confirm(
      'This will find receipts linked to payments that no longer exist and unlink them so they appear in the receipt picker.',
      async () => {
        setFixingOrphanedReceipts(true);
        setOrphanedResult(null);
        try {
          const res = await fetch('/api/receipts/fix-orphaned', { method: 'POST' });
          if (!res.ok) throw new Error('Failed to fix orphaned receipts');
          const data = await res.json();
          setOrphanedResult(data);
          if (data.fixedCount > 0) {
            toast(`Fixed ${data.fixedCount} orphaned receipts`, 'success');
          } else {
            toast('No orphaned receipts found', 'success');
          }
        } catch (err) {
          console.error(err);
          toast('Failed to fix orphaned receipts', 'error');
        } finally {
          setFixingOrphanedReceipts(false);
        }
      },
      { title: 'Fix Orphaned Receipts', confirmLabel: 'Fix Receipts' }
    );
  };

  const fixItemTotals = () => {
    confirm(
      'This will recalculate totalPaidAmount for all cycle items based on actual payments. Fixes items showing incorrect totals.',
      async () => {
        setFixingTotals(true);
        setTotalsResult(null);
        try {
          const res = await fetch('/api/cycle-items/fix-totals', { method: 'POST' });
          if (!res.ok) throw new Error('Failed to fix item totals');
          const data = await res.json();
          setTotalsResult(data);
          if (data.fixedCount > 0) {
            toast(`Fixed ${data.fixedCount} item totals`, 'success');
          } else {
            toast('All item totals are correct', 'success');
          }
        } catch (err) {
          console.error(err);
          toast('Failed to fix item totals', 'error');
        } finally {
          setFixingTotals(false);
        }
      },
      { title: 'Fix Item Totals', confirmLabel: 'Fix Totals' }
    );
  };

  const formatAmount = (cents: number) => `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-4 bg-surface border border-border rounded-lg space-y-6">
      {/* Cycle Dates Fix */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">Cycle Date Ranges</p>
          <p className="text-xs text-text-secondary mt-0.5">Fix overlapping cycle dates based on your payday settings</p>
        </div>
        <button
          onClick={fixCycleDates}
          disabled={fixingDates}
          className="px-4 py-2 bg-primary text-black font-medium rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {fixingDates ? 'Fixing...' : 'Fix Dates'}
        </button>
      </div>

      {datesFixResult && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-sm text-green-400">
            Fixed {datesFixResult.fixedCount} of {datesFixResult.totalCycles} cycles
          </p>
        </div>
      )}

      <hr className="border-border" />

      {/* Merge Duplicates */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">Merge Duplicate Items</p>
          <p className="text-xs text-text-secondary mt-0.5">Combine duplicate cycle items (same commitment) into one</p>
        </div>
        <button
          onClick={mergeDuplicates}
          disabled={mergingDuplicates}
          className="px-4 py-2 bg-primary text-black font-medium rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {mergingDuplicates ? 'Merging...' : 'Merge Duplicates'}
        </button>
      </div>

      {mergeResult && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-sm text-green-400">{mergeResult.message}</p>
        </div>
      )}

      <hr className="border-border" />

      {/* Fix Orphaned Receipts */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">Orphaned Receipts</p>
          <p className="text-xs text-text-secondary mt-0.5">Unlink receipts from deleted payments so they can be reused</p>
        </div>
        <button
          onClick={fixOrphanedReceipts}
          disabled={fixingOrphanedReceipts}
          className="px-4 py-2 bg-primary text-black font-medium rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {fixingOrphanedReceipts ? 'Fixing...' : 'Fix Receipts'}
        </button>
      </div>

      {orphanedResult && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-sm text-green-400">
            Fixed {orphanedResult.fixedCount} of {orphanedResult.totalLinkedReceipts} linked receipts
          </p>
        </div>
      )}

      <hr className="border-border" />

      {/* Fix Item Totals */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">Item Totals</p>
          <p className="text-xs text-text-secondary mt-0.5">Recalculate totals from actual payments</p>
        </div>
        <button
          onClick={fixItemTotals}
          disabled={fixingTotals}
          className="px-4 py-2 bg-primary text-black font-medium rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {fixingTotals ? 'Fixing...' : 'Fix Totals'}
        </button>
      </div>

      {totalsResult && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-sm text-green-400">
            Fixed {totalsResult.fixedCount} of {totalsResult.totalItems} items
          </p>
        </div>
      )}

      <hr className="border-border" />

      {/* Payment Alignment */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">Payment Alignment</p>
          <p className="text-xs text-text-secondary mt-0.5">Find and fix payments dated outside their cycle&apos;s range</p>
        </div>
        <button
          onClick={runDiagnostic}
          disabled={diagnosing}
          className="px-4 py-2 bg-primary text-black font-medium rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {diagnosing ? 'Scanning...' : 'Run Diagnostic'}
        </button>
      </div>

      {result && result.summary.misalignedCount > 0 && (
        <div className="space-y-3">
          <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg">
            <p className="text-sm text-warning">
              Found {result.summary.misalignedCount} misaligned payments across {result.summary.affectedItems} items
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {result.misalignedItems.map((item) => (
              <div key={item.cycleItemId} className="p-3 bg-background rounded-lg">
                <p className="text-sm font-medium text-text-primary">{item.label}</p>
                <p className="text-xs text-text-secondary">Currently in: {item.currentCycleId}</p>
                <div className="mt-2 space-y-1">
                  {item.payments.map((p) => (
                    <div key={p.id} className="flex justify-between text-xs">
                      <span className="text-text-secondary">
                        {new Date(p.date).toLocaleDateString('en-ZA')} → {p.correctCycleId}
                      </span>
                      <span className="text-text-primary">{formatAmount(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={applyFixes}
            disabled={fixing}
            className="w-full py-2 bg-warning text-black font-medium rounded-lg text-sm hover:bg-warning/90 transition-colors disabled:opacity-50"
          >
            {fixing ? 'Applying Fixes...' : 'Fix All Misaligned Payments'}
          </button>
        </div>
      )}

      {fixResult && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-sm text-green-400">{fixResult.message}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExportData
// ---------------------------------------------------------------------------

function ExportData() {
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null);
  const { toast } = useToast();

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
      toast('Export failed. Please try again.', 'error');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="p-4 bg-surface border border-border rounded-lg space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {(['json', 'csv'] as const).map((fmt) => (
          <button key={fmt} onClick={() => handleExport(fmt)} disabled={exporting !== null}
            className="py-3 px-4 bg-background border border-border rounded-lg hover:border-primary transition-colors disabled:opacity-50">
            <p className="text-sm font-medium text-text-primary">{exporting === fmt ? 'Exporting...' : `Export ${fmt.toUpperCase()}`}</p>
            <p className="text-xs text-text-secondary mt-0.5">{fmt === 'json' ? 'Complete backup' : 'Spreadsheet format'}</p>
          </button>
        ))}
      </div>
      <p className="text-xs text-text-secondary">JSON includes all data. CSV contains cycle items only.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
      </div>

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Profile</h2>
          <p className="text-sm text-text-secondary mt-1">Your account display name.</p>
        </div>
        <ProfileSettings />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Payday</h2>
          <p className="text-sm text-text-secondary mt-1">Configure when you get paid to align your budget cycles.</p>
        </div>
        <PaydaySettings />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Appearance</h2>
          <p className="text-sm text-text-secondary mt-1">Choose your preferred colour scheme.</p>
        </div>
        <AppearanceSettings />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Notifications</h2>
        </div>
        <NotificationSettings />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Sage Business Cloud</h2>
          <p className="text-sm text-text-secondary mt-1">Connect your Sage account to match and push receipts to transactions.</p>
        </div>
        <SageConnection />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">VAT</h2>
          <p className="text-sm text-text-secondary mt-1">Set VAT percentage for business income.</p>
        </div>
        <VatConfig />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Manage</h2>
        </div>
        <div className="space-y-2">
          <Link href="/settings/vendor-rules" className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg hover:bg-background transition-colors">
            <div>
              <p className="text-sm font-medium text-text-primary">Vendor Rules</p>
              <p className="text-xs text-text-secondary">Auto-categorize receipts by vendor</p>
            </div>
            <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </Link>
          <Link href="/plan" className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg hover:bg-background transition-colors">
            <div>
              <p className="text-sm font-medium text-text-primary">Commitments</p>
              <p className="text-xs text-text-secondary">Manage recurring monthly expenses</p>
            </div>
            <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </Link>
          <Link href="/goals" className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg hover:bg-background transition-colors">
            <div>
              <p className="text-sm font-medium text-text-primary">Goals</p>
              <p className="text-xs text-text-secondary">Manage savings and investment goals</p>
            </div>
            <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </Link>
          <Link href="/history" className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg hover:bg-background transition-colors">
            <div>
              <p className="text-sm font-medium text-text-primary">History</p>
              <p className="text-xs text-text-secondary">View past cycles and spending</p>
            </div>
            <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </Link>
          <Link href="/insights" className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg hover:bg-background transition-colors">
            <div>
              <p className="text-sm font-medium text-text-primary">Insights</p>
              <p className="text-xs text-text-secondary">AI-powered spending analysis</p>
            </div>
            <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </Link>
          <Link href="/review" className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg hover:bg-background transition-colors">
            <div>
              <p className="text-sm font-medium text-text-primary">Year Review</p>
              <p className="text-xs text-text-secondary">Annual financial summary</p>
            </div>
            <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Data Maintenance</h2>
          <p className="text-sm text-text-secondary mt-1">Diagnose and fix data alignment issues.</p>
        </div>
        <DataMaintenance />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Export Data</h2>
          <p className="text-sm text-text-secondary mt-1">Download your financial data for backup or analysis.</p>
        </div>
        <ExportData />
      </section>
    </div>
  );
}
