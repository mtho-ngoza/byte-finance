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
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom duration-300">
      <div className="bg-surface-primary border border-border-primary rounded-xl p-4 shadow-lg max-w-md mx-auto">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-accent-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">💰</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-text-primary">Install ByteFinance</h3>
            {isIOS ? (
              <p className="text-sm text-text-secondary mt-1">
                Tap <span className="inline-flex items-center"><svg className="w-4 h-4 mx-1" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L12 14M12 2L8 6M12 2L16 6M4 14V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V14"/></svg></span> then &quot;Add to Home Screen&quot;
              </p>
            ) : (
              <p className="text-sm text-text-secondary mt-1">
                Add to your home screen for quick access
              </p>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="text-text-secondary hover:text-text-primary p-1"
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!isIOS && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleDismiss}
              className="flex-1 px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Not now
            </button>
            <button
              onClick={handleInstall}
              className="flex-1 px-4 py-2 text-sm bg-accent-primary text-background font-medium rounded-lg hover:bg-accent-primary/90 transition-colors"
            >
              Install
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
