// home/views/chats.js — complete chats view port.
// Combines chat-core.js + img-handler.js + script.js coordinator.

import { getSession } from '/shared/supabase.js';
import { VoiceRecorder } from './voice-recorder.js';

const IMGBB_API_KEY = '82e49b432e2ee14921f7d0cd81ba5551';
const ONLINE_FRESH_WINDOW_MS = 60000;

const QUICK_REACTIONS = ['🥀', '💕', '🫂', '😭'];
const PICKER_EMOJIS = [
  '🥀', '💕', '🫂', '😭', '😂', '❤️',
  '🔥', '👍', '👎', '😮', '😢', '😡',
  '🙏', '🎉', '💯', '😍', '😘', '🤔',
  '😴', '🤯', '🥺', '😈', '💀', '🤝',
  '✨', '🙌', '👏', '🥰', '😅', '🤗'
];

const ICONS = {
  copy: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-.9 13.1A2 2 0 0 1 16.1 21H7.9a2 2 0 0 1-2-1.9L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  play: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`
};

// ═════════════════════════════════════════════════════════════
// Module state
// ═════════════════════════════════════════════════════════════

let currentUser = null;
let chatFriend = null;
let chatChannel = null;
let statusChannel = null;
let typingChannel = null;
let reactionsChannel = null;
let callsChannel = null;
let isLoadingMessages = false;
let currentMessages = [];
let isSending = false;
let isTyping = false;
let typingTimeout = null;
let friendTypingTimeout = null;
let messageReactions = {};

let longPressTimer = null;
let longPressTarget = null;
let selectedMessageId = null;
let selectedMessageEl = null;
let quickBarElement = null;
let justOpenedAt = 0;

let voiceRecorder = null;
let voicePreviewAudioEl = null;
let voicePreviewBars = [];

let currentlyPlayingAudio = null;
let currentlyPlayingBtn = null;

let sentAudio = null;
let receivedAudio = null;

let routerRef = null;
let abortController = null;

// Img-handler state
let selectedColor = null;
let colorPickerVisible = false;
let isImagePickerOpen = false;
let selectedImages = [];
let currentImageIndex = 0;
let uploadInProgress = false;
let isUploadingMultiple = false;

// ═════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════

function isUserOnline(profile) {
  if (!profile) return false;
  if (profile.status !== 'online') return false;
  if (!profile.last_seen) return false;
  try {
    const ageMs = Date.now() - new Date(profile.last_seen).getTime();
    return ageMs < ONLINE_FRESH_WINDOW_MS;
  } catch (e) { return false; }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
function escapeAttr(text) {
  return String(text || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatLastSeen(ts) {
  try {
    const now = new Date();
    const t = new Date(ts);
    const diffMs = now - t;
    const sec = Math.floor(diffMs / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (sec < 60) return 'now';
    if (min < 60) return `${min}m`;
    if (hr < 24) return `${hr}h`;
    if (day === 1) return '1d';
    if (day < 7) return `${day}d`;
    if (day < 30) return `${Math.floor(day / 7)}w`;
    return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return 'offline'; }
}

function ensureHttpsUrl(url) {
  if (!url) return url;
  let u = url.replace(/^http:\/\//, 'https://');
  if (u.startsWith('https://https://')) u = u.replace('https://https://', 'https://');
  return u;
}

function isMobileChrome() {
  const ua = navigator.userAgent;
  return /Android/i.test(ua) && /Chrome/i.test(ua) && !/Edg/i.test(ua);
}
function isIOSChrome() {
  return /CriOS/i.test(navigator.userAgent);
}

function fixImgBBUrls(url) {
  if (!url || !url.includes('ibb.co')) return url;
  let fixedUrl = url;
  if (isMobileChrome() || isIOSChrome()) {
    fixedUrl = fixedUrl.replace('https://ibb.co/', 'https://i.ibb.co/');
    fixedUrl = fixedUrl.replace('http://ibb.co/', 'https://i.ibb.co/');
    if (!fixedUrl.includes('.jpg') && !fixedUrl.includes('.png') && !fixedUrl.includes('.gif')) {
      fixedUrl += '.jpg';
    }
  }
  return ensureHttpsUrl(fixedUrl);
}

// ═════════════════════════════════════════════════════════════
// Toast / Alert / Confirm
// ═════════════════════════════════════════════════════════════

function showToast(message, icon = '✅', duration = 1500) {
  const toast = document.getElementById('customToast');
  if (!toast) return;
  document.getElementById('toastMessage').textContent = message;
  document.getElementById('toastIcon').textContent = icon;
  toast.style.display = 'flex';
  setTimeout(() => toast.style.display = 'none', duration);
}

function showCustomAlert(message, icon = '❌', title = 'Alert', callback = null) {
  const modal = document.getElementById('customAlert');
  if (!modal) return;
  document.getElementById('alertTitle').textContent = title;
  document.getElementById('alertIcon').textContent = icon;
  document.getElementById('alertMessage').textContent = message;
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('visible'));
  document.getElementById('alertConfirm').onclick = () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.style.display = 'none', 200);
    if (callback) callback();
  };
}

function showConfirmAlert(message, icon = '❓', title = 'Confirm', onConfirm = null) {
  const modal = document.getElementById('customAlert');
  if (!modal) return;
  document.getElementById('alertTitle').textContent = title;
  document.getElementById('alertIcon').textContent = icon;
  document.getElementById('alertMessage').textContent = message;

  const cancelBtn = document.getElementById('alertCancel');
  cancelBtn.style.display = 'flex';
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('visible'));

  document.getElementById('alertConfirm').onclick = () => {
    modal.classList.remove('visible');
    cancelBtn.style.display = 'none';
    setTimeout(() => modal.style.display = 'none', 200);
    if (onConfirm) onConfirm();
  };
  cancelBtn.onclick = () => {
    modal.classList.remove('visible');
    cancelBtn.style.display = 'none';
    setTimeout(() => modal.style.display = 'none', 200);
  };
}

// ═════════════════════════════════════════════════════════════
// Sounds
// ═════════════════════════════════════════════════════════════

function playSentSound() {
  try {
    if (!sentAudio) {
      sentAudio = new Audio('/assets/sounds/sent.mp3');
      sentAudio.volume = 0.3;
    }
    sentAudio.currentTime = 0;
    sentAudio.play().catch(() => {});
  } catch (e) {}
}
function playReceivedSound() {
  try {
    if (!receivedAudio) {
      receivedAudio = new Audio('/assets/sounds/receive.mp3');
      receivedAudio.volume = 0.3;
    }
    receivedAudio.currentTime = 0;
    receivedAudio.play().catch(() => {});
  } catch (e) {}
}

// ═════════════════════════════════════════════════════════════
// Scroll
// ═════════════════════════════════════════════════════════════

function scrollToBottom() {
  const c = document.getElementById('messagesContainer');
  if (c) c.scrollTop = c.scrollHeight;
}
function forceScrollToBottom() {
  const c = document.getElementById('messagesContainer');
  if (!c) return;
  c.scrollTop = c.scrollHeight;
  setTimeout(() => { c.scrollTop = c.scrollHeight; }, 50);
}

// ═════════════════════════════════════════════════════════════
// Typing indicator
// ═════════════════════════════════════════════════════════════

function setupTypingIndicator() {
  if (!document.getElementById('typingIndicator')) {
    const indicator = document.createElement('div');
    indicator.id = 'typingIndicator';
    indicator.className = 'typing-indicator';
    indicator.innerHTML = `
      <div class="typing-dots"><div></div><div></div><div></div></div>
      <span id="typingText">${chatFriend?.username || 'Friend'} is typing...</span>
    `;
    indicator.style.display = 'none';
    const mc = document.getElementById('messagesContainer');
    if (mc) mc.appendChild(indicator);
  }
}

function showTypingIndicator(show) {
  const indicator = document.getElementById('typingIndicator');
  if (!indicator) return;
  if (show) { indicator.style.display = 'flex'; forceScrollToBottom(); }
  else { indicator.style.display = 'none'; }
}

// ═════════════════════════════════════════════════════════════
// Status header
// ═════════════════════════════════════════════════════════════

function updateFriendStatus(status, lastSeen) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  if (!dot || !text) return;
  const profile = { status, last_seen: lastSeen };
  const online = isUserOnline(profile);
  if (online) {
    dot.className = 'status-dot';
    text.textContent = 'Online';
  } else {
    dot.className = 'status-dot offline';
    text.textContent = lastSeen ? `Last seen ${formatLastSeen(lastSeen)}` : 'Offline';
  }
}

// ═════════════════════════════════════════════════════════════
// Message rendering
// ═════════════════════════════════════════════════════════════

function isDeletedMessage(msg) {
  if (!msg) return false;
  if (msg.deleted === true || msg.deleted_at) return true;
  if (typeof msg.content === 'string' && msg.content === '__DELETED__') return true;
  return false;
}
function isCallMessage(msg) { return msg && msg.message_type === 'call'; }
function isAudioMessage(msg) {
  if (isDeletedMessage(msg)) return false;
  return msg && (msg.message_type === 'audio' || !!msg.audio_url);
}

function renderSingleMessage(msg, isSent, time) {
  if (isCallMessage(msg)) {
    return `
      <div class="message ${isSent ? 'sent' : 'received'} call-message" data-message-id="${msg.id}">
        <div class="call-message-body">
          <span class="call-icon" aria-hidden="true">${ICONS.phone}</span>
          <div class="call-info">
            <span class="call-label">Phone Call</span>
            <span class="call-sub">${time}</span>
          </div>
        </div>
      </div>
    `;
  }

  if (isDeletedMessage(msg)) {
    return `
      <div class="message ${isSent ? 'sent' : 'received'} deleted-message" data-message-id="${msg.id}">
        <div class="message-content deleted-content">
          <svg class="deleted-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          <span>This message was deleted</span>
        </div>
        <div class="message-time">${time}</div>
      </div>
    `;
  }

  if (isAudioMessage(msg)) {
    const url = escapeAttr(msg.audio_url || '');
    const durationMs = Number(msg.audio_duration_ms || 0);
    const durationLabel = formatDuration(durationMs);
    const seed = String(msg.id || '0');
    const bars = [];
    for (let i = 0; i < 32; i++) {
      const code = seed.charCodeAt(i % seed.length) || 50;
      const h = 6 + ((code * (i + 7)) % 20);
      bars.push(`<div class="bar" style="height:${h}px;"></div>`);
    }
    return `
      <div class="message ${isSent ? 'sent' : 'received'} audio-message" data-message-id="${msg.id}">
        <div class="audio-bubble" data-audio-url="${url}" data-audio-duration="${durationMs}">
          <button class="audio-play-btn" data-action="audio-toggle" aria-label="Play voice message">${ICONS.play}</button>
          <div class="audio-body">
            <div class="audio-waveform">${bars.join('')}</div>
            <div class="audio-meta">
              <span class="audio-duration">${durationLabel}</span>
              <span class="audio-time">${time}</span>
            </div>
          </div>
          <audio preload="none" src="${url}"></audio>
        </div>
      </div>
    `;
  }

  const color = msg.color || null;
  const colorAttr = color ? `data-color="${color}"` : '';
  const editedMark = msg.edited_at ? '<span class="edited-mark"> (edited)</span>' : '';

  if (msg.image_url) {
    return createImageMessageHTML(msg, isSent, colorAttr, time);
  }

  return `
    <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${msg.id}" ${colorAttr}>
      <div class="message-content">${escapeHtml(msg.content || '')}</div>
      <div class="message-time">${time}${editedMark}</div>
    </div>
  `;
}

function renderReactionPills(messageId) {
  const msg = currentMessages.find(m => m.id === messageId);
  if (msg && (isDeletedMessage(msg) || isCallMessage(msg) || isAudioMessage(msg))) return '';

  const reactions = messageReactions[messageId] || [];
  if (reactions.length === 0) return '';

  const grouped = {};
  reactions.forEach(r => { grouped[r.emoji] = (grouped[r.emoji] || 0) + 1; });
  const myEmoji = reactions.find(r => r.user_id === currentUser.id)?.emoji;

  const pills = Object.entries(grouped).map(([emoji, count]) => {
    const isMine = emoji === myEmoji;
    return `
      <button class="reaction-pill ${isMine ? 'mine' : ''}" data-emoji="${emoji}" data-message-id="${messageId}">
        <span class="reaction-emoji">${emoji}</span>
        ${count > 1 ? `<span class="reaction-count">${count}</span>` : ''}
      </button>
    `;
  }).join('');

  return `<div class="reaction-pills" data-reactions-for="${messageId}">${pills}</div>`;
}

function updateReactionPills(messageId) {
  const wrap = document.querySelector(`.message-wrap[data-wrap-id="${messageId}"]`);
  if (!wrap) return;
  const oldPills = wrap.querySelector('.reaction-pills');
  const newHTML = renderReactionPills(messageId);
  if (oldPills) {
    if (newHTML) oldPills.outerHTML = newHTML;
    else oldPills.remove();
  } else if (newHTML) {
    wrap.insertAdjacentHTML('beforeend', newHTML);
  }
}

function showMessages(messages) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  if (!messages || messages.length === 0) {
    container.innerHTML = `
      <div class="empty-chat">
        <svg class="empty-chat-icon" viewBox="0 0 24 24">
          <path d="M20,2H4A2,2 0 0,0 2,4V22L6,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2Z"/>
        </svg>
        <h3>No messages yet</h3>
        <p style="margin-top: 10px;">Say hello to start the conversation!</p>
      </div>
    `;
    return;
  }
  let html = '';
  let lastDate = '';
  messages.forEach(msg => {
    const isSent = msg.sender_id === currentUser.id;
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = new Date(msg.created_at).toLocaleDateString();
    if (date !== lastDate) {
      html += `<div class="date-separator"><span>${date}</span></div>`;
      lastDate = date;
    }
    const pills = (isCallMessage(msg) || isAudioMessage(msg)) ? '' : renderReactionPills(msg.id);
    html += `<div class="message-wrap ${isSent ? 'sent' : 'received'}" data-wrap-id="${msg.id}">${renderSingleMessage(msg, isSent, time)}${pills}</div>`;
  });
  container.innerHTML = html;
  setupTypingIndicator();
  setTimeout(() => forceScrollToBottom(), 50);
}

function addMessageToUI(message, isFromRealtime = false) {
  const container = document.getElementById('messagesContainer');
  if (!container || !message) return;
  if (container.querySelector('.empty-chat')) container.innerHTML = '';

  const isSent = message.sender_id === currentUser.id;
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const typingIndicator = document.getElementById('typingIndicator');
  if (typingIndicator) typingIndicator.remove();

  const wrap = document.createElement('div');
  wrap.className = `message-wrap ${isSent ? 'sent' : 'received'}`;
  wrap.dataset.wrapId = message.id;
  const pills = (isCallMessage(message) || isAudioMessage(message)) ? '' : renderReactionPills(message.id);
  wrap.innerHTML = renderSingleMessage(message, isSent, time) + pills;
  container.appendChild(wrap);
  setupTypingIndicator();

  if (!currentMessages.some(m => m.id === message.id)) {
    currentMessages.push(message);
  }

  const bubble = wrap.querySelector('.message');
  if (bubble && isFromRealtime) {
    bubble.style.opacity = '0';
    bubble.style.transform = 'translateY(10px)';
    setTimeout(() => {
      bubble.style.transition = 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)';
      bubble.style.opacity = '1';
      bubble.style.transform = 'translateY(0)';
    }, 10);
  }

  setTimeout(() => forceScrollToBottom(), 10);

  if (!isSent && !isCallMessage(message) && message.sender_id === chatFriend.id) {
    window.supabase.rpc('mark_messages_as_read', { p_sender_id: chatFriend.id })
      .then(() => {}).catch(() => {});
  }

  if (message.sender_id === chatFriend.id && !isCallMessage(message)) {
    playReceivedSound();
    if (!document.hasFocus()) {
      const originalTitle = document.title;
      document.title = '💬 ' + chatFriend.username;
      setTimeout(() => document.title = originalTitle, 800);
    }
  }
}

function refreshMessageBubble(messageId) {
  const msg = currentMessages.find(m => m.id === messageId);
  const wrap = document.querySelector(`.message-wrap[data-wrap-id="${messageId}"]`);
  if (!msg || !wrap) return;
  const isSent = msg.sender_id === currentUser.id;
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const bubbleHTML = renderSingleMessage(msg, isSent, time);
  const oldBubble = wrap.querySelector('.message');
  if (oldBubble) oldBubble.outerHTML = bubbleHTML;
  else wrap.insertAdjacentHTML('afterbegin', bubbleHTML);

  if (isDeletedMessage(msg) || isCallMessage(msg) || isAudioMessage(msg)) {
    const pills = wrap.querySelector('.reaction-pills');
    if (pills) pills.remove();
  }
}

// ═════════════════════════════════════════════════════════════
// Audio message playback
// ═════════════════════════════════════════════════════════════

function setBtnIcon(btn, svg) { if (btn) btn.innerHTML = svg; }
function setBtnSpinner(btn) {
  if (btn) btn.innerHTML = '<span class="audio-spinner"></span>';
}

function clearPlayingWaveform(audioEl) {
  const bubble = audioEl.closest('.audio-bubble');
  if (!bubble) return;
  bubble.querySelectorAll('.audio-waveform .bar').forEach(b => b.classList.remove('played'));
}

function updatePlayingWaveform(audioEl, bubble) {
  const dur = audioEl.duration;
  if (!dur || !isFinite(dur)) return;
  const frac = Math.min(1, audioEl.currentTime / dur);
  const bars = bubble.querySelectorAll('.audio-waveform .bar');
  const upTo = Math.floor(frac * bars.length);
  bars.forEach((b, i) => b.classList.toggle('played', i < upTo));
}

function handleAudioToggle(btn) {
  const bubble = btn.closest('.audio-bubble');
  if (!bubble) return;
  const audioEl = bubble.querySelector('audio');
  if (!audioEl) return;

  if (currentlyPlayingAudio && currentlyPlayingAudio !== audioEl) {
    try { currentlyPlayingAudio.pause(); currentlyPlayingAudio.currentTime = 0; } catch (e) {}
    if (currentlyPlayingBtn) setBtnIcon(currentlyPlayingBtn, ICONS.play);
    clearPlayingWaveform(currentlyPlayingAudio);
  }

  if (!audioEl.paused && !audioEl.ended) {
    audioEl.pause();
    setBtnIcon(btn, ICONS.play);
    if (currentlyPlayingAudio === audioEl) {
      currentlyPlayingAudio = null;
      currentlyPlayingBtn = null;
    }
    return;
  }

  currentlyPlayingAudio = audioEl;
  currentlyPlayingBtn = btn;

  if (audioEl.readyState < 3) {
    setBtnSpinner(btn);
    btn.classList.add('loading');
  } else {
    setBtnIcon(btn, ICONS.pause);
  }

  const onPlaying = () => { btn.classList.remove('loading'); setBtnIcon(btn, ICONS.pause); };
  const onWaiting = () => { setBtnSpinner(btn); btn.classList.add('loading'); };
  const onEnded = () => {
    btn.classList.remove('loading');
    setBtnIcon(btn, ICONS.play);
    clearPlayingWaveform(audioEl);
    if (currentlyPlayingAudio === audioEl) { currentlyPlayingAudio = null; currentlyPlayingBtn = null; }
    cleanup();
  };
  const onError = () => {
    btn.classList.remove('loading');
    setBtnIcon(btn, ICONS.play);
    clearPlayingWaveform(audioEl);
    showToast('Could not play audio', '❌', 1500);
    if (currentlyPlayingAudio === audioEl) { currentlyPlayingAudio = null; currentlyPlayingBtn = null; }
    cleanup();
  };
  const cleanup = () => {
    audioEl.removeEventListener('playing', onPlaying);
    audioEl.removeEventListener('waiting', onWaiting);
    audioEl.removeEventListener('ended', onEnded);
    audioEl.removeEventListener('error', onError);
  };

  audioEl.addEventListener('playing', onPlaying);
  audioEl.addEventListener('waiting', onWaiting);
  audioEl.addEventListener('ended', onEnded);
  audioEl.addEventListener('error', onError);
  audioEl.ontimeupdate = () => updatePlayingWaveform(audioEl, bubble);
  audioEl.play().catch(onError);
}

// ═════════════════════════════════════════════════════════════
// Long press / action bar
// ═════════════════════════════════════════════════════════════

function setupLongPressHandlers() {
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  const sig = abortController.signal;

  container.addEventListener('touchstart', handlePressStart, { passive: true, signal: sig });
  container.addEventListener('touchend', handlePressEnd, { signal: sig });
  container.addEventListener('touchmove', handlePressCancel, { passive: true, signal: sig });
  container.addEventListener('mousedown', handlePressStart, { signal: sig });
  container.addEventListener('mouseup', handlePressEnd, { signal: sig });
  container.addEventListener('mouseleave', handlePressCancel, { signal: sig });

  container.addEventListener('contextmenu', (e) => {
    const wrap = e.target.closest('.message-wrap');
    if (wrap) { e.preventDefault(); openActionBar(wrap); }
  }, { signal: sig });

  container.addEventListener('click', (e) => {
    const pill = e.target.closest('.reaction-pill');
    if (pill) {
      e.stopPropagation();
      toggleReaction(parseInt(pill.dataset.messageId), pill.dataset.emoji);
      return;
    }
    const audioToggle = e.target.closest('[data-action="audio-toggle"]');
    if (audioToggle) { e.stopPropagation(); handleAudioToggle(audioToggle); return; }
  }, { signal: sig });
}

function handlePressStart(e) {
  const wrap = e.target.closest('.message-wrap');
  if (!wrap) return;
  if (e.target.closest('.reaction-pill')) return;
  if (e.target.closest('.message-image-container')) return;
  if (e.target.closest('.quick-reaction-bar')) return;
  if (e.target.closest('.audio-play-btn')) return;
  if (wrap.querySelector('.call-message')) return;

  longPressTarget = wrap;
  longPressTimer = setTimeout(() => {
    if (longPressTarget === wrap) {
      openActionBar(wrap);
      if (navigator.vibrate) navigator.vibrate(25);
    }
  }, 420);
}
function handlePressEnd() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  longPressTarget = null;
}
function handlePressCancel() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  longPressTarget = null;
}

function openActionBar(wrap) {
  const messageId = parseInt(wrap.dataset.wrapId);
  const msg = currentMessages.find(m => m.id === messageId);
  if (msg && isDeletedMessage(msg)) { showToast('This message was deleted', '🚫', 1500); return; }
  if (msg && isCallMessage(msg)) return;
  if (selectedMessageId === messageId && quickBarElement) return;

  closeQuickBar();
  if (selectedMessageEl) selectedMessageEl.classList.remove('selected');

  selectedMessageId = messageId;
  selectedMessageEl = wrap;
  justOpenedAt = Date.now() + 500;

  wrap.classList.add('selected');
  document.body.classList.add('selection-active');
  buildQuickBar(wrap);
}

function buildQuickBar(wrap) {
  closeQuickBar();
  const messageId = parseInt(wrap.dataset.wrapId);
  const msg = currentMessages.find(m => m.id === messageId);
  if (!msg) return;

  const isMine = msg.sender_id === currentUser.id;
  const isImage = !!msg.image_url;
  const isAudio = isAudioMessage(msg);
  const isText = !isImage && !isAudio && (msg.content || '').trim().length > 0;
  const myEmoji = (messageReactions[messageId] || []).find(r => r.user_id === currentUser.id)?.emoji;

  const editBtnHTML = (isMine && isText) ? `<button class="action-btn-icon" data-action="edit" title="Edit">${ICONS.edit}</button>` : '';
  const deleteBtnHTML = isMine ? `<button class="action-btn-icon action-btn-danger" data-action="delete" title="Delete">${ICONS.trash}</button>` : '';
  const copyBtnHTML = (isImage || isAudio) ? '' : `<button class="action-btn-icon" data-action="copy" title="Copy">${ICONS.copy}</button>`;

  const reactHTML = isAudio ? '' : `
    <div class="action-bar-row action-bar-emojis">
      ${QUICK_REACTIONS.map(e => `<button class="quick-emoji ${myEmoji === e ? 'selected' : ''}" data-emoji="${e}">${e}</button>`).join('')}
      <button class="quick-emoji quick-more" data-action="more">＋</button>
    </div>
  `;

  quickBarElement = document.createElement('div');
  quickBarElement.className = 'quick-reaction-bar';
  quickBarElement.id = 'quickReactionBar';
  quickBarElement.innerHTML = `
    <div class="action-bar-row action-bar-top">
      ${copyBtnHTML}${editBtnHTML}${deleteBtnHTML}
      <div class="action-bar-spacer"></div>
      <button class="action-btn-icon action-btn-close" data-action="close" title="Close">${ICONS.close}</button>
    </div>
    ${reactHTML}
  `;

  wrap.appendChild(quickBarElement);
  requestAnimationFrame(() => quickBarElement.classList.add('visible'));

  quickBarElement.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'copy') handleCopy();
      else if (action === 'edit') handleEdit();
      else if (action === 'delete') handleDelete();
      else if (action === 'close') closeAll();
      else if (action === 'more') openEmojiGridForSelected();
    });
  });

  quickBarElement.querySelectorAll('.quick-emoji').forEach(btn => {
    if (btn.dataset.action) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleReaction(messageId, btn.dataset.emoji);
      closeAll();
    });
  });
}

function closeQuickBar() {
  if (quickBarElement) {
    quickBarElement.classList.remove('visible');
    const el = quickBarElement;
    quickBarElement = null;
    setTimeout(() => el.remove(), 180);
  }
}
function closeAll() {
  if (selectedMessageEl) selectedMessageEl.classList.remove('selected');
  selectedMessageId = null;
  selectedMessageEl = null;
  document.body.classList.remove('selection-active');
  closeQuickBar();
}

function setupGlobalDismiss() {
  const sig = abortController.signal;
  document.addEventListener('pointerdown', (e) => {
    if (!selectedMessageId) return;
    if (Date.now() < justOpenedAt) return;
    if (quickBarElement && quickBarElement.contains(e.target)) return;
    if (selectedMessageEl && selectedMessageEl.contains(e.target)) return;
    if (e.target.closest('.reaction-pill')) return;
    closeAll();
  }, { capture: true, signal: sig });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selectedMessageId) closeAll();
  }, { signal: sig });
}

async function handleCopy() {
  if (!selectedMessageId) return;
  const msg = currentMessages.find(m => m.id === selectedMessageId);
  if (!msg) return;
  if (msg.image_url || isAudioMessage(msg)) { closeAll(); return; }
  try {
    const text = (msg.content || '').trim();
    if (!text) { showToast('Nothing to copy', '⚠️', 1500); closeAll(); return; }
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard', '📋', 1500);
  } catch (e) { showToast('Could not copy', '❌', 1500); }
  closeAll();
}

function handleEdit() {
  if (!selectedMessageId) return;
  const msg = currentMessages.find(m => m.id === selectedMessageId);
  if (!msg || msg.sender_id !== currentUser.id) return;
  if (msg.image_url || isAudioMessage(msg)) return;
  if (isDeletedMessage(msg) || isCallMessage(msg)) return;
  const msgId = msg.id;
  closeAll();
  setTimeout(() => showEditModal(msgId), 220);
}

function handleDelete() {
  if (!selectedMessageId) return;
  const msg = currentMessages.find(m => m.id === selectedMessageId);
  if (!msg || msg.sender_id !== currentUser.id) return;
  const msgId = msg.id;
  closeAll();
  setTimeout(() => {
    showConfirmAlert('Delete this message?', '🗑️', 'Delete Message', async () => {
      await performDelete(msgId);
    });
  }, 220);
}

async function performDelete(msgId) {
  try {
    const deletedAt = new Date().toISOString();
    await window.supabase.from('message_reactions').delete().eq('message_id', msgId);

    const updatePayload = {
      content: '__DELETED__', image_url: null, thumbnail_url: null,
      audio_url: null, audio_duration_ms: null, color: null, edited_at: deletedAt
    };

    let { error } = await window.supabase.from('direct_messages').update(updatePayload).eq('id', msgId);
    if (!error) {
      await window.supabase.from('direct_messages').update({ deleted: true }).eq('id', msgId)
        .then(() => {}).catch(() => {});
    }

    if (error) {
      const { error: delErr } = await window.supabase.from('direct_messages').delete().eq('id', msgId);
      if (delErr) throw delErr;
      currentMessages = currentMessages.filter(m => m.id !== msgId);
      delete messageReactions[msgId];
      const wrap = document.querySelector(`.message-wrap[data-wrap-id="${msgId}"]`);
      if (wrap) { wrap.classList.add('removing'); setTimeout(() => wrap.remove(), 220); }
      showToast('Message deleted', '✅', 1500);
      return;
    }

    const idx = currentMessages.findIndex(m => m.id === msgId);
    if (idx >= 0) {
      currentMessages[idx] = {
        ...currentMessages[idx], content: '__DELETED__', image_url: null,
        thumbnail_url: null, audio_url: null, audio_duration_ms: null,
        color: null, edited_at: deletedAt
      };
    }
    delete messageReactions[msgId];
    refreshMessageBubble(msgId);
    showToast('Message deleted', '✅', 1500);
  } catch (error) {
    showToast('Could not delete message', '❌', 1500);
  }
}

function showEditModal(msgId) {
  const msg = currentMessages.find(m => m.id === msgId);
  if (!msg) return;

  const modal = document.createElement('div');
  modal.className = 'edit-modal-overlay';
  modal.id = 'editModalOverlay';
  modal.innerHTML = `
    <div class="edit-modal-panel">
      <div class="edit-modal-header">
        <h3>Edit message</h3>
        <button class="edit-modal-close" id="editModalClose">×</button>
      </div>
      <textarea class="edit-modal-input" id="editModalInput" rows="4">${escapeHtml(msg.content || '')}</textarea>
      <div class="edit-modal-actions">
        <button class="btn-secondary" id="editModalCancel">Cancel</button>
        <button class="btn-primary" id="editModalSave">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('visible'));

  const input = document.getElementById('editModalInput');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  const close = () => { modal.classList.remove('visible'); setTimeout(() => modal.remove(), 220); };

  document.getElementById('editModalClose').onclick = close;
  document.getElementById('editModalCancel').onclick = close;

  document.getElementById('editModalSave').onclick = async () => {
    const newText = input.value.trim();
    if (!newText) { showToast('Message cannot be empty', '⚠️', 1500); return; }
    if (newText === msg.content) { close(); return; }
    try {
      const editedAt = new Date().toISOString();
      const { error } = await window.supabase.from('direct_messages')
        .update({ content: newText, edited_at: editedAt }).eq('id', msg.id);
      if (error) throw error;
      msg.content = newText;
      msg.edited_at = editedAt;
      refreshMessageBubble(msg.id);
      showToast('Message updated', '✅', 1500);
      close();
    } catch (error) { showToast('Could not edit message', '❌', 1500); }
  };
}

