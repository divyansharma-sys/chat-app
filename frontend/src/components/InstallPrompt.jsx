import React, { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';

const InstallPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    // Check if running in a native app (Capacitor)
    const isNative = window.Capacitor?.isNativePlatform?.();
    
    // Check if running as PWA (standalone)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator?.standalone;
    
    // Check if mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Don't show if already installed or native
    if (isNative || isStandalone) {
      return;
    }

    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      if (isMobile) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If on mobile and hasn't dismissed before, show prompt after 3s even if PWA event didn't fire
    // This allows downloading the APK as fallback
    if (isMobile) {
      const hasDismissed = localStorage.getItem('installPromptDismissed');
      if (!hasDismissed) {
        const timer = setTimeout(() => {
          setShowPrompt(true);
        }, 3000);
        return () => {
          clearTimeout(timer);
          window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      // Show the install prompt for PWA
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } else {
      // Fallback: direct download link from GitHub Releases
      const downloadUrl = 'https://github.com/divyansharma-sys/chat-app/releases/download/latest/app-debug.apk';
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'app-debug.apk';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('installPromptDismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'calc(100% - 32px)',
      maxWidth: '400px',
      backgroundColor: 'var(--bg-surface, #1e1e2d)',
      color: 'var(--text-primary, #ffffff)',
      padding: '16px',
      borderRadius: '16px',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(10px)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: 'var(--color-primary, #6366f1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Download size={24} color="white" />
          </div>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '600' }}>Get the App</h3>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #a0a0b0)', lineHeight: '1.4' }}>
              Install our mobile app for a faster and richer experience.
            </p>
          </div>
        </div>
        <button 
          onClick={handleDismiss}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'var(--text-secondary, #a0a0b0)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%'
          }}
        >
          <X size={20} />
        </button>
      </div>
      
      <button 
        onClick={handleInstall}
        style={{
          backgroundColor: 'var(--color-primary, #6366f1)',
          color: 'white',
          border: 'none',
          padding: '12px 16px',
          borderRadius: '10px',
          fontSize: '15px',
          fontWeight: '600',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          width: '100%',
          transition: 'all 0.2s ease'
        }}
      >
        {deferredPrompt ? 'Add to Home Screen' : 'Download APK'}
      </button>
    </div>
  );
};

export default InstallPrompt;
