'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { SyncIndicator } from './sync-indicator';

export function Header() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const initials = session?.user?.name
    ? session.user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-surface shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="text-primary font-bold text-lg leading-none">₿</span>
        <span className="font-semibold text-text-primary text-sm tracking-tight">ByteFinance</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <SyncIndicator />

        {/* Profile menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="h-8 w-8 rounded-full bg-primary/20 text-primary text-xs font-semibold flex items-center justify-center hover:bg-primary/30 transition-colors"
            aria-label="Profile menu"
            aria-expanded={menuOpen}
          >
            {initials}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-10 w-56 rounded-lg border border-border bg-surface shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium text-text-primary truncate">
                  {session?.user?.name ?? 'User'}
                </p>
                <p className="text-xs text-text-secondary truncate">
                  {session?.user?.email ?? ''}
                </p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
