// utils/callHub.js — SPA-adapted. Presence + notifications + calls.
// Uses shared Supabase client via the adapter.

import { initializeSupabase } from './supabase.js';

const CALL_APP_PATH = '/pages/call-app/call/index.html';
const CHAT_APP_PATH = '/home/#/chats';
const MISSED_CALL_POLL_MS = 15000;
const DEFAULT_RETURN = '/home/#/friends';
const PRESENCE_HEARTBEAT_MS = 20000;
const WARMUP_INTERVAL_MS = 60000;
const PRESENCE_OFFLINE_GRACE_MS = 15000;
const CALL_BANNER_TIMEOUT_MS = 30000;
const MESSAGE_BANNER_TIMEOUT_MS = 5000;
const REACTION_BANNER_TIMEOUT_MS = 5000;
const SWIPE_DISMISS_PX = 80;
const ONLINE_FRESH_WINDOW_MS = 60000;

const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

let supabase = null;
let currentUser = null;
let callChannel = null;
let messageChannel = null;
let reactionChannel = null;
let incomingCallTimeout = null;
let messageBannerTimeout = null;
let reactionBannerTimeout = null;
let missedCallPollTimer = null;
let presenceTimer = null;
let warmupTimer = null;
let ringtonePlayer = null;
let ringtoneInterval = null;
let bannerVisible = false;
let reconnectAttempts = 0;
let presenceStarted = false;
let presenceOfflineTimer = null;
let lastPresenceIntent = 'online';
const MAX_RECONNECT_ATTEMPTS = 6;

window.callHubReady = false;

function isUserOnline(profile) {
  if (!profile) return false;
  if (profile.status !== 'online') return false;
  if (!profile.last_seen) return false;
  try { return Date.now() - new Date(profile.last_seen).getTime() < ONLINE_FRESH_WINDOW_MS; }
  catch (e) { return false; }
}
window.isUserOnline = isUserOnline;

function getCurrentPageUrl() {
  try {
    const url = window.location.pathname + window.location.search + window.location.hash;
    return url || DEFAULT_RETURN;
  } catch (e) { return DEFAULT_RETURN; }
}

function rememberReturnUrl() {
  const url = getCurrentPageUrl();
  try { sessionStorage.setItem('callReturnTo', url); } catch (e) {}
  return url;
}

// ─────────────────────────────────────────────────────────
// Presence
// ─────────────────────────────────────────────────────────
let lastPresenceValue = null;
let lastPresenceWrite = 0;
const MIN_WRITE_GAP_MS = 3000;

async function writePresence(status, force) {
  if (!supabase || !currentUser) return;
  const now = Date.now();
  if (!force && status === lastPresenceValue && now - lastPresenceWrite < MIN_WRITE_GAP_MS) return;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ status, last_seen: new Date().toISOString() })
      .eq('id', currentUser.id);
    if (!error) { lastPresenceValue = status; lastPresenceWrite = now; }
  } catch (e) {}
}

async function markOnline() {
  lastPresenceIntent = 'online';
  if (presenceOfflineTimer) { clearTimeout(presenceOfflineTimer); presenceOfflineTimer = null; }
  await writePresence('online', true);
}

function scheduleOffline() {
  lastPresenceIntent = 'offline';
  if (presenceOfflineTimer) clearTimeout(presenceOfflineTimer);
  presenceOfflineTimer = setTimeout(async () => {
    presenceOfflineTimer = null;
    if (lastPresenceIntent === 'offline') await writePresence('offline', true);
  }, PRESENCE_OFFLINE_GRACE_MS);
}

