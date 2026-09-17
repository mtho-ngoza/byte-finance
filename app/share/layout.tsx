import type { Metadata } from 'next';
import { ShareProviders } from './providers';

export const metadata: Metadata = {
  title: 'Shared Event - Byte Finance',
  description: 'View and contribute to a shared event budget',
};

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ShareProviders>
      <div className="min-h-screen bg-background">
        {/* Minimal header for shared view */}
        <header className="sticky top-0 z-40 bg-surface border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-primary">Byte</span>
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Shared View</span>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-2xl mx-auto px-4 py-4">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-border py-4 mt-8">
          <p className="text-center text-xs text-text-secondary">
            Shared via Byte Finance
          </p>
        </footer>
      </div>
    </ShareProviders>
  );
}
