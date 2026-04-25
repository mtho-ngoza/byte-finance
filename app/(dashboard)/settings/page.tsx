'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from '@/hooks/use-user-id';
import { useUserProfile } from '@/hooks/use-user-profile';
import { Skeleton } from '@/components/shared/skeleton';
import type { UserProfile } from '@/types/index';

// ---------------------------------------------------------------------------
// Pay Day Config Component
// ---------------------------------------------------------------------------

function PayDayConfig() {
  const userId = useUserId();
  const { profile, loading } = useUserProfile();
  const [saving, setSaving] = useState(false);
  const [payDayType, setPayDayType] = useState<'fixed' | 'last_working_day'>('last_working_day');
  const [payDayFixed, setPayDayFixed] = useState<number>(25);

  // Sync state when profile loads
  useEffect(() => {
    if (profile?.preferences) {
      setPayDayType(profile.preferences.payDayType);
      setPayDayFixed(profile.preferences.payDayFixed ?? 25);
    }
  }, [profile]);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    try {
      const ref = doc(db, `users/${userId}`);
      const updates: Partial<UserProfile> = {
        preferences: {
          payDayType,
          payDayFixed: payDayType === 'fixed' ? payDayFixed : undefined,
          currency: profile?.preferences?.currency ?? 'ZAR',
          theme: profile?.preferences?.theme ?? 'dark',
          notificationsEnabled: profile?.preferences?.notificationsEnabled ?? true,
        },
        updatedAt: Timestamp.now(),
      };

      if (!profile) {
        // Create profile if doesn't exist
        await setDoc(ref, {
          id: userId,
          email: '',
          displayName: 'User',
          createdAt: Timestamp.now(),
          ...updates,
        });
      } else {
        await setDoc(ref, updates, { merge: true });
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Skeleton height={120} className="w-full" />;
  }

  const hasChanges =
    payDayType !== (profile?.preferences?.payDayType ?? 'last_working_day') ||
    (payDayType === 'fixed' && payDayFixed !== (profile?.preferences?.payDayFixed ?? 25));

  return (
    <div className="p-4 bg-surface border border-border rounded-lg space-y-4">
      <div>
        <label className="block text-xs text-text-secondary mb-2">Pay Day Type</label>
        <div className="flex gap-2">
          <button
            onClick={() => setPayDayType('last_working_day')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              payDayType === 'last_working_day'
                ? 'bg-primary text-black'
                : 'bg-background border border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            Last Working Day
          </button>
          <button
            onClick={() => setPayDayType('fixed')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              payDayType === 'fixed'
                ? 'bg-primary text-black'
                : 'bg-background border border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            Fixed Day
          </button>
        </div>
      </div>

      {payDayType === 'fixed' && (
        <div>
          <label className="block text-xs text-text-secondary mb-1">Day of Month</label>
          <input
            type="number"
            value={payDayFixed}
            onChange={(e) => setPayDayFixed(Math.min(28, Math.max(1, parseInt(e.target.value) || 1)))}
            min={1}
            max={28}
            className="w-24 px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary text-sm"
          />
          <p className="text-xs text-text-secondary mt-1">Max 28 to work for all months</p>
        </div>
      )}

      {payDayType === 'last_working_day' && (
        <p className="text-xs text-text-secondary">
          Automatically calculates the last weekday of each month, avoiding SA public holidays.
        </p>
      )}

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
// Main Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-8">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
      </div>

      {/* Pay Day Config */}
      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Pay Day</h2>
          <p className="text-sm text-text-secondary mt-1">
            Configure when you get paid each month. This determines cycle boundaries.
          </p>
        </div>
        <PayDayConfig />
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
    </div>
  );
}