function startPresence() {
  if (presenceStarted || !currentUser) return;
  presenceStarted = true;
  markOnline();

  presenceTimer = setInterval(() => {
    if (document.visibilityState === 'visible') writePresence('online', true);
  }, PRESENCE_HEARTBEAT_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') markOnline();
    else scheduleOffline();
  });

  window.addEventListener('pagehide', () => scheduleOffline());
  window.addEventListener('pageshow', () => markOnline());

  window.addEventListener('beforeunload', () => {
    if (presenceTimer) clearInterval(presenceTimer);
    if (presenceOfflineTimer) clearTimeout(presenceOfflineTimer);
    if (supabase && currentUser) {
      try {
        supabase.from('profiles')
          .update({ status: 'offline', last_seen: new Date().toISOString() })
          .eq('id', currentUser.id);
      } catch (e) {}
    }
  });

  if (IS_NATIVE && window.Capacitor?.Plugins?.App) {
    try {
      window.Capacitor.Plugins.App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) markOnline(); else scheduleOffline();
      });
    } catch (e) {}
  }
}

function startWarmup() {
  if (warmupTimer || !supabase || !currentUser) return;
  const ping = async () => {
    try { await supabase.from('profiles').select('id').eq('id', currentUser.id).maybeSingle(); }
    catch (e) {}
  };
  ping();
  warmupTimer = setInterval(ping, WARMUP_INTERVAL_MS);
}

// ─────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────
async function initCallHub() {
  try {
    supabase = await initializeSupabase();
    if (!supabase?.auth) { setTimeout(initCallHub, 2000); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    currentUser = session.user;
    startPresence();
    startWarmup();
    setupRingtone();
    setupCallChannel();
    setupMessageChannel();
    setupReactionChannel();
    checkMissedCalls();
    startMissedCallPolling();
    window.callHubReady = true;
  } catch (err) {
    console.error('[callHub] init error:', err);
  }
}

function setupRingtone() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('No AudioContext');
    const ctx = new Ctx();
    ringtonePlayer = {
      play() {
        if (ringtoneInterval) return;
        if (ctx.state === 'suspended') ctx.resume();
        const beep = () => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = 587.33;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(); osc.stop(ctx.currentTime + 0.45);
        };
        beep();
        ringtoneInterval = setInterval(() => { beep(); setTimeout(beep, 500); }, 2000);
      },
      stop() { if (ringtoneInterval) { clearInterval(ringtoneInterval); ringtoneInterval = null; } }
    };
  } catch (e) { ringtonePlayer = { play() {}, stop() {} }; }
}

function playRingtone() { ringtonePlayer?.play?.(); }
function stopRingtone() { ringtonePlayer?.stop?.(); }

// ─────────────────────────────────────────────────────────
// Channels
// ─────────────────────────────────────────────────────────
function setupCallChannel() {
  if (!supabase || !currentUser) return;
  if (callChannel) { supabase.removeChannel(callChannel); callChannel = null; }
  callChannel = supabase.channel(`callHub:${currentUser.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${currentUser.id}` },
      (p) => { if (p.new.status === 'ringing') handleIncomingCall(p.new); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `callee_id=eq.${currentUser.id}` },
      (p) => {
        const s = p.new.status;
        if (['cancelled', 'ended', 'missed'].includes(s)) {
          const b = document.getElementById('callHubBanner');
          if (b && b.dataset.callId === String(p.new.id)) dismissBanner();
        }
      })
    .subscribe((s) => {
      if (s === 'SUBSCRIBED') reconnectAttempts = 0;
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          setTimeout(setupCallChannel, Math.min(2000 * reconnectAttempts, 15000));
        }
      }
    });
}

