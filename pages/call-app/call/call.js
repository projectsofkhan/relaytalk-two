// pages/call-app/call/call.js — call screen (JaaS iframe)
// Runs standalone (opened via window.open from callHub).
// Session read from shared Supabase client.

import { initializeSupabase } from '../utils/supabase.js';
import { getRelayTalkUser, syncUserToDatabase } from '../utils/userSync.js';

const JAAS_APP_ID = 'vpaas-magic-cookie-16664d50d3a04e79a2876de86dcc38e4';
const JAAS_DOMAIN = '8x8.vc';
const DEFAULT_RETURN = '/home/#/friends';

let supabase;
let currentUser;
let currentCall;
let jitsiIframe;
let pendingIncoming = null;

const TAB_ID = Math.random().toString(36).substring(7);
const CALL_TABS_KEY = 'call_app_active_tabs';

window.__callPageActive = true;

// ─────────────────────────────────────────────────────────
// Return URL
// ─────────────────────────────────────────────────────────
function getReturnUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('returnTo');
    if (fromQuery) return fromQuery;
    const fromStorage = sessionStorage.getItem('callReturnTo');
    if (fromStorage) return fromStorage;
  } catch (e) {}
  return DEFAULT_RETURN;
}

function registerTab() {
  try {
    const tabs = JSON.parse(sessionStorage.getItem(CALL_TABS_KEY) || '{}');
    const callId = new URLSearchParams(window.location.search).get('callId') || 'new-call';
    if (tabs[callId] && tabs[callId] !== TAB_ID) {
      alert('Call is already open in another tab.');
      window.location.href = getReturnUrl();
      return false;
    }
    tabs[callId] = TAB_ID;
    sessionStorage.setItem(CALL_TABS_KEY, JSON.stringify(tabs));
    return true;
  } catch (e) { return true; }
}

function unregisterTab() {
  try {
    const tabs = JSON.parse(sessionStorage.getItem(CALL_TABS_KEY) || '{}');
    const callId = new URLSearchParams(window.location.search).get('callId') || 'new-call';
    delete tabs[callId];
    sessionStorage.setItem(CALL_TABS_KEY, JSON.stringify(tabs));
  } catch (e) {}
}

async function fetchCallerProfile(callerId) {
  if (!callerId || !supabase) return null;
  try {
    const { data } = await supabase
      .from('profiles').select('id, username, full_name, avatar_url')
      .eq('id', callerId).maybeSingle();
    return data;
  } catch (e) { return null; }
}

// ─────────────────────────────────────────────────────────
// Global handlers (used by HTML buttons)
// ─────────────────────────────────────────────────────────
window.goBack = function () {
  window.location.href = window.__callReturnUrl || getReturnUrl();
};

window.hangUp = async function () {
  endCall(false);
};

window.endCall = async function (silent = false) {
  if (currentCall && supabase && !silent) {
    try {
      await supabase.from('calls')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', currentCall.id);
    } catch (e) {}
  }
  unregisterTab();
  window.location.href = window.__callReturnUrl || getReturnUrl();
};

