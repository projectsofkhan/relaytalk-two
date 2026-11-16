// utils/offline-guard.js
(function () {
  'use strict';
  if (window.__relayOfflineGuardInstalled) return;
  window.__relayOfflineGuardInstalled = true;

  var OVERLAY_ID = 'relayOfflineOverlay';
  var PING_INTERVAL_MS = 5000;
  var HOME_URL = window.location.origin;
  var PING_URL = HOME_URL + '/manifest.json'; // FIXED: Pings current domain

  var overlayEl = null;
  var pingTimer = null;
  var checkInFlight = false;
  var wasOffline = false;

  function buildOverlay() {
    var el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:sans-serif;opacity:0;transition:opacity 0.3s;';
    el.innerHTML = `
      <div style="background:#e7f3fe;width:88px;height:88px;border-radius:24px;display:flex;align-items:center;justify-content:center;margin-bottom:20px;">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#0B84F3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
      </div>
      <h2 style="font-size:1.4rem;color:#09090b;margin-bottom:8px;">No Internet Connection</h2>
      <p style="color:#52525b;font-size:0.95rem;margin-bottom:24px;">Check your Wi-Fi or mobile data and try again.</p>
      <button id="rgRetryBtn" style="background:#0B84F3;color:#fff;border:none;padding:12px 32px;border-radius:30px;font-size:1rem;font-weight:600;cursor:pointer;">Retry</button>
      <div id="rgStatus" style="font-size:0.85rem;color:#a1a1aa;margin-top:12px;min-height:18px;"></div>
    `;
    document.body.appendChild(el);
    
    var btn = document.getElementById('rgRetryBtn');
    var status = document.getElementById('rgStatus');

    btn.addEventListener('click', async function () {
      status.textContent = 'Checking...';
      btn.disabled = true;
      var ok = await ping();
      if (ok) {
        status.textContent = 'Connected! Reloading...';
        setTimeout(function () { window.location.reload(); }, 500);
      } else {
        status.textContent = 'Still offline. Check connection.';
        btn.disabled = false;
      }
    });
    return el;
  }

  function showOverlay() {
    if (overlayEl) return;
    overlayEl = buildOverlay();
    void overlayEl.offsetWidth;
    overlayEl.style.opacity = '1';
    document.documentElement.style.overflow = 'hidden';
  }

  function hideOverlay() {
    if (!overlayEl) return;
    var el = overlayEl;
    overlayEl = null;
    el.style.opacity = '0';
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    document.documentElement.style.overflow = '';
  }

  async function ping() {
    if (checkInFlight) return null;
    checkInFlight = true;
    try {
      var res = await fetch(PING_URL + '?t=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
      return res.ok || res.status < 500;
    } catch (e) {
      return false;
    } finally {
      checkInFlight = false;
    }
  }

  async function evaluate() {
    if (navigator.onLine === false) {
      if (!wasOffline) { wasOffline = true; showOverlay(); }
      return;
    }
    var ok = await ping();
    if (ok === null) return;
    if (!ok) {
      if (!wasOffline) { wasOffline = true; showOverlay(); }
    } else {
      if (wasOffline) { wasOffline = false; hideOverlay(); }
    }
  }

  window.addEventListener('online', evaluate);
  window.addEventListener('offline', function () { wasOffline = true; showOverlay(); });

  evaluate();
  pingTimer = setInterval(evaluate, PING_INTERVAL_MS);
})();