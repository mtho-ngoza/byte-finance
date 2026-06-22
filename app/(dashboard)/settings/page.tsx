'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
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
          <h2 className="text-base font-semibold text-text-primary">Export Data</h2>
          <p className="text-sm text-text-secondary mt-1">Download your financial data for backup or analysis.</p>
        </div>
        <ExportData />
      </section>
    </div>
  );
}