function openEmojiGridForSelected() {
  if (!selectedMessageId) return;
  const messageId = selectedMessageId;
  const modal = document.createElement('div');
  modal.className = 'emoji-picker-overlay';
  modal.id = 'emojiPickerOverlay';
  modal.innerHTML = `
    <div class="emoji-picker-panel">
      <div class="emoji-picker-header">
        <span>Choose a reaction</span>
        <button class="emoji-picker-close">×</button>
      </div>
      <div class="emoji-picker-grid">
        ${PICKER_EMOJIS.map(e => `<button class="emoji-cell" data-emoji="${e}">${e}</button>`).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('visible'));
  const close = () => { modal.classList.remove('visible'); setTimeout(() => modal.remove(), 220); };
  modal.querySelector('.emoji-picker-close').onclick = close;
  modal.querySelectorAll('.emoji-cell').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleReaction(messageId, btn.dataset.emoji);
      close();
      closeAll();
    });
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}

async function toggleReaction(messageId, emoji) {
  const target = currentMessages.find(m => m.id === messageId);
  if (target && (isDeletedMessage(target) || isCallMessage(target) || isAudioMessage(target))) {
    showToast('Cannot react to this message', '⚠️', 1500);
    return;
  }
  try {
    const existing = (messageReactions[messageId] || []).find(r => r.user_id === currentUser.id);
    if (existing && existing.emoji === emoji) {
      const { error } = await window.supabase.from('message_reactions')
        .delete().eq('message_id', messageId).eq('user_id', currentUser.id);
      if (error) throw error;
      messageReactions[messageId] = messageReactions[messageId].filter(r => r.user_id !== currentUser.id);
    } else if (existing) {
      const { error } = await window.supabase.from('message_reactions')
        .update({ emoji, updated_at: new Date().toISOString() })
        .eq('message_id', messageId).eq('user_id', currentUser.id);
      if (error) throw error;
      existing.emoji = emoji;
    } else {
      const { error } = await window.supabase.from('message_reactions')
        .insert({ message_id: messageId, user_id: currentUser.id, emoji });
      if (error) throw error;
      if (!messageReactions[messageId]) messageReactions[messageId] = [];
      messageReactions[messageId].push({ user_id: currentUser.id, emoji });
    }
    updateReactionPills(messageId);
  } catch (error) {
    showToast('Could not save reaction', '❌', 1500);
  }
}

// ═════════════════════════════════════════════════════════════
// Send / load messages
// ═════════════════════════════════════════════════════════════

async function sendMessage() {
  if (isSending) return;
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (text === '/' || colorPickerVisible === true) {
    if (text === '/') { input.value = ''; autoResize(input); }
    return;
  }
  if (!text || !chatFriend) { showToast('Please type a message!', '⚠️', 1500); return; }

  isSending = true;
  const sendBtn = document.getElementById('sendBtn');
  try {
    if (sendBtn) sendBtn.disabled = true;
    const messageData = {
      sender_id: currentUser.id, receiver_id: chatFriend.id, content: text,
      chat_id: chatFriend.id, created_at: new Date().toISOString(),
      read: false, message_type: 'text'
    };
    if (selectedColor) { messageData.color = selectedColor; selectedColor = null; }

    const { data, error } = await window.supabase.from('direct_messages')
      .insert(messageData).select().single();
    if (error) throw error;
    if (!currentMessages.some(m => m.id === data.id)) currentMessages.push(data);
    addMessageToUI(data, false);

    playSentSound();
    input.value = '';
    autoResize(input);
    input.focus({ preventScroll: true });

    isTyping = false;
    if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
    sendTypingStatus(false);
  } catch (error) {
    showToast('Failed to send message', '❌', 2000);
  } finally {
    isSending = false;
    if (sendBtn) sendBtn.disabled = false;
  }
}

async function loadOldMessages(friendId) {
  if (isLoadingMessages) return;
  isLoadingMessages = true;
  try {
    const { data: messages, error } = await window.supabase
      .from('direct_messages').select('*')
      .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`)
      .order('created_at', { ascending: true });
    if (error) throw error;

    currentMessages = messages || [];
    await loadReactionsForMessages(
      currentMessages.filter(m => m.message_type !== 'call').map(m => m.id)
    );
    showMessages(currentMessages);
    await markMessagesAsRead(friendId);
  } catch (error) {
    showMessages([]);
  } finally {
    isLoadingMessages = false;
  }
}

