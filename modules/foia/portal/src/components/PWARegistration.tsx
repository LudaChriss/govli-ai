'use client';

/**
 * PWA Registration Component
 * Handles service worker registration and install prompt (v2.0)
 */

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWARegistration() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[PWA] Service worker registered:', registration);

          // Check for updates periodically
          setInterval(() => {
            registration.update();
          }, 60000); // Check every minute
        })
        .catch((error) => {
          console.error('[PWA] Service worker registration failed:', error);
        });
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Check visit count to show install prompt on 2nd visit
      const visitCount = parseInt(localStorage.getItem('pwa_visit_count') || '0', 10);
      localStorage.setItem('pwa_visit_count', String(visitCount + 1));

      if (visitCount >= 1) {
        // Show install prompt after 3 seconds on 2nd+ visit
        setTimeout(() => {
          setShowInstallPrompt(true);
        }, 3000);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed successfully');
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] User choice:', outcome);

    // Clear the deferred prompt
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
    // Don't show again for 7 days
    const hideUntil = Date.now() + (7 * 24 * 60 * 60 * 1000);
    localStorage.setItem('pwa_install_hide_until', String(hideUntil));
  };

  // Check if we should show the prompt
  useEffect(() => {
    const hideUntil = parseInt(localStorage.getItem('pwa_install_hide_until') || '0', 10);
    if (Date.now() < hideUntil) {
      setShowInstallPrompt(false);
    }
  }, []);

  if (!showInstallPrompt) return null;

  return (
    <div className="fixed bottom-4 right-4 max-w-sm bg-white rounded-lg shadow-2xl p-6 border-2 border-brand-teal z-50 animate-fade-in">
      <div className="flex items-start mb-4">
        <div className="flex-shrink-0">
          <svg className="h-8 w-8 text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-lg font-semibold text-gray-900">
            Install FOIA Portal
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Add to your home screen for quick access and offline support
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600"
          aria-label="Dismiss"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleInstallClick}
          className="btn btn-primary flex-1"
        >
          Install App
        </button>
        <button
          onClick={handleDismiss}
          className="btn btn-outline flex-1"
        >
          Not Now
        </button>
      </div>
    </div>
  );
}