function setupMessageChannel() {
  if (!supabase || !currentUser) return;
  if (messageChannel) { supabase.removeChannel(messageChannel); messageChannel = null; }
  messageChannel = supabase.channel(`msgHub:${currentUser.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `receiver_id=eq.${currentUser.id}` },
      (p) => handleIncomingMessage(p.new))
    .subscribe();
}

async function handleIncomingMessage(row) {
  if (!row || !row.sender_id || row.sender_id === currentUser.id) return;
  if (row.message_type === 'call') return;
  if (isOnChatPageWith(row.sender_id)) return;
  if (bannerVisible) return;
  const preview = buildMessagePreview(row);
  if (!preview) return;
  const sender = profileCache.get(row.sender_id) || await getProfile(row.sender_id);
  if (!sender) return;
  showMessageBanner({
    senderId: row.sender_id,
    senderName: sender.username || 'Someone',
    senderAvatar: sender.avatar_url || null,
    preview,
    isImage: !!row.image_url
  });
}

function isOnChatPageWith(friendId) {
  try {
    if (!window.location.pathname.startsWith('/home/')) return false;
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    return params.get('friendId') === friendId;
  } catch (e) { return false; }
}

function buildMessagePreview(row) {
  const text = (row.content || '').trim();
  if (row.audio_url && !text) return '🎤 Voice message';
  if (row.image_url && !text) return '📷 Photo';
  if (row.image_url && text) return '📷 ' + text;
  if (!text) return 'New message';
  return text.length > 80 ? text.slice(0, 77) + '…' : text;
}

function setupReactionChannel() {
  if (!supabase || !currentUser) return;
  if (reactionChannel) { supabase.removeChannel(reactionChannel); reactionChannel = null; }
  reactionChannel = supabase.channel(`reactHub:${currentUser.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' },
      (p) => handleIncomingReaction(p.new))
    .subscribe();
}

async function handleIncomingReaction(row) {
  try {
    if (!row || !row.message_id || row.user_id === currentUser.id) return;
    const { data: msg } = await supabase.from('direct_messages')
      .select('id, sender_id, receiver_id, content, image_url')
      .eq('id', row.message_id).maybeSingle();
    if (!msg || msg.sender_id !== currentUser.id) return;
    if (isOnChatPageWith(row.user_id)) return;
    if (bannerVisible) return;
    const reactor = profileCache.get(row.user_id) || await getProfile(row.user_id);
    if (!reactor) return;
    showReactionBanner({
      reactorId: row.user_id,
      reactorName: reactor.username || 'Someone',
      reactorAvatar: reactor.avatar_url || null,
      emoji: row.emoji || '❤️',
      preview: buildReactionPreview(msg)
    });
  } catch (e) {}
}

function buildReactionPreview(msg) {
  const text = (msg.content || '').trim();
  if (text) return text.length > 60 ? text.slice(0, 57) + '…' : text;
  if (msg.image_url) return 'your photo';
  return 'your message';
}

const profileCache = new Map();
async function getProfile(userId) {
  if (!userId || !supabase) return null;
  if (profileCache.has(userId)) return profileCache.get(userId);
  try {
    const { data } = await supabase.from('profiles')
      .select('username, avatar_url').eq('id', userId).maybeSingle();
    if (data) profileCache.set(userId, data);
    return data;
  } catch (e) { return null; }
}

// ─────────────────────────────────────────────────────────
// Swipe-dismiss
// ─────────────────────────────────────────────────────────
function attachSwipeDismiss(banner, onDismiss) {
  if (!banner) return;
  let startX = 0, startY = 0, currentX = 0, dragging = false, decided = false;

  function reset() {
    dragging = false; decided = false; currentX = 0;
    banner.style.transition = '';
    banner.style.transform = 'translateX(-50%)';
    banner.style.opacity = '1';
  }
  function onDown(cx, cy) {
    if (document.activeElement && document.activeElement !== document.body) try { document.activeElement.blur(); } catch (e) {}
    startX = cx; startY = cy; dragging = true; decided = false; currentX = 0;
    banner.style.transition = 'none';
  }
  function onMove(cx, cy) {
    if (!dragging) return;
    const dx = cx - startX, dy = cy - startY;
    if (!decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      decided = true;
      if (Math.abs(dy) > Math.abs(dx)) { dragging = false; reset(); return; }
    }
    currentX = dx;
    banner.style.transform = `translateX(calc(-50% + ${dx}px))`;
    banner.style.opacity = String(Math.max(0.3, 1 - Math.abs(dx) / 240));
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    if (Math.abs(currentX) > SWIPE_DISMISS_PX) {
      const exitX = currentX > 0 ? 300 : -300;
      banner.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
      banner.style.transform = `translateX(calc(-50% + ${exitX}px))`;
      banner.style.opacity = '0';
      setTimeout(() => {
        if (banner.parentNode) banner.remove();
        if (typeof onDismiss === 'function') onDismiss();
      }, 220);
    } else {
      banner.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      banner.style.transform = 'translateX(-50%)';
      banner.style.opacity = '1';
      currentX = 0;
    }
  }

  banner.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    onDown(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  banner.addEventListener('touchmove', (e) => {
    if (!dragging || e.touches.length !== 1) return;
    onMove(e.touches[0].clientX, e.touches[0].clientY);
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  banner.addEventListener('touchend', onUp);
  banner.addEventListener('touchcancel', onUp);
  banner.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    onDown(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', (e) => { if (dragging) onMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup', () => { if (dragging) onUp(); });
}

// ─────────────────────────────────────────────────────────
// Banners
// ─────────────────────────────────────────────────────────
async function handleIncomingCall(callRow) {
  if (!callRow?.caller_id || callRow.callee_id !== currentUser.id) return;
  if (callRow.status !== 'ringing') return;
  if (window.location.pathname.includes('/pages/call-app/call/')) return;
  const existing = document.getElementById('callHubBanner');
  if (existing && existing.dataset.callId === String(callRow.id)) return;
  const caller = profileCache.get(callRow.caller_id) || await getProfile(callRow.caller_id);
  showBanner({
    callId: callRow.id,
    callerId: callRow.caller_id,
    callerName: caller?.username || 'Unknown',
    callerAvatar: caller?.avatar_url || null,
    room: callRow.room_name
  });
  playRingtone();
  incomingCallTimeout = setTimeout(() => {
    const el = document.getElementById('callHubBanner');
    if (el) markAsMissed(el.dataset.callId);
    dismissBanner();
  }, CALL_BANNER_TIMEOUT_MS);
}

function showBanner(call) {
  clearAnyNotificationBanner();
  bannerVisible = true;
  const initial = (call.callerName || '?').charAt(0).toUpperCase();
  const banner = document.createElement('div');
  banner.id = 'callHubBanner';
  banner.dataset.kind = 'call';
  banner.dataset.callId = String(call.callId);
  banner.dataset.callerId = call.callerId;
  banner.dataset.room = call.room;
  banner.dataset.callerName = call.callerName || '';
  banner.innerHTML = `
    <div class="callHub-avatar">
      ${call.callerAvatar ? `<img src="${call.callerAvatar}" alt="">` : `<span>${initial}</span>`}
    </div>
    <div class="callHub-info">
      <div class="callHub-name">${escapeHtml(call.callerName)}</div>
      <div class="callHub-sub"><span class="callHub-pulse"></span><span>Incoming call…</span></div>
    </div>
    <div class="callHub-actions">
      <button type="button" class="callHub-btn callHub-decline" data-action="decline" aria-label="Decline">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="white" style="pointer-events:none;"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
      </button>
      <button type="button" class="callHub-btn callHub-accept" data-action="accept" aria-label="Accept">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="white" style="pointer-events:none;"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
      </button>
    </div>
  `;
  document.body.appendChild(banner);
  injectBannerStyles();

  const onPress = (e) => {
    const target = e.target.closest('button[data-action]');
    if (!target) return;
    e.preventDefault(); e.stopPropagation();
    const action = target.getAttribute('data-action');
    const el = document.getElementById('callHubBanner');
    if (!el) return;
    const data = {
      callId: el.dataset.callId,
      callerId: el.dataset.callerId,
      room: el.dataset.room,
      callerName: el.dataset.callerName
    };
    if (!data.callId || !data.room) return;
    if (action === 'accept') acceptIncoming(data);
    else if (action === 'decline') rejectIncoming(data);
  };
  const actions = banner.querySelector('.callHub-actions');
  actions.addEventListener('click', onPress);
  actions.addEventListener('touchend', onPress, { passive: false });

  attachSwipeDismiss(banner, () => {
    stopRingtone();
    if (incomingCallTimeout) { clearTimeout(incomingCallTimeout); incomingCallTimeout = null; }
    const id = banner.dataset.callId;
    if (id) markAsMissed(id);
    bannerVisible = false;
  });
}

function dismissBanner() {
  bannerVisible = false;
  stopRingtone();
  if (incomingCallTimeout) { clearTimeout(incomingCallTimeout); incomingCallTimeout = null; }
  const el = document.getElementById('callHubBanner');
  if (el) {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(-20px)';
    setTimeout(() => el.remove(), 180);
  }
}

function showMessageBanner(data) {
  clearAnyNotificationBanner();
  const initial = (data.senderName || '?').charAt(0).toUpperCase();
  const banner = document.createElement('div');
  banner.id = 'callHubBanner';
  banner.className = 'callHub-kind-message';
  banner.dataset.kind = 'message';
  banner.dataset.senderId = String(data.senderId);
  banner.dataset.senderName = data.senderName || '';
  banner.innerHTML = `
    <div class="callHub-avatar">
      ${data.senderAvatar ? `<img src="${data.senderAvatar}" alt="">` : `<span>${initial}</span>`}
    </div>
    <div class="callHub-info">
      <div class="callHub-name">${escapeHtml(data.senderName)}</div>
      <div class="callHub-sub callHub-sub-message">${escapeHtml(data.preview)}</div>
    </div>
  `;
  banner.addEventListener('click', (e) => {
    e.preventDefault();
    openChatWith(data.senderId, data.senderName);
  });
  document.body.appendChild(banner);
  injectBannerStyles();
  messageBannerTimeout = setTimeout(() => {
    if (banner.parentNode) {
      banner.style.opacity = '0';
      banner.style.transform = 'translateX(-50%) translateY(-20px)';
      setTimeout(() => banner.remove(), 180);
    }
  }, MESSAGE_BANNER_TIMEOUT_MS);
}

function openChatWith(friendId, friendName) {
  if (!friendId) return;
  try {
    sessionStorage.setItem('currentChatFriend', JSON.stringify({ id: friendId, username: friendName || 'Friend' }));
  } catch (e) {}
  window.location.href = `${CHAT_APP_PATH}?friendId=${encodeURIComponent(friendId)}`;
}

function showReactionBanner(data) {
  clearAnyNotificationBanner();
  const initial = (data.reactorName || '?').charAt(0).toUpperCase();
  const banner = document.createElement('div');
  banner.id = 'callHubBanner';
  banner.className = 'callHub-kind-reaction';
  banner.dataset.kind = 'reaction';
  banner.dataset.reactorId = String(data.reactorId);
  banner.dataset.reactorName = data.reactorName || '';
  banner.innerHTML = `
    <div class="callHub-avatar">
      ${data.reactorAvatar ? `<img src="${data.reactorAvatar}" alt="">` : `<span>${initial}</span>`}
      <span class="callHub-emoji-badge">${escapeHtml(data.emoji || '❤️')}</span>
    </div>
    <div class="callHub-info">
      <div class="callHub-name">${escapeHtml(data.reactorName)} reacted ${escapeHtml(data.emoji || '')}</div>
      <div class="callHub-sub callHub-sub-reaction">${escapeHtml(data.preview)}</div>
    </div>
  `;
  banner.addEventListener('click', (e) => {
    e.preventDefault();
    openChatWith(data.reactorId, data.reactorName);
  });
  document.body.appendChild(banner);
  injectBannerStyles();
  reactionBannerTimeout = setTimeout(() => {
    if (banner.parentNode) {
      banner.style.opacity = '0';
      banner.style.transform = 'translateX(-50%) translateY(-20px)';
      setTimeout(() => banner.remove(), 180);
    }
  }, REACTION_BANNER_TIMEOUT_MS);
}

function clearAnyNotificationBanner() {
  if (messageBannerTimeout) { clearTimeout(messageBannerTimeout); messageBannerTimeout = null; }
  if (reactionBannerTimeout) { clearTimeout(reactionBannerTimeout); reactionBannerTimeout = null; }
  const el = document.getElementById('callHubBanner');
  if (el && el.dataset.kind !== 'call') el.remove();
}

async function acceptIncoming(data) {
  if (!data?.callId) return;
  const returnTo = rememberReturnUrl();
  bannerVisible = false;
  stopRingtone();
  if (incomingCallTimeout) { clearTimeout(incomingCallTimeout); incomingCallTimeout = null; }
  const el = document.getElementById('callHubBanner');
  if (el) el.remove();
  try {
    await supabase.from('calls')
      .update({ status: 'active', answered_at: new Date().toISOString(), seen: true })
      .eq('id', data.callId);
  } catch (e) {}
  const url = `${CALL_APP_PATH}?incoming=true&room=${encodeURIComponent(data.room)}&callerId=${data.callerId}&callId=${data.callId}&returnTo=${encodeURIComponent(returnTo)}`;
  window.location.href = url;
}

async function rejectIncoming(data) {
  if (!data?.callId) return;
  bannerVisible = false;
  stopRingtone();
  if (incomingCallTimeout) { clearTimeout(incomingCallTimeout); incomingCallTimeout = null; }
  const el = document.getElementById('callHubBanner');
  if (el) el.remove();
  try {
    await supabase.from('calls')
      .update({ status: 'rejected', ended_at: new Date().toISOString(), seen: true })
      .eq('id', data.callId);
  } catch (e) {}
}

async function markAsMissed(callId) {
  if (!callId) return;
  try {
    await supabase.from('calls')
      .update({ status: 'missed', ended_at: new Date().toISOString(), seen: false })
      .eq('id', callId);
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────
// Outgoing call
// ─────────────────────────────────────────────────────────
window.startCall = function (friendId, friendName) {
  if (!friendId) return;
  const returnTo = rememberReturnUrl();
  const url = `${CALL_APP_PATH}?friendId=${friendId}&friendName=${encodeURIComponent(friendName || '')}&returnTo=${encodeURIComponent(returnTo)}`;
  const popup = window.open(url, '_blank', 'width=500,height=700');
  if (!popup || popup.closed || typeof popup.closed === 'undefined') {
    window.location.href = url;
  }
};

async function checkMissedCalls() {
  if (!supabase || !currentUser) return;
  try {
    const { count } = await supabase.from('calls')
      .select('*', { count: 'exact', head: true })
      .eq('callee_id', currentUser.id)
      .eq('seen', false)
      .in('status', ['missed', 'rejected']);
    const badge = document.getElementById('missedCallBadge');
    if (badge) {
      if (count && count > 0) {
        badge.textContent = count > 9 ? '9+' : String(count);
        badge.style.display = 'flex';
      } else badge.style.display = 'none';
    }
  } catch (e) {}
}

function startMissedCallPolling() {
  if (missedCallPollTimer) clearInterval(missedCallPollTimer);
  missedCallPollTimer = setInterval(checkMissedCalls, MISSED_CALL_POLL_MS);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ─────────────────────────────────────────────────────────
// Banner styles (injected once)
// ─────────────────────────────────────────────────────────
function injectBannerStyles() {
  if (document.getElementById('callHubStyles')) return;
  const style = document.createElement('style');
  style.id = 'callHubStyles';
  style.textContent = `
    #callHubBanner {
      position: fixed; top: 14px; left: 50%;
      transform: translateX(-50%);
      width: min(92%, 400px);
      background: rgba(255,255,255,0.96);
      backdrop-filter: saturate(180%) blur(16px);
      -webkit-backdrop-filter: saturate(180%) blur(16px);
      border: 1px solid #f1f5f9;
      border-radius: 22px;
      padding: 14px 16px;
      box-shadow: 0 12px 40px rgba(9,9,11,0.18), 0 2px 6px rgba(9,9,11,0.06);
      z-index: 2147483647;
      display: flex; align-items: center; gap: 12px;
      transition: opacity 0.18s ease, transform 0.18s ease;
      animation: callHubSlideDown 0.3s cubic-bezier(0.22, 1, 0.36, 1);
      pointer-events: auto;
      user-select: none;
      font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      touch-action: pan-y;
    }
    #callHubBanner.callHub-kind-message,
    #callHubBanner.callHub-kind-reaction { cursor: pointer; }
    @keyframes callHubSlideDown {
      from { opacity: 0; transform: translateX(-50%) translateY(-30px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    .callHub-avatar {
      position: relative; width: 48px; height: 48px;
      min-width: 48px; min-height: 48px;
      border-radius: 50%;
      background: linear-gradient(135deg, #0B84F3, #5cc0fa);
      display: flex; align-items: center; justify-content: center;
      overflow: visible; color: #fff;
      font-weight: 500; font-size: 1.15rem;
      flex-shrink: 0; text-transform: uppercase;
      box-shadow: 0 4px 12px rgba(11, 132, 243, 0.22);
    }
    .callHub-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }
    .callHub-emoji-badge {
      position: absolute; right: -4px; bottom: -4px;
      width: 22px; height: 22px; border-radius: 50%;
      background: #fff; border: 2px solid #f1f5f9;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.75rem; line-height: 1;
      box-shadow: 0 2px 6px rgba(9,9,11,0.15); z-index: 2;
    }
    .callHub-info { flex: 1; min-width: 0; }
    .callHub-name {
      color: #09090b; font-weight: 500; font-size: 0.98rem;
      letter-spacing: -0.01em; margin-bottom: 3px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .callHub-sub { display: flex; align-items: center; gap: 6px; color: #52525b; font-size: 0.8rem; }
    .callHub-sub-message, .callHub-sub-reaction { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .callHub-pulse {
      width: 8px; height: 8px; border-radius: 50%;
      background: #16a34a;
      box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.55);
      animation: callHubPulse 1.6s infinite; flex-shrink: 0;
    }
    @keyframes callHubPulse {
      0%   { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.55); }
      70%  { box-shadow: 0 0 0 12px rgba(22, 163, 74, 0); }
      100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
    }
    .callHub-actions { display: flex; gap: 8px; flex-shrink: 0; z-index: 10; }
    .callHub-btn {
      width: 44px; height: 44px; border-radius: 50%; border: none;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), background 0.2s;
      box-shadow: 0 4px 14px rgba(9,9,11,0.18);
      touch-action: manipulation;
    }
    .callHub-btn:hover { transform: scale(1.06); }
    .callHub-btn:active { transform: scale(0.94); }
    .callHub-accept { background: #16a34a; animation: callHubRing 1.6s infinite; }
    .callHub-accept:hover { background: #15803d; }
    .callHub-decline { background: #dc2626; }
    .callHub-decline:hover { background: #b91c1c; }
    @keyframes callHubRing {
      0%   { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.55); }
      70%  { box-shadow: 0 0 0 14px rgba(22, 163, 74, 0); }
      100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
    }
    .callHub-btn svg { pointer-events: none !important; }
    @media (max-width: 480px) {
      #callHubBanner { top: 10px; width: calc(100% - 20px); padding: 12px 14px; border-radius: 20px; gap: 10px; }
      .callHub-avatar { width: 44px; height: 44px; min-width: 44px; min-height: 44px; font-size: 1.05rem; }
      .callHub-name { font-size: 0.94rem; }
      .callHub-sub { font-size: 0.76rem; }
      .callHub-btn { width: 42px; height: 42px; }
    }
    @media (prefers-reduced-motion: reduce) {
      #callHubBanner, .callHub-pulse, .callHub-accept { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
    }
  `;
  document.head.appendChild(style);
}

window.addEventListener('beforeunload', () => {
  stopRingtone();
  if (callChannel && supabase) supabase.removeChannel(callChannel);
  if (messageChannel && supabase) supabase.removeChannel(messageChannel);
  if (reactionChannel && supabase) supabase.removeChannel(reactionChannel);
  if (missedCallPollTimer) clearInterval(missedCallPollTimer);
  if (presenceTimer) clearInterval(presenceTimer);
  if (warmupTimer) clearInterval(warmupTimer);
  if (presenceOfflineTimer) clearTimeout(presenceOfflineTimer);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCallHub);
} else {
  initCallHub();
}