async function markMessagesAsRead(friendId) {
  if (!friendId || !currentUser) return;
  try {
    await window.supabase.rpc('mark_messages_as_read', { p_sender_id: friendId });
  } catch (e) {}
}

async function loadReactionsForMessages(messageIds) {
  messageReactions = {};
  if (!messageIds || messageIds.length === 0) return;
  try {
    const { data: reactions, error } = await window.supabase
      .from('message_reactions').select('message_id, user_id, emoji')
      .in('message_id', messageIds);
    if (error) throw error;
    (reactions || []).forEach(r => {
      if (!messageReactions[r.message_id]) messageReactions[r.message_id] = [];
      messageReactions[r.message_id].push({ user_id: r.user_id, emoji: r.emoji });
    });
  } catch (e) {}
}

async function sendVoiceMessage(audioUrl, durationMs) {
  if (!chatFriend || !currentUser) { showToast('Chat not ready', '⚠️', 2000); throw new Error('Missing chat context'); }
  const messageData = {
    sender_id: currentUser.id, receiver_id: chatFriend.id, content: '',
    chat_id: chatFriend.id, created_at: new Date().toISOString(),
    read: false, message_type: 'audio',
    audio_url: audioUrl, audio_duration_ms: Math.round(durationMs || 0)
  };
  const { data, error } = await window.supabase.from('direct_messages')
    .insert(messageData).select().single();
  if (error) throw error;
  if (!currentMessages.some(m => m.id === data.id)) currentMessages.push(data);
  addMessageToUI(data, false);
  playSentSound();
  forceScrollToBottom();
  isTyping = false;
  if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
  sendTypingStatus(false);
}

