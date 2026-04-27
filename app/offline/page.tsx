'use client';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">📡</div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          You&apos;re Offline
        </h1>
        <p className="text-text-secondary mb-6">
          ByteFinance needs an internet connection to sync your financial data.
          Please check your connection and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-accent-primary text-background font-medium rounded-lg hover:bg-accent-primary/90 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
