// utils/offline-detector.js
// When offline: redirect to the bundled offline page.

(function () {
  'use strict';

  const isNative = !!(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );

  const OFFLINE_URL = isNative ? '/offline.html' : '/offline/';

  function currentUrl() {
    try { return window.location.href; }
    catch (e) { return 'https://relaytalk.vercel.app'; }
  }

  function isOfflinePage() {
    const p = window.location.pathname || '';
    return p.endsWith('offline.html') || p.startsWith('/offline');
  }

  function goOffline() {
    if (isOfflinePage()) return;
    try { sessionStorage.setItem('relay:returnTo', currentUrl()); } catch (e) {}
    console.log('[offline] Redirecting to:', OFFLINE_URL);
    window.location.replace(OFFLINE_URL);
  }

  function cameBackOnline() {
    if (!isOfflinePage()) return;
    let back = 'https://relaytalk.vercel.app';
    try {
      back = sessionStorage.getItem('relay:returnTo') || back;
      sessionStorage.removeItem('relay:returnTo');
    } catch (e) {}
    console.log('[offline] Back online, returning to:', back);
    window.location.replace(back);
  }

  window.addEventListener('offline', goOffline);
  window.addEventListener('online', cameBackOnline);

  if (!navigator.onLine) {
    goOffline();
  }
})();