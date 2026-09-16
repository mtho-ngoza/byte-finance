'use client';

import { SessionProvider } from 'next-auth/react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#0a0a0a' }}
      >
        {children}
      </div>
    </SessionProvider>
  );
}