// ─────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────
async function initCall() {
  window.__callReturnUrl = getReturnUrl();
  if (!registerTab()) return;

  try {
    const relayUser = await getRelayTalkUser();
    if (!relayUser) {
      showError('Please login to RelayTalk first');
      return;
    }

    supabase = await initializeSupabase();
    currentUser = await syncUserToDatabase(supabase, relayUser);

    const params = new URLSearchParams(window.location.search);
    const friendId = params.get('friendId');
    const friendName = params.get('friendName');
    const incoming = params.get('incoming');
    const roomName = params.get('room');
    const callerId = params.get('callerId');
    const callId = params.get('callId');
    const callerName = params.get('callerName');
    const callerAvatar = params.get('callerAvatar');

    window.addEventListener('storage', (e) => {
      if (e.key !== CALL_TABS_KEY) return;
      const tabs = JSON.parse(e.newValue || '{}');
      const myCallId = new URLSearchParams(window.location.search).get('callId') || 'new-call';
      if (tabs[myCallId] && tabs[myCallId] !== TAB_ID) endCall(true);
    });

    window.addEventListener('beforeunload', () => {
      window.__callPageActive = false;
      unregisterTab();
    });

    if (incoming === 'true' && roomName && callId) {
      pendingIncoming = { callId, room: roomName, callerId, callerName, callerAvatar };
      document.getElementById('loadingScreen').style.display = 'none';
      showInAppIncomingScreen({
        callId, room: roomName, callerId,
        callerName: callerName || '',
        callerAvatar: callerAvatar || ''
      });
      if ((!callerName || !callerName.trim()) && callerId) {
        fetchCallerProfile(callerId).then((p) => {
          if (!p) return;
          pendingIncoming.callerName = p.full_name || p.username || 'Incoming Call';
          pendingIncoming.callerAvatar = p.avatar_url || '';
          updateIncomingScreenProfile(p);
        });
      }
    } else if (friendId) {
      await startOutgoingCall(friendId, friendName);
    } else {
      document.getElementById('loadingText').textContent = 'Ready';
      setTimeout(() => {
        const ls = document.getElementById('loadingScreen');
        if (ls) ls.style.display = 'none';
      }, 400);
    }
  } catch (err) {
    console.error('[call] init error:', err);
    showError('Failed to initialize call');
  }
}

// ─────────────────────────────────────────────────────────
// Incoming UI (created dynamically, azure-styled)
// ─────────────────────────────────────────────────────────
function showInAppIncomingScreen(info) {
  const prev = document.getElementById('relayIncomingOverlay');
  if (prev) prev.remove();

  const overlay = document.createElement('div');
  overlay.id = 'relayIncomingOverlay';
  overlay.className = 'relay-incoming-overlay';

  const name = info.callerName && info.callerName.trim() && info.callerName !== 'Someone'
    ? info.callerName : 'Incoming Call';
  const initial = name.charAt(0).toUpperCase();

  const avatarHtml = info.callerAvatar
    ? `<img src="${info.callerAvatar}" alt="" class="ri-avatar-img">`
    : `<div class="ri-avatar-initial">${initial}</div>`;

  overlay.innerHTML = `
    <div class="ri-content">
      <div id="riAvatarWrap" class="ri-avatar-wrap">${avatarHtml}</div>
      <h2 id="riName" class="ri-name">${name}</h2>
      <p class="ri-sub">Incoming call · RelayTalk</p>
      <div class="ri-actions">
        <button class="ri-btn ri-decline" id="relayDeclineBtn" aria-label="Decline">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8 10a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.574 2.81.7A2 2 0 0 1 22 16.92z"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
        </button>
        <button class="ri-btn ri-accept" id="relayAcceptBtn" aria-label="Accept">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8 10a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.574 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('relayAcceptBtn').onclick = handleIncomingAccept;
  document.getElementById('relayDeclineBtn').onclick = handleIncomingDecline;

  // Ringtone
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const beep = () => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 480;
        gain.gain.value = 0.0001;
        osc.connect(gain); gain.connect(ctx.destination);
        const t = ctx.currentTime;
        gain.gain.exponentialRampToValueAtTime(0.15, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        osc.start(t); osc.stop(t + 0.6);
      };
      beep();
      overlay.__ringTimer = setInterval(beep, 1400);
      overlay.__ringCtx = ctx;
    }
  } catch (e) {}
}

function updateIncomingScreenProfile(profile) {
  const nameEl = document.getElementById('riName');
  const wrapEl = document.getElementById('riAvatarWrap');
  if (!nameEl || !wrapEl || !profile) return;
  const name = profile.full_name || profile.username || 'Incoming Call';
  nameEl.textContent = name;
  if (profile.avatar_url) {
    wrapEl.innerHTML = `<img src="${profile.avatar_url}" alt="" class="ri-avatar-img">`;
  } else {
    wrapEl.innerHTML = `<div class="ri-avatar-initial">${name.charAt(0).toUpperCase()}</div>`;
  }
}

function stopInAppRinging() {
  const o = document.getElementById('relayIncomingOverlay');
  if (!o) return;
  if (o.__ringTimer) clearInterval(o.__ringTimer);
  if (o.__ringCtx) try { o.__ringCtx.close(); } catch (e) {}
}

function hideInAppIncomingScreen() {
  stopInAppRinging();
  const o = document.getElementById('relayIncomingOverlay');
  if (o) o.remove();
}

async function handleIncomingAccept() {
  if (!pendingIncoming) return;
  stopInAppRinging();
  const info = pendingIncoming;
  pendingIncoming = null;
  try {
    currentCall = { id: info.callId, room_name: info.room };
    await supabase.from('calls')
      .update({ status: 'active', answered_at: new Date().toISOString(), seen: true })
      .eq('id', info.callId);
    hideInAppIncomingScreen();
    document.getElementById('loadingScreen').style.display = 'flex';
    document.getElementById('loadingText').textContent = 'Connecting…';
    await joinCall(info.room);
  } catch (e) { showError('Failed to accept call'); }
}

async function handleIncomingDecline() {
  const info = pendingIncoming;
  pendingIncoming = null;
  hideInAppIncomingScreen();
  try {
    if (info && supabase) {
      await supabase.from('calls')
        .update({ status: 'rejected', ended_at: new Date().toISOString(), seen: true })
        .eq('id', info.callId);
    }
  } catch (e) {}
  unregisterTab();
  window.location.href = window.__callReturnUrl || getReturnUrl();
}

// ─────────────────────────────────────────────────────────
// Outgoing
// ─────────────────────────────────────────────────────────
async function createCallRoom() {
  const unique = `CallApp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: `${JAAS_APP_ID}/${unique}`,
    url: `https://${JAAS_DOMAIN}/${JAAS_APP_ID}/${unique}`,
    id: unique
  };
}