// ═════════════════════════════════════════════════════════════
// Typing
// ═════════════════════════════════════════════════════════════

function setupTypingListener() {
  const input = document.getElementById('messageInput');
  if (!input) return;
  input.addEventListener('input', handleTyping, { signal: abortController.signal });
}

function handleTyping() {
  if (!chatFriend || !currentUser) return;
  if (!isTyping) { isTyping = true; sendTypingStatus(true); }
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
    sendTypingStatus(false);
    typingTimeout = null;
  }, 2000);
}

async function sendTypingStatus(typing) {
  if (!chatFriend || !currentUser) return;
  try {
    const userIds = [currentUser.id, chatFriend.id].sort();
    const ch = window.supabase.channel(`typing:${userIds[0]}:${userIds[1]}`);
    await ch.subscribe();
    await ch.send({ type: 'broadcast', event: 'typing', payload: { userId: currentUser.id, isTyping: typing } });
    setTimeout(() => window.supabase.removeChannel(ch), 5000);
  } catch (e) {}
}

function setupTypingReceiver(friendId) {
  if (typingChannel) { window.supabase.removeChannel(typingChannel); typingChannel = null; }
  const userIds = [currentUser.id, friendId].sort();
  typingChannel = window.supabase.channel(`typing:${userIds[0]}:${userIds[1]}`)
    .on('broadcast', { event: 'typing' }, (payload) => {
      if (payload.payload?.userId === friendId) {
        if (payload.payload.isTyping) {
          const text = document.getElementById('typingText');
          if (text && chatFriend) text.textContent = `${chatFriend.username} is typing...`;
          showTypingIndicator(true);
          if (friendTypingTimeout) clearTimeout(friendTypingTimeout);
          friendTypingTimeout = setTimeout(() => showTypingIndicator(false), 3000);
        } else { showTypingIndicator(false); }
      }
    })
    .subscribe();
}

// ═════════════════════════════════════════════════════════════
// Input helpers
// ═════════════════════════════════════════════════════════════

function handleKeyPress(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    if (input) {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const value = input.value;
      input.value = value.slice(0, start) + '\n' + value.slice(end);
      input.selectionStart = input.selectionEnd = start + 1;
      autoResize(input);
    }
  }
}

function autoResize(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) sendBtn.disabled = textarea.value.trim() === '';
}

// ═════════════════════════════════════════════════════════════
// Realtime
// ═════════════════════════════════════════════════════════════

