'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    if (isIOSDevice && !isStandalone) {
      // Check if we've shown this recently
      const lastShown = localStorage.getItem('pwa-ios-prompt-shown');
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      if (!lastShown || parseInt(lastShown) < dayAgo) {
        setIsIOS(true);
        setShowPrompt(true);
      }
    }

    // Listen for the beforeinstallprompt event (Chrome, Edge, etc.)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if already installed
    window.addEventListener('appinstalled', () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    if (isIOS) {
      localStorage.setItem('pwa-ios-prompt-shown', Date.now().toString());
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-sm">
      <div className="bg-surface border border-border rounded-xl p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-xl">💰</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-text-primary text-sm">Install ByteFinance</h3>
            {isIOS ? (
              <p className="text-xs text-text-secondary mt-1">
                Tap the share icon then &quot;Add to Home Screen&quot;
              </p>
            ) : (
              <p className="text-xs text-text-secondary mt-1">
                Add to your home screen for quick access
              </p>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="text-text-secondary hover:text-text-primary p-1 shrink-0"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!isIOS && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleDismiss}
              className="flex-1 px-3 py-2 text-xs text-text-secondary hover:text-text-primary border border-border rounded-lg transition-colors"
            >
              Not now
            </button>
            <button
              onClick={handleInstall}
              className="flex-1 px-3 py-2 text-xs bg-primary text-background font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Install
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