async function startOutgoingCall(friendId, friendName) {
  try {
    document.getElementById('loadingText').textContent = `Calling ${friendName}…`;
    const room = await createCallRoom();

    const callData = {
      caller_id: currentUser.id,
      receiver_id: friendId,
      callee_id: friendId,
      room_name: room.name,
      room_url: room.url,
      status: 'ringing',
      seen: false,
      created_at: new Date().toISOString()
    };

    const { data: call, error } = await supabase
      .from('calls').insert([callData]).select().single();
    if (error) throw new Error('Database error: ' + error.message);

    currentCall = call;
    document.getElementById('loadingText').textContent = `Waiting for ${friendName} to answer…`;

    supabase.channel(`call-${call.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${call.id}`
      }, (p) => {
        const s = p.new.status;
        if (s === 'active') { document.getElementById('loadingText').textContent = 'Connecting…'; joinCall(p.new.room_name); }
        else if (s === 'rejected') showCallEnded('Call was rejected');
        else if (s === 'cancelled') showCallEnded('Call was cancelled');
        else if (s === 'ended') showCallEnded('Call ended');
      })
      .subscribe();
  } catch (err) {
    console.error('[call] start error:', err);
    showError('Failed to start call: ' + err.message);
  }
}

// ─────────────────────────────────────────────────────────
// Join Jitsi (JaaS)
// ─────────────────────────────────────────────────────────
async function joinCall(roomName) {
  try {
    document.getElementById('loadingScreen').style.display = 'flex';
    document.getElementById('loadingText').textContent = 'Connecting…';

    const container = document.getElementById('dailyContainer');
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'width:100%;height:100%;position:relative;overflow:hidden;background:#000';

    const iframe = document.createElement('iframe');
    iframe.allow = 'microphone; camera; autoplay; display-capture; fullscreen';
    iframe.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals';
    iframe.style.cssText = 'width:100%;height:100%;border:none;background:#000';
    iframe.allowFullscreen = true;

    const baseUrl = `https://${JAAS_DOMAIN}/${roomName}`;
    const config = {
      configOverwrite: {
        prejoinPageEnabled: false, enableWelcomePage: false,
        startWithAudioMuted: false, startWithVideoMuted: true,
        disableChat: true, disableInviteFunctions: true,
        toolbarButtons: [], hideConferenceTimer: true,
        hideParticipantsStats: true, hideLogo: true, hideWatermark: true
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: [],
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        VIDEO_LAYOUT_FIT: 'cover'
      },
      userInfo: { displayName: currentUser.username }
    };
    const configParam = encodeURIComponent(JSON.stringify(config));
    iframe.src = `${baseUrl}#config=${configParam}`;

    wrapper.appendChild(iframe);
    container.appendChild(wrapper);
    jitsiIframe = iframe;

    const style = document.createElement('style');
    style.textContent = `
      .prejoin-screen,.welcome-page,.join-dialog,
      [class*="toolbar"],[class*="Toolbar"],
      [class*="watermark"],[class*="Watermark"]{display:none!important}
      video{object-fit:cover!important;width:100%!important;height:100%!important}
    `;
    wrapper.appendChild(style);

    iframe.onload = () => {
      const joinInterval = setInterval(() => {
        try {
          const doc = iframe.contentWindow.document;
          for (const sel of ['[data-testid="prejoin.joinButton"]', '.prejoin-input-area button', '.join-button']) {
            const btn = doc.querySelector(sel);
            if (btn) { btn.click(); clearInterval(joinInterval); break; }
          }
        } catch (e) {}
      }, 1000);
      setTimeout(() => clearInterval(joinInterval), 10000);
    };

    setTimeout(() => {
      document.getElementById('loadingScreen').style.display = 'none';
      addHangButton();
    }, 3000);
  } catch (err) {
    console.error('[call] join error:', err);
    showError('Failed to join call: ' + err.message);
  }
}