function setupRealtime(friendId) {
  const userIds = [currentUser.id, friendId].sort();
  const channelName = `chat:${userIds[0]}:${userIds[1]}`;

  [chatChannel, statusChannel, typingChannel, reactionsChannel].forEach(ch => {
    if (ch) window.supabase.removeChannel(ch);
  });
  chatChannel = statusChannel = typingChannel = reactionsChannel = null;

  chatChannel = window.supabase.channel(channelName)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (payload) => {
      const newMsg = payload.new;
      const isOurs = (newMsg.sender_id === currentUser.id && newMsg.receiver_id === friendId) ||
                     (newMsg.sender_id === friendId && newMsg.receiver_id === currentUser.id);
      if (!isOurs) return;
      if (document.querySelector(`[data-message-id="${newMsg.id}"]`)) return;
      if (!currentMessages.some(m => m.id === newMsg.id)) currentMessages.push(newMsg);
      addMessageToUI(newMsg, true);
      if (newMsg.receiver_id === currentUser.id && newMsg.message_type !== 'call') {
        window.supabase.rpc('mark_messages_as_read', { p_sender_id: newMsg.sender_id })
          .then(() => {}).catch(() => {});
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages' }, (payload) => {
      const updated = payload.new;
      const idx = currentMessages.findIndex(m => m.id === updated.id);
      if (idx >= 0) currentMessages[idx] = { ...currentMessages[idx], ...updated };
      if (isDeletedMessage(updated)) delete messageReactions[updated.id];
      refreshMessageBubble(updated.id);
      if (!isCallMessage(updated) && !isAudioMessage(updated)) updateReactionPills(updated.id);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'direct_messages' }, (payload) => {
      const deleted = payload.old;
      if (!deleted?.id) return;
      const wrap = document.querySelector(`.message-wrap[data-wrap-id="${deleted.id}"]`);
      if (wrap) { wrap.classList.add('removing'); setTimeout(() => wrap.remove(), 220); }
      currentMessages = currentMessages.filter(m => m.id !== deleted.id);
      delete messageReactions[deleted.id];
    })
    .subscribe();

  statusChannel = window.supabase.channel(`status:${friendId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${friendId}` }, (payload) => {
      if (payload.new.id === friendId && chatFriend) {
        chatFriend.status = payload.new.status;
        chatFriend.last_seen = payload.new.last_seen || chatFriend.last_seen;
        updateFriendStatus(payload.new.status, payload.new.last_seen);
        if (payload.new.avatar_url && payload.new.avatar_url !== chatFriend.avatar_url) {
          chatFriend.avatar_url = payload.new.avatar_url;
          const el = document.getElementById('chatUserAvatar');
          if (el) el.innerHTML = `<img src="${payload.new.avatar_url}" alt="${chatFriend.username}">`;
        }
      }
    })
    .subscribe();

  reactionsChannel = window.supabase.channel(`reactions:${userIds[0]}:${userIds[1]}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' },
      (payload) => handleReactionChange(payload.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_reactions' },
      (payload) => handleReactionChange(payload.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' },
      (payload) => handleReactionDelete(payload.old))
    .subscribe();

  setupCallsListener(friendId);
}

function handleReactionChange(row) {
  const messageId = row.message_id;
  const msg = currentMessages.find(m => m.id === messageId);
  if (msg && (isDeletedMessage(msg) || isCallMessage(msg) || isAudioMessage(msg))) return;
  if (!document.querySelector(`[data-message-id="${messageId}"]`)) return;
  if (!messageReactions[messageId]) messageReactions[messageId] = [];
  messageReactions[messageId] = messageReactions[messageId].filter(r => r.user_id !== row.user_id);
  messageReactions[messageId].push({ user_id: row.user_id, emoji: row.emoji });
  updateReactionPills(messageId);
}

function handleReactionDelete(row) {
  const messageId = row.message_id;
  if (!messageReactions[messageId]) return;
  messageReactions[messageId] = messageReactions[messageId].filter(r => r.user_id !== row.user_id);
  updateReactionPills(messageId);
}

function setupCallsListener(friendId) {
  if (callsChannel) { window.supabase.removeChannel(callsChannel); callsChannel = null; }
  callsChannel = window.supabase.channel(`calls-chat:${currentUser.id}:${friendId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, (payload) => {
      const call = payload.new;
      if (!call) return;
      if (!isOurCall(call, friendId)) return;
      if (call.caller_id !== currentUser.id) return;
      insertCallEventMessage(call);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls' }, (payload) => {
      const call = payload.new;
      if (!call) return;
      if (!isOurCall(call, friendId)) return;
      if (call.caller_id !== currentUser.id) return;
      if (hasCallMessage(call.id)) return;
      insertCallEventMessage(call);
    })
    .subscribe();
}

function isOurCall(call, friendId) {
  const me = currentUser.id;
  const a = call.caller_id;
  const b = call.callee_id || call.receiver_id;
  return (a === me && b === friendId) || (a === friendId && b === me);
}

function hasCallMessage(callId) {
  return currentMessages.some(m =>
    m.message_type === 'call' && m.metadata && String(m.metadata.call_id) === String(callId)
  );
}

async function insertCallEventMessage(call) {
  if (!call || !call.id || !currentUser || !chatFriend) return;
  if (call.caller_id !== currentUser.id) return;
  if (hasCallMessage(call.id)) return;
  try {
    const { data: existing } = await window.supabase.from('direct_messages')
      .select('id, metadata').eq('message_type', 'call')
      .contains('metadata', { call_id: call.id }).maybeSingle();
    if (existing) return;
  } catch (e) {}

  const messageData = {
    sender_id: call.caller_id,
    receiver_id: call.callee_id || call.receiver_id,
    content: '', chat_id: chatFriend.id,
    created_at: call.created_at || new Date().toISOString(),
    message_type: 'call', read: true,
    metadata: { call_id: call.id }
  };
  try {
    await window.supabase.from('direct_messages').insert(messageData).select().single();
  } catch (e) {}
}

// ═════════════════════════════════════════════════════════════
// Image handling (from img-handler.js)
// ═════════════════════════════════════════════════════════════

function addColorPickerToDOM() {
  if (document.getElementById('colorPickerOverlay')) return;
  const html = `
    <div class="color-picker-overlay" id="colorPickerOverlay" style="display: none;">
      <div class="color-picker-header">
        <div class="color-picker-title">Choose message color</div>
        <button class="color-picker-close-btn" onclick="cancelColorSelection()" aria-label="Close">×</button>
      </div>
      <div class="color-picker-grid">
        <div class="color-option" data-color="red" onclick="selectColor('red')" aria-label="Red"></div>
        <div class="color-option" data-color="green" onclick="selectColor('green')" aria-label="Green"></div>
        <div class="color-option" data-color="blue" onclick="selectColor('blue')" aria-label="Blue"></div>
        <div class="color-option" data-color="yellow" onclick="selectColor('yellow')" aria-label="Yellow"></div>
        <div class="color-option" data-color="cyan" onclick="selectColor('cyan')" aria-label="Cyan"></div>
        <div class="color-option" data-color="purple" onclick="selectColor('purple')" aria-label="Purple"></div>
        <div class="color-option" data-color="pink" onclick="selectColor('pink')" aria-label="Pink"></div>
        <div class="color-option" data-color="orange" onclick="selectColor('orange')" aria-label="Orange"></div>
        <div class="color-option" data-color="white" onclick="selectColor('white')" aria-label="White"></div>
        <div class="color-option" data-color="black" onclick="selectColor('black')" aria-label="Black"></div>
      </div>
      <div class="color-picker-footer">
        <button class="color-clear-btn" onclick="removeSelectedColor()">Clear Color</button>
      </div>
    </div>
  `;
  const wrapper = document.querySelector('.message-input-wrapper');
  if (wrapper) wrapper.insertAdjacentHTML('beforebegin', html);
  else document.body.insertAdjacentHTML('beforeend', html);
}

function setupColorPickerClickOutside() {
  document.addEventListener('click', (e) => {
    if (!colorPickerVisible) return;
    const picker = document.getElementById('colorPickerOverlay');
    const input = document.getElementById('messageInput');
    if (picker && !picker.contains(e.target) && e.target !== input) cancelColorSelection();
  }, { signal: abortController.signal });
}

function showColorPicker() {
  const picker = document.getElementById('colorPickerOverlay');
  if (!picker) { addColorPickerToDOM(); return setTimeout(showColorPicker, 50); }
  colorPickerVisible = true;
  picker.style.display = 'flex';
  setTimeout(() => picker.style.opacity = '1', 10);
  document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
}
function hideColorPicker() {
  const picker = document.getElementById('colorPickerOverlay');
  if (!picker) return;
  colorPickerVisible = false;
  picker.style.opacity = '0';
  setTimeout(() => picker.style.display = 'none', 150);
}

function setupSlashHandler() {
  const input = document.getElementById('messageInput');
  if (!input) return;
  input.addEventListener('input', (e) => {
    const text = e.target.value;
    if (text === '/' && !colorPickerVisible) showColorPicker();
    else if (colorPickerVisible && text !== '/') hideColorPicker();
  }, { signal: abortController.signal });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && colorPickerVisible) {
      e.preventDefault();
      cancelColorSelection();
    }
  }, { signal: abortController.signal });
}

