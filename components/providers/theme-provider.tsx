'use client';

import { useEffect } from 'react';
import { useUserProfile } from '@/hooks/use-user-profile';

const THEME_KEY = 'byte-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUserProfile();

  // On mount: apply cached theme from localStorage (prevents flash)
  useEffect(() => {
    const cached = localStorage.getItem(THEME_KEY);
    if (cached === 'light' || cached === 'dark') {
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(cached);
    }
  }, []);

  // When profile loads: sync theme from Firestore and update cache
  useEffect(() => {
    if (loading || !profile) return;
    const theme = profile.preferences?.theme;
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(theme);
      localStorage.setItem(THEME_KEY, theme);
    }
  }, [profile, loading]);

  return <>{children}</>;
}