function addHangButton() {
  const existing = document.getElementById('hangUpBtn');
  if (existing) existing.remove();
  const btn = document.createElement('button');
  btn.id = 'hangUpBtn';
  btn.className = 'hang-up-btn';
  btn.setAttribute('aria-label', 'Hang up');
  btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8 10a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.574 2.81.7A2 2 0 0 1 22 16.92z"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    </svg>`;
  btn.onclick = () => window.hangUp();
  document.body.appendChild(btn);
}

function showCallEnded(message) {
  document.getElementById('loadingScreen').style.display = 'flex';
  document.getElementById('loadingText').textContent = message;
  setTimeout(() => {
    window.location.href = window.__callReturnUrl || getReturnUrl();
  }, 2000);
}

function showError(message) {
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('errorScreen').style.display = 'flex';
  document.getElementById('errorMessage').textContent = message;
}

// ─────────────────────────────────────────────────────────
// Live incoming event (dispatched by native-init.js)
// ─────────────────────────────────────────────────────────
window.addEventListener('relay:incoming-call', async (e) => {
  const data = e.detail || {};
  if (!data.room || !data.callId) return;
  if (pendingIncoming || currentCall) return;

  let callerName = data.callerName || '';
  let callerAvatar = data.callerAvatar || '';

  if ((!callerName || !callerName.trim()) && data.callerId) {
    const p = await fetchCallerProfile(data.callerId);
    if (p) {
      callerName = p.full_name || p.username || 'Incoming Call';
      callerAvatar = p.avatar_url || '';
    }
  }

  pendingIncoming = {
    callId: data.callId, room: data.room, callerId: data.callerId,
    callerName, callerAvatar
  };

  const ls = document.getElementById('loadingScreen');
  if (ls) ls.style.display = 'none';

  showInAppIncomingScreen({
    callId: data.callId, room: data.room, callerId: data.callerId,
    callerName, callerAvatar
  });
});

initCall();