async function compressImage(file, maxSize = 1024 * 1024) {
  return new Promise((resolve) => {
    if (!file || file.size <= maxSize) return resolve(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let w = img.width, h = img.height;
        const MAX = isMobileChrome() || isIOSChrome() ? 1200 : 1600;
        if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        canvas.width = w; canvas.height = h;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        let quality = isMobileChrome() || isIOSChrome() ? 0.75 : 0.85;
        const tryCompress = () => {
          canvas.toBlob((blob) => {
            if (!blob) return resolve(file);
            if (blob.size <= maxSize || quality <= 0.4) {
              resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
            } else { quality -= 0.1; tryCompress(); }
          }, 'image/jpeg', quality);
        };
        tryCompress();
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

async function uploadImageToImgBB(file) {
  if (!file) throw new Error('No image file');
  const fileCopy = new File([file], file.name, { type: file.type, lastModified: Date.now() });
  let processedFile;
  try { processedFile = await compressImage(fileCopy); } catch (e) { processedFile = fileCopy; }

  const formData = new FormData();
  formData.append('key', IMGBB_API_KEY);
  formData.append('image', processedFile);
  formData.append('name', `relaytalk_${Date.now()}_${file.name.replace(/\s+/g, '_')}`);

  const timeout = isMobileChrome() || isIOSChrome() ? 45000 : 25000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST', body: formData, signal: controller.signal,
    headers: { 'Accept': 'application/json' }, mode: 'cors', credentials: 'omit'
  });
  clearTimeout(timeoutId);

  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Upload failed');
  if (!data.data?.url) throw new Error('No image URL');

  const imageUrl = fixImgBBUrls(data.data.url);
  const thumbnailUrl = fixImgBBUrls(data.data.thumb?.url || data.data.url);
  await sendImageMessage(imageUrl, thumbnailUrl);
}

async function sendImageMessage(imageUrl, thumbnailUrl) {
  if (isSending) return;
  if (!currentUser || !chatFriend) { showToast('Missing user data', '❌'); return; }

  isSending = true;
  try {
    const messageData = {
      sender_id: currentUser.id, receiver_id: chatFriend.id, content: '',
      image_url: imageUrl, thumbnail_url: thumbnailUrl,
      created_at: new Date().toISOString(), message_type: 'image'
    };
    if (selectedColor) { messageData.color = selectedColor; selectedColor = null; }

    const { data, error } = await window.supabase.from('direct_messages')
      .insert(messageData).select().single();
    if (error) throw error;

    playSentSound();
    addMessageToUI(data, false);

    const cam = document.getElementById('cameraInput');
    const gal = document.getElementById('galleryInput');
    if (cam) cam.value = '';
    if (gal) gal.value = '';

    if (isTyping) { isTyping = false; if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; } sendTypingStatus(false); }
    const input = document.getElementById('messageInput');
    if (input) input.focus({ preventScroll: true });
  } catch (error) {
    showToast('Failed to send image', '❌');
  } finally {
    isSending = false;
  }
}

function createImageMessageHTML(msg, isSent, colorAttr, time) {
  let imageUrl = fixImgBBUrls(msg.image_url || '');
  let thumbnailUrl = fixImgBBUrls(msg.thumbnail_url || imageUrl);
  const content = msg.content || '';
  return `
    <div class="message ${isSent ? 'sent' : 'received'} image-message" data-message-id="${msg.id}" ${colorAttr}>
      <div class="message-image-container" onclick="viewImageFullscreen('${imageUrl}')">
        <img src="${thumbnailUrl}" alt="Shared image" class="message-image"
             onload="handleImageLoad(this)" onerror="handleImageError(this, '${imageUrl}')"
             loading="lazy" decoding="async">
        <div class="image-overlay">
          <svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:white;">
            <path d="M21,19V5C21,3.9 20.1,3 19,3H5C3.9,3 3,3.9 3,5V19C3,20.1 3.9,21 5,21H19C20.1,21 21,20.1 21,19M8.5,13.5L11,16.5L14.5,12L19,18H5L8.5,13.5Z"/>
          </svg>
        </div>
      </div>
      ${content ? `<div class="image-caption">${content}</div>` : ''}
      <div class="message-time">${time}</div>
    </div>
  `;
}

function handleImageLoad(img) { img.style.opacity = '1'; img.classList.add('loaded'); }
function handleImageError(img, originalUrl) {
  let fixed = fixImgBBUrls(originalUrl);
  if (fixed !== originalUrl) { img.src = fixed; return; }
  fixed = ensureHttpsUrl(originalUrl);
  if (fixed !== originalUrl) { img.src = fixed; return; }
  img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="%23ccc" d="M21,19V5C21,3.9 20.1,3 19,3H5C3.9,3 3,3.9 3,5V19C3,20.1 3.9,21 5,21H19C20.1,21 21,20.1 21,19M8.5,13.5L11,16.5L14.5,12L19,18H5L8.5,13.5Z"/></svg>';
  img.style.opacity = '1';
  img.classList.add('loaded');
}

function createMultiImagePreview() {
  if (!selectedImages || selectedImages.length === 0) return showToast('No images', '⚠️');
  const file = selectedImages[currentImageIndex];
  const reader = new FileReader();
  reader.onload = (e) => {
    const previewHTML = `
      <div class="image-preview-overlay" id="imagePreviewOverlay">
        <div class="image-preview-container">
          <div class="preview-header">
            <h3>Image Preview</h3>
            <button class="preview-close" onclick="cancelImageUpload()">×</button>
          </div>
          <div class="preview-image-wrapper">
            ${selectedImages.length > 1 ? `<div class="preview-counter">${currentImageIndex + 1}/${selectedImages.length}</div>` : ''}
            <div class="preview-image-container">
              <img src="${e.target.result}" alt="Preview" class="preview-image">
            </div>
            ${selectedImages.length > 1 ? `
              <div style="display:flex;justify-content:space-between;margin-top:15px;">
                <button onclick="prevImage()" class="preview-btn cancel" ${currentImageIndex === 0 ? 'disabled' : ''}>← Previous</button>
                <button onclick="nextImage()" class="preview-btn cancel" ${currentImageIndex === selectedImages.length - 1 ? 'disabled' : ''}>Next →</button>
              </div>
            ` : ''}
          </div>
          <div class="preview-actions">
            <button class="preview-btn cancel" onclick="cancelImageUpload()">Cancel</button>
            <button class="preview-btn send" onclick="uploadImageFromPreview()">
              ${selectedImages.length > 1 ? `Send ${selectedImages.length} Images` : 'Send Image'}
            </button>
          </div>
          <div class="preview-info">
            <p>File: ${file.name}</p>
            <p>Size: ${(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        </div>
      </div>
    `;
    const existing = document.getElementById('imagePreviewOverlay');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', previewHTML);
    hideImagePicker();
    setTimeout(() => {
      const p = document.getElementById('imagePreviewOverlay');
      if (p) p.style.opacity = '1';
    }, 10);
  };
  reader.readAsDataURL(file);
}

function hideImagePicker() {
  isImagePickerOpen = false;
  const picker = document.getElementById('imagePickerOverlay');
  if (picker) {
    picker.style.opacity = '0';
    setTimeout(() => { picker.style.display = 'none'; document.body.style.overflow = ''; }, 150);
  }
}

function updatePreviewImage() {
  const img = document.querySelector('.preview-image-container img');
  const counter = document.querySelector('.preview-counter');
  if (!img || !selectedImages[currentImageIndex]) return;
  const file = selectedImages[currentImageIndex];
  const reader = new FileReader();
  reader.onload = (e) => {
    img.src = e.target.result;
    if (counter) counter.textContent = `${currentImageIndex + 1}/${selectedImages.length}`;
  };
  reader.readAsDataURL(file);
}

function cancelImageUpload() {
  const cam = document.getElementById('cameraInput');
  const gal = document.getElementById('galleryInput');
  if (cam) cam.value = '';
  if (gal) gal.value = '';
  selectedImages = [];
  currentImageIndex = 0;
  uploadInProgress = false;
  isUploadingMultiple = false;
  const preview = document.getElementById('imagePreviewOverlay');
  if (preview) { preview.style.opacity = '0'; setTimeout(() => preview.remove(), 150); }
}

function handleImageSelect(event) {
  try {
    const fileInput = event.target;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;
    const files = Array.from(fileInput.files);
    const validFiles = [];
    const maxSize = 20 * 1024 * 1024;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > maxSize) { showToast(`${file.name} is too large`, '⚠️'); continue; }
      validFiles.push(file);
    }
    if (validFiles.length === 0) { fileInput.value = ''; return showToast('Please select valid images', '⚠️'); }
    if (validFiles.length > 10) validFiles.splice(10);
    selectedImages = validFiles;
    currentImageIndex = 0;
    createMultiImagePreview();
  } catch (err) {}
}

async function uploadImageFromPreview() {
  if (uploadInProgress) return;
  if (!currentUser) { showToast('Please login', '⚠️'); cancelImageUpload(); return; }
  if (!chatFriend) { showToast('No chat friend', '⚠️'); cancelImageUpload(); return; }
  if (!selectedImages || selectedImages.length === 0) { cancelImageUpload(); return; }

  uploadInProgress = true;
  isUploadingMultiple = selectedImages.length > 1;

  const preview = document.getElementById('imagePreviewOverlay');
  if (preview) { preview.style.opacity = '0'; setTimeout(() => preview.remove(), 150); }

  try {
    if (isUploadingMultiple) {
      let uploaded = 0, failed = 0;
      for (let i = 0; i < selectedImages.length; i++) {
        try { await uploadImageToImgBB(selectedImages[i]); uploaded++; }
        catch (e) { failed++; }
      }
      if (uploaded > 0) {
        let msg = `Sent ${uploaded} image${uploaded > 1 ? 's' : ''}`;
        if (failed > 0) msg += `, ${failed} failed`;
        showToast(msg, '✅', 3000);
      }
    } else {
      await uploadImageToImgBB(selectedImages[0]);
    }
  } catch (error) {
    showToast('Failed to upload images', '❌');
  } finally {
    uploadInProgress = false;
    isUploadingMultiple = false;
  }
}

// ═════════════════════════════════════════════════════════════
// Voice UI
// ═════════════════════════════════════════════════════════════

function setupVoiceRecorder() {
  const micBtn = document.getElementById('micBtn');
  if (!micBtn) return;
  if (!VoiceRecorder.isSupported()) { micBtn.style.display = 'none'; return; }

  voiceRecorder = new VoiceRecorder();

  const overlay = document.getElementById('voiceRecOverlay');
  const waveform = document.getElementById('voiceRecWaveform');
  const timerEl = document.getElementById('voiceRecTimer');
  const cancelBtn = document.getElementById('voiceRecCancelBtn');
  const stopBtn = document.getElementById('voiceRecStopBtn');

  if (waveform) {
    waveform.innerHTML = '';
    for (let i = 0; i < 32; i++) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = '4px';
      waveform.appendChild(bar);
    }
  }

  voiceRecorder.ui = {
    onTimer: (ms) => { if (timerEl) timerEl.textContent = formatDuration(ms); },
    onLevel: (dataArray) => {
      if (!waveform) return;
      const bars = waveform.querySelectorAll('.bar');
      const step = Math.max(1, Math.floor(dataArray.length / bars.length));
      bars.forEach((bar, i) => {
        const v = dataArray[i * step] || 0;
        const h = Math.max(4, Math.min(46, (v / 255) * 46));
        bar.style.height = h + 'px';
      });
    }
  };

  voiceRecorder.onStateChange = (state) => {
    if (state === 'recording') {
      micBtn.classList.add('recording');
      if (overlay) { overlay.style.display = 'flex'; if (timerEl) timerEl.textContent = '0:00'; }
    } else {
      micBtn.classList.remove('recording');
      if (overlay) overlay.style.display = 'none';
    }
  };

  micBtn.addEventListener('click', async () => {
    if (voiceRecorder.isRecording) {
      const blob = await voiceRecorder.stop();
      if (blob) showVoicePreview();
      return;
    }
    if (voiceRecorder.recordedBlob) voiceRecorder.discard();
    await voiceRecorder.start();
  }, { signal: abortController.signal });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      await voiceRecorder.cancel();
      if (overlay) overlay.style.display = 'none';
    }, { signal: abortController.signal });
  }
  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      const blob = await voiceRecorder.stop();
      if (overlay) overlay.style.display = 'none';
      if (blob) showVoicePreview();
    }, { signal: abortController.signal });
  }

  setupVoicePreviewModal();
}

function setupVoicePreviewModal() {
  const overlay = document.getElementById('voicePreviewOverlay');
  const playBtn = document.getElementById('voicePreviewPlay');
  const waveform = document.getElementById('voicePreviewWaveform');
  const closeBtn = document.getElementById('voicePreviewClose');
  const cancelBtn = document.getElementById('voicePreviewCancel');
  const sendBtn = document.getElementById('voicePreviewSend');

  if (waveform) {
    waveform.innerHTML = '';
    voicePreviewBars = [];
    for (let i = 0; i < 40; i++) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      const h = 8 + Math.random() * 24;
      bar.style.height = h + 'px';
      waveform.appendChild(bar);
      voicePreviewBars.push(bar);
    }
  }

  if (playBtn) playBtn.addEventListener('click', () => {
    if (!voicePreviewAudioEl) return;
    if (voicePreviewAudioEl.paused) voicePreviewAudioEl.play().catch(() => {});
    else voicePreviewAudioEl.pause();
  }, { signal: abortController.signal });
  if (closeBtn) closeBtn.addEventListener('click', () => closeVoicePreview(false), { signal: abortController.signal });
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeVoicePreview(false), { signal: abortController.signal });

  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      if (!voiceRecorder || !voiceRecorder.recordedBlob) { closeVoicePreview(false); return; }
      const originalHTML = sendBtn.innerHTML;
      sendBtn.disabled = true;
      sendBtn.innerHTML = 'Sending…';
      try {
        const result = await voiceRecorder.upload();
        await sendVoiceMessage(result.url, result.durationMs || voiceRecorder.recordingMs);
        closeVoicePreview(true);
      } catch (err) {
        showToast('Failed to send voice message', '❌', 2500);
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalHTML;
      }
    }, { signal: abortController.signal });
  }

  if (overlay) overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeVoicePreview(false);
  }, { signal: abortController.signal });
}

function showVoicePreview() {
  if (!voiceRecorder || !voiceRecorder.recordedBlob) { showToast('No recording available', '⚠️', 2000); return; }
  if (!voiceRecorder.recordedUrl) { showToast('Recording is not ready yet', '⚠️', 2000); return; }

  const overlay = document.getElementById('voicePreviewOverlay');
  const durationEl = document.getElementById('voicePreviewDuration');
  const playBtn = document.getElementById('voicePreviewPlay');

  voicePreviewBars.forEach(b => b.classList.remove('played'));
  if (durationEl) durationEl.textContent = formatDuration(voiceRecorder.recordingMs);

  if (voicePreviewAudioEl) { try { voicePreviewAudioEl.pause(); } catch (e) {} voicePreviewAudioEl = null; }
  voicePreviewAudioEl = new Audio(voiceRecorder.recordedUrl);
  voicePreviewAudioEl.preload = 'auto';

  voicePreviewAudioEl.addEventListener('play', () => { if (playBtn) playBtn.innerHTML = ICONS.pause; });
  voicePreviewAudioEl.addEventListener('pause', () => { if (playBtn) playBtn.innerHTML = ICONS.play; });
  voicePreviewAudioEl.addEventListener('ended', () => {
    if (playBtn) playBtn.innerHTML = ICONS.play;
    voicePreviewBars.forEach(b => b.classList.remove('played'));
  });
  voicePreviewAudioEl.addEventListener('timeupdate', () => {
    const dur = voicePreviewAudioEl.duration || (voiceRecorder.recordingMs / 1000) || 1;
    const frac = Math.min(1, voicePreviewAudioEl.currentTime / dur);
    const upTo = Math.floor(frac * voicePreviewBars.length);
    voicePreviewBars.forEach((b, i) => b.classList.toggle('played', i < upTo));
  });

  if (overlay) overlay.style.display = 'flex';
}

function closeVoicePreview(afterSend = false) {
  const overlay = document.getElementById('voicePreviewOverlay');
  if (overlay) overlay.style.display = 'none';
  if (voicePreviewAudioEl) { try { voicePreviewAudioEl.pause(); } catch (e) {} voicePreviewAudioEl = null; }
  voicePreviewBars.forEach(b => b.classList.remove('played'));
  const sendBtn = document.getElementById('voicePreviewSend');
  if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = 'Send'; }
  if (voiceRecorder) voiceRecorder.discard();
}

// ═════════════════════════════════════════════════════════════
// Navigation
// ═════════════════════════════════════════════════════════════

function goBack() {
  const backBtn = document.querySelector('.back-btn');
  if (backBtn) backBtn.innerHTML = '<div class="loading-spinner-small"></div>';
  setTimeout(() => { if (routerRef) routerRef.navigate('/'); }, 50);
}

function openFriendProfile(friendId) {
  if (!friendId || !routerRef) return;
  routerRef.navigate('/user?id=' + encodeURIComponent(friendId));
}

// ═════════════════════════════════════════════════════════════
// Guide
// ═════════════════════════════════════════════════════════════

function openGuide() {
  const modal = document.getElementById('guideModal');
  if (!modal) return;
  const bodyEl = modal.querySelector('.guide-body');
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="guide-item"><div class="guide-icon">💬</div><div><strong>Send a message</strong><p>Type in the box and tap the send button. Press Enter for a new line.</p></div></div>
      <div class="guide-item"><div class="guide-icon">🎙️</div><div><strong>Send a voice message</strong><p>Tap the mic button, speak, then tap stop to preview.</p></div></div>
      <div class="guide-item"><div class="guide-icon">🖼️</div><div><strong>Share images</strong><p>Tap the paperclip icon, then choose Camera or Gallery.</p></div></div>
      <div class="guide-item"><div class="guide-icon">🎨</div><div><strong>Color your message</strong><p>Type <code>/</code> in the message box → pick a color.</p></div></div>
      <div class="guide-item"><div class="guide-icon">📞</div><div><strong>Calls</strong><p>Call history appears as a single "Phone Call" entry.</p></div></div>
      <div class="guide-item"><div class="guide-icon">😀</div><div><strong>React to messages</strong><p>Long-press any message → pick an emoji.</p></div></div>
      <div class="guide-item"><div class="guide-icon">📋</div><div><strong>Copy a message</strong><p>Long-press → tap the copy icon.</p></div></div>
      <div class="guide-item"><div class="guide-icon">✏️</div><div><strong>Edit your message</strong><p>Long-press your own message → tap the pencil icon.</p></div></div>
      <div class="guide-item"><div class="guide-icon">🗑️</div><div><strong>Delete your message</strong><p>Long-press your own message → tap the trash icon.</p></div></div>
      <div class="guide-item"><div class="guide-icon">📞</div><div><strong>Voice / video call</strong><p>Tap the phone icon in the top-right corner.</p></div></div>
    `;
  }
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('visible'));
}

function closeGuide() {
  const modal = document.getElementById('guideModal');
  if (!modal) return;
  modal.classList.remove('visible');
  setTimeout(() => modal.style.display = 'none', 220);
}

// ═════════════════════════════════════════════════════════════
// Modals
// ═════════════════════════════════════════════════════════════

function showUserInfo() {
  if (!chatFriend) return;
  const modal = document.getElementById('userInfoModal');
  const content = document.getElementById('userInfoContent');
  if (!modal || !content) return;
  const online = isUserOnline(chatFriend);
  const initial = chatFriend.username ? chatFriend.username.charAt(0).toUpperCase() : '?';
  content.innerHTML = `
    <div class="user-info-avatar">${chatFriend.avatar_url ? `<img src="${chatFriend.avatar_url}">` : `<span>${initial}</span>`}</div>
    <div class="user-info-details">
      <h3 class="user-info-name">${chatFriend.full_name || chatFriend.username}</h3>
      <p class="user-info-username">@${chatFriend.username}</p>
      <div class="user-info-status ${online ? '' : 'offline'}">
        <span class="status-dot ${online ? '' : 'offline'}"></span>
        ${online ? 'Online' : 'Offline'}
      </div>
    </div>
    <div class="user-info-actions">
      <button class="info-action-btn" onclick="openFriendProfile('${chatFriend.id}')">👤 View Profile</button>
      <button class="info-action-btn danger" onclick="blockUserPrompt()">🚫 Block User</button>
    </div>
  `;
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('visible'));
}

function closeModal() {
  const modal = document.getElementById('userInfoModal');
  if (!modal) return;
  modal.classList.remove('visible');
  setTimeout(() => modal.style.display = 'none', 200);
}

function blockUserPrompt() {
  showConfirmAlert(`Are you sure you want to block ${chatFriend.username}?`, '🚫', 'Block User', () => {
    showToast('User blocked!', '✅', 1500);
    setTimeout(goBack, 800);
  });
}

function clearChatPrompt() {
  showConfirmAlert('Are you sure you want to clear all messages?', '🗑️', 'Clear Chat', async () => {
    try {
      const { error } = await window.supabase.from('direct_messages').delete()
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${chatFriend.id}),and(sender_id.eq.${chatFriend.id},receiver_id.eq.${currentUser.id})`);
      if (error) throw error;
      showToast('Chat cleared!', '✅', 1500);
      currentMessages = [];
      messageReactions = {};
      showMessages([]);
    } catch (error) {
      showToast('Error clearing chat', '❌', 1500);
    }
  });
}

// ═════════════════════════════════════════════════════════════
// Fallback
// ═════════════════════════════════════════════════════════════

function showFallbackPage(title, message, emoji = '💬') {
  const existing = document.getElementById('rtFallbackScreen');
  if (existing) existing.remove();

  const screen = document.createElement('div');
  screen.id = 'rtFallbackScreen';
  screen.innerHTML = `
    <div class="fallback-card">
      <div class="fallback-emoji">${emoji}</div>
      <h1 class="fallback-title">${escapeHtml(title)}</h1>
      <p class="fallback-message">${escapeHtml(message)}</p>
      <div class="fallback-actions">
        <a href="/#/login" class="fallback-btn fallback-btn-primary">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          Login
        </a>
        <a href="/home/" class="fallback-btn fallback-btn-secondary">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          Home
        </a>
        <a href="/#/signup" class="fallback-btn fallback-btn-secondary">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="8.5" cy="7" r="4"/>
            <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
          </svg>
          Sign Up
        </a>
      </div>
      <div class="fallback-footer">RelayTalk</div>
    </div>
  `;
  document.body.appendChild(screen);
  document.body.classList.add('fallback-active');
}

// ═════════════════════════════════════════════════════════════
// Init
// ═════════════════════════════════════════════════════════════

export async function initChats({ router, params }) {
  routerRef = router;
  abortController = new AbortController();
  const sig = abortController.signal;

  // Reset state
  currentUser = null;
  chatFriend = null;
  currentMessages = [];
  messageReactions = {};
  selectedColor = null;
  colorPickerVisible = false;
  selectedImages = [];
  isSending = false;
  isTyping = false;

  try {
    const session = await getSession();
    if (!session?.user) {
      window.location.replace('/#/login');
      return () => {};
    }
    currentUser = session.user;

    // Read friendId from params or sessionStorage
    let friendId = params?.get('friendId');
    if (!friendId) {
      try {
        const stored = sessionStorage.getItem('currentChatFriend');
        if (stored) friendId = JSON.parse(stored).id;
      } catch (e) {}
    }

    if (!friendId) {
      showFallbackPage('No chat selected', 'This link is missing the person you wanted to chat with.', '💬');
      return () => {};
    }

    const { data: friend, error: friendError } = await window.supabase
      .from('profiles').select('*').eq('id', friendId).maybeSingle();

    if (friendError || !friend) {
      showFallbackPage('Account not found', 'This account does not exist or may have been removed.', '🔎');
      return () => {};
    }
    if (friend.id === currentUser.id) {
      showFallbackPage('This is you', 'You cannot start a chat with yourself.', '🤔');
      return () => {};
    }

    chatFriend = friend;

    const chatUserAvatar = document.getElementById('chatUserAvatar');
    const friendInitial = friend.username ? friend.username.charAt(0).toUpperCase() : '?';
    if (chatUserAvatar) {
      if (friend.avatar_url) chatUserAvatar.innerHTML = `<img src="${friend.avatar_url}" alt="${friend.username}">`;
      else chatUserAvatar.textContent = friendInitial;
    }
    const nameEl = document.getElementById('chatUserName');
    if (nameEl) nameEl.textContent = friend.username;
    updateFriendStatus(friend.status, friend.last_seen);

    const clickableHeader = document.getElementById('chatHeaderProfile');
    if (clickableHeader) {
      clickableHeader.addEventListener('click', () => openFriendProfile(friend.id), { signal: sig });
    }

    await loadOldMessages(friendId);
    setupRealtime(friendId);
    setupTypingListener();
    setupTypingReceiver(friendId);
    setupTypingIndicator();
    setupSlashHandler();
    setupColorPickerClickOutside();
    setupLongPressHandlers();
    setupGlobalDismiss();
    setupVoiceRecorder();

    // Keyboard preservation — prevent button clicks from blurring input
    document.querySelectorAll('.message-input-wrapper button').forEach(btn => {
      btn.addEventListener('mousedown', (e) => e.preventDefault(), { signal: sig });
    });

    // Attach input listener for keydown and auto-resize
    const input = document.getElementById('messageInput');
    if (input) {
      input.addEventListener('keydown', handleKeyPress, { signal: sig });
      input.addEventListener('input', () => autoResize(input), { signal: sig });
    }

    // Attach file inputs
    const cam = document.getElementById('cameraInput');
    const gal = document.getElementById('galleryInput');
    if (cam) cam.addEventListener('change', handleImageSelect, { signal: sig });
    if (gal) gal.addEventListener('change', handleImageSelect, { signal: sig });

    // Add color picker to DOM
    setTimeout(() => {
      addColorPickerToDOM();
      if (input) { autoResize(input); input.focus(); }
      forceScrollToBottom();
    }, 150);

    // Chrome mobile viewport fix
    if (isMobileChrome() || isIOSChrome()) {
      document.body.classList.add('chrome-mobile');
      const updateVh = () => {
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
      };
      updateVh();
      window.addEventListener('resize', updateVh, { signal: sig });
      document.body.style.overscrollBehaviorY = 'none';
    }

    // Expose globals for inline handlers in template
    const GLOBALS = {
      goBack,
      sendMessage,
      handleKeyPress,
      autoResize,
      openGuide,
      closeGuide,
      closeModal,
      blockUserPrompt,
      clearChatPrompt,
      showImagePicker: () => {
        if (!currentUser) return showToast('Please login', '⚠️');
        setTimeout(() => {
          isImagePickerOpen = true;
          const picker = document.getElementById('imagePickerOverlay');
          if (picker) { picker.style.display = 'flex'; setTimeout(() => picker.style.opacity = '1', 10); document.body.style.overflow = 'hidden'; }
        }, isMobileChrome() ? 50 : 0);
      },
      closeImagePicker: () => { if (uploadInProgress) return; hideImagePicker(); },
      openCamera: () => { const i = document.getElementById('cameraInput'); if (i) { i.value = ''; setTimeout(() => i.click(), 200); } },
      openGallery: () => { const i = document.getElementById('galleryInput'); if (i) { i.value = ''; setTimeout(() => i.click(), 200); } },
      viewImageFullscreen: (url) => {
        const fixedUrl = fixImgBBUrls(url);
        const existing = document.getElementById('imageViewerOverlay');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', `
          <div class="image-viewer-overlay" id="imageViewerOverlay">
            <button class="viewer-close" onclick="closeImageViewer()">
              <svg viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg>
            </button>
            <div class="viewer-image-container"><img src="${fixedUrl}" alt="Image" class="viewer-image" onload="this.style.opacity='1';this.classList.add('loaded')"></div>
            <div class="viewer-actions">
              <button class="viewer-action-btn" onclick="downloadImage('${fixedUrl}')"><svg viewBox="0 0 24 24"><path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/></svg><span>Download</span></button>
              <button class="viewer-action-btn" onclick="shareImage('${fixedUrl}')"><svg viewBox="0 0 24 24"><path d="M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L15.96,7.19C16.5,7.69 17.21,8 18,8A3,3 0 0,0 21,5A3,3 0 0,0 18,2A3,3 0 0,0 15,5C15,5.24 15.04,5.47 15.09,5.7L8.04,9.81C7.5,9.31 6.79,9 6,9A3,3 0 0,0 3,12A3,3 0 0,0 6,15C6.79,15 7.5,14.69 8.04,14.19L15.16,18.34C15.11,18.55 15.08,18.77 15.08,19C15.08,20.61 16.39,21.91 18,21.91C19.61,21.91 20.92,20.61 20.92,19C20.92,17.39 19.61,16.08 18,16.08Z"/></svg><span>Share</span></button>
            </div>
          </div>
        `);
        setTimeout(() => { const v = document.getElementById('imageViewerOverlay'); if (v) v.style.opacity = '1'; }, 10);
      },
      closeImageViewer: () => { const v = document.getElementById('imageViewerOverlay'); if (v) { v.style.opacity = '0'; setTimeout(() => v.remove(), 150); } },
      downloadImage: (url) => {
        const a = document.createElement('a');
        a.href = ensureHttpsUrl(url);
        a.download = `relaytalk-${Date.now()}.jpg`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 100);
        showToast('Download started', '📥', 1500);
      },
      shareImage: async (url) => {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const file = new File([blob], 'relaytalk-image.jpg', { type: blob.type });
          if (navigator.share && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Image from RelayTalk' });
            return;
          }
        } catch (e) {}
        if (navigator.share) {
          try { await navigator.share({ title: 'Image', url }); }
          catch (e) { if (e.name !== 'AbortError') navigator.clipboard.writeText(url).then(() => showToast('URL copied!', '📋', 1500)).catch(() => {}); }
        } else {
          navigator.clipboard.writeText(url).then(() => showToast('URL copied!', '📋', 1500)).catch(() => {});
        }
      },
      selectColor: (color) => {
        selectedColor = color;
        document.querySelectorAll('.color-option').forEach(o => o.classList.toggle('selected', o.dataset.color === color));
        showToast(`${color} selected`, '🎨', 800);
        setTimeout(() => {
          hideColorPicker();
          const inp = document.getElementById('messageInput');
          if (inp) { inp.focus(); if (inp.value === '/') { inp.value = ''; autoResize(inp); } }
        }, 500);
      },
      removeSelectedColor: () => {
        selectedColor = null;
        document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
        showToast('Color cleared', '↩️', 800);
        setTimeout(() => {
          hideColorPicker();
          const inp = document.getElementById('messageInput');
          if (inp) { inp.focus(); if (inp.value === '/') { inp.value = ''; autoResize(inp); } }
        }, 500);
      },
      cancelColorSelection: () => {
        hideColorPicker();
        const inp = document.getElementById('messageInput');
        if (inp && inp.value === '/') { inp.value = ''; autoResize(inp); }
      },
      prevImage: () => { if (currentImageIndex > 0) { currentImageIndex--; updatePreviewImage(); } },
      nextImage: () => { if (currentImageIndex < selectedImages.length - 1) { currentImageIndex++; updatePreviewImage(); } },
      cancelImageUpload,
      uploadImageFromPreview,
      handleImageLoad,
      handleImageError,
      createImageMessageHTML,
      openFriendProfile,
      startCall: (id, name) => {
        if (typeof window.startCall === 'function') {
          window.startCall(id, name);
        } else {
          showToast('Calling service not ready yet', '⚠️', 1500);
        }
      },
      // Custom toast / alert
      showToast,
      showCustomAlert,
      showConfirmAlert
    };

    Object.keys(GLOBALS).forEach(k => { window[k] = GLOBALS[k]; });

    // Save a reference for cleanup
    const globalsAdded = Object.keys(GLOBALS);

    return () => {
      // Abort all event listeners
      try { abortController.abort(); } catch (e) {}

      // Close realtime channels
      [chatChannel, statusChannel, typingChannel, reactionsChannel, callsChannel].forEach(ch => {
        if (ch) { try { window.supabase.removeChannel(ch); } catch (e) {} }
      });
      chatChannel = statusChannel = typingChannel = reactionsChannel = callsChannel = null;

      // Clear timers
      if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
      if (friendTypingTimeout) { clearTimeout(friendTypingTimeout); friendTypingTimeout = null; }
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

      // Stop audio
      [sentAudio, receivedAudio, currentlyPlayingAudio].forEach(a => {
        if (a) { try { a.pause(); a.currentTime = 0; } catch (e) {} }
      });
      sentAudio = null;
      receivedAudio = null;
      currentlyPlayingAudio = null;
      currentlyPlayingBtn = null;

      if (voiceRecorder) {
        try { voiceRecorder.cancel(); } catch (e) {}
        voiceRecorder = null;
      }
      if (voicePreviewAudioEl) { try { voicePreviewAudioEl.pause(); } catch (e) {} voicePreviewAudioEl = null; }

      // Close any open modals / overlays
      ['imagePreviewOverlay', 'imageViewerOverlay', 'editModalOverlay', 'emojiPickerOverlay', 'rtFallbackScreen']
        .forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });

      document.body.classList.remove('selection-active', 'fallback-active', 'chrome-mobile');
      document.body.style.overflow = '';

      // Remove window globals
      globalsAdded.forEach(k => { try { delete window[k]; } catch (_) { window[k] = undefined; } });

      // Reset state
      currentUser = null;
      chatFriend = null;
      currentMessages = [];
      messageReactions = {};
      selectedColor = null;
      selectedImages = [];
      routerRef = null;
      abortController = null;
    };
  } catch (error) {
    console.error('[chats] init error:', error);
    showFallbackPage('Something went wrong', 'We could not load this chat. Please try again.', '⚠️');
    return () => {};
  }
}
