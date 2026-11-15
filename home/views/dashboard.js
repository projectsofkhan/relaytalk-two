// home/views/dashboard.js — ported from pages/home/script.js
// Behavior preserved. Supabase via global window.supabase (set in home.js).
// Navigation routed through the SPA router.
// Push + callHub deferred until those utils files are provided.

import { getSession } from '/shared/supabase.js';

const ONLINE_FRESH_WINDOW_MS = 60000;

const SEEN_STORAGE_KEY = 'relaytalk_seen_notifications';
const SEEN_CALLS_KEY = 'relaytalk_seen_calls';

// ═════════════════════════════════════════════════════════════
// Module-scoped state (reset on each mount)
// ═════════════════════════════════════════════════════════════

let currentUser = null;
let currentProfile = null;
let currentNotifTab = 'main';
let friendsRealtimeChannel = null;
let unreadChannel = null;

const locallyDismissedRequestIds = new Set();
const locallyReadCallIds = new Set();

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
  } catch (e) {
    return false;
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function escapeAttr(str) { return escapeHtml(str); }

function buildAvatarHTML(profile) {
  const username = (profile && profile.username) ? profile.username : '?';
  const firstLetter = username.charAt(0).toUpperCase();
  const avatarUrl = profile && profile.avatar_url ? profile.avatar_url : '';
  if (avatarUrl) {
    return `<img src="${escapeAttr(avatarUrl)}" alt="${escapeAttr(username)}">`;
  }
  return `<span>${escapeHtml(firstLetter)}</span>`;
}

function getTimeAgo(date) {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getSeenIds(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) { return new Set(); }
}

function addSeenIds(key, ids) {
  try {
    const set = getSeenIds(key);
    ids.forEach(id => set.add(id));
    const arr = Array.from(set).slice(-200);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {}
}

async function persistSeenCalls(ids) {
  if (!ids || ids.length === 0 || !window.supabase || !currentUser) return;
  try {
    await window.supabase
      .from('calls')
      .update({ seen: true })
      .in('id', ids)
      .or(`receiver_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`);
  } catch (e) {
    console.warn('[dashboard] persistSeenCalls failed:', e);
  }
}

// ═════════════════════════════════════════════════════════════
// Toast (preserved from old script.js)
// ═════════════════════════════════════════════════════════════

class ToastNotification {
  constructor() {
    this.container = document.getElementById('toastContainer');
    if (!this.container) this.createToastContainer();
  }

  createToastContainer() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    this.container.id = 'toastContainer';
    document.body.prepend(this.container);
  }

  show(options) {
    const { title = '', message = '', type = 'info', duration = 5000 } = options;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = '💬';
    switch (type) {
      case 'success': icon = '✨'; break;
      case 'error': icon = '❌'; break;
      case 'warning': icon = '⚠️'; break;
    }

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        <div class="toast-title">${title}<span class="toast-time">${time}</span></div>
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    this.container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    if (duration > 0) {
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
    return toast;
  }

  success(t, m = '', d = 5000) { return this.show({ title: t, message: m, type: 'success', duration: d }); }
  error(t, m = '', d = 7000) { return this.show({ title: t, message: m, type: 'error', duration: d }); }
  warning(t, m = '', d = 6000) { return this.show({ title: t, message: m, type: 'warning', duration: d }); }
  info(t, m = '', d = 4000) { return this.show({ title: t, message: m, type: 'info', duration: d }); }
}

let toast = null;

// ═════════════════════════════════════════════════════════════
// Data loaders
// ═════════════════════════════════════════════════════════════

async function loadUserProfile() {
  try {
    if (!currentUser || !window.supabase) {
      currentProfile = {
        username: currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || 'User'
      };
      return;
    }

    const { data: profile } = await window.supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .maybeSingle();

    currentProfile = profile || {
      username: currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'User'
    };
  } catch (err) {
    currentProfile = {
      username: currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || 'User'
    };
  }
}

function updateWelcomeMessage() {
  if (!currentProfile) return;
  const nameEl = document.getElementById('welcomeTitle');
  const smallEl = document.getElementById('greetingSmall');

  const hour = new Date().getHours();
  let greeting = 'Hello';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';
  else if (hour < 21) greeting = 'Good evening';
  else greeting = 'Good night';

  if (smallEl) smallEl.textContent = greeting;
  if (nameEl) nameEl.textContent = currentProfile.username || 'Friend';
}

async function fetchUnreadCounts(friendIds) {
  const result = {};
  if (!friendIds || friendIds.length === 0) return result;
  try {
    const { data, error } = await window.supabase
      .from('direct_messages')
      .select('sender_id, message_type')
      .eq('receiver_id', currentUser.id)
      .eq('read', false)
      .neq('message_type', 'call')
      .in('sender_id', friendIds);
    if (error || !data) return result;
    data.forEach(row => {
      result[row.sender_id] = (result[row.sender_id] || 0) + 1;
    });
  } catch (e) {}
  return result;
}

async function loadFriends() {
  if (!currentUser || !window.supabase) { showEmptyFriends(); return; }
  const container = document.getElementById('friendsList');
  if (!container) return;

  try {
    const { data: friends, error } = await window.supabase
      .from('friends')
      .select('friend_id')
      .eq('user_id', currentUser.id);

    if (error || !friends || friends.length === 0) { showEmptyFriends(); return; }

    const friendIds = friends.map(f => f.friend_id);
    const { data: profiles } = await window.supabase
      .from('profiles')
      .select('id, username, avatar_url, status, last_seen')
      .in('id', friendIds);

    const unreadMap = await fetchUnreadCounts(friendIds);

    let html = '';
    if (profiles && profiles.length > 0) {
      profiles.forEach(profile => {
        const isOnline = isUserOnline(profile);
        const timeAgo = getTimeAgo(profile.last_seen || new Date());
        const unread = unreadMap[profile.id] || 0;
        const badgeHTML = unread > 0
          ? `<span class="friend-unread-badge">${unread > 99 ? '99+' : unread}</span>` : '';

        html += `
          <div class="friend-item" onclick="openChat('${profile.id}', '${escapeAttr(profile.username || 'Friend')}')">
            <div class="friend-avatar">
              ${buildAvatarHTML(profile)}
              <span class="friend-status-dot ${isOnline ? 'online' : 'offline'}"></span>
            </div>
            <div class="friend-info">
              <div class="friend-name">${escapeHtml(profile.username || 'Unknown')}</div>
              <div class="friend-status ${isOnline ? 'online' : ''}">
                ${isOnline ? 'Online' : 'Last seen ' + timeAgo}
              </div>
            </div>
            ${badgeHTML}
          </div>
        `;
      });
    } else {
      showEmptyFriends();
      return;
    }

    container.innerHTML = html;
  } catch (e) {
    showEmptyFriends();
  }
}

function showEmptyFriends() {
  const container = document.getElementById('friendsList');
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon"><i class="fas fa-user-friends"></i></div>
      <h3 class="empty-title">No friends yet</h3>
      <p class="empty-desc">Search for friends to start chatting</p>
      <button class="empty-cta" onclick="openSearch()">
        <i class="fas fa-search"></i> Find Friends
      </button>
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════
// Search
// ═════════════════════════════════════════════════════════════

async function loadSearchResults() {
  const container = document.getElementById('searchResults');
  const searchInput = document.getElementById('searchInput');
  if (!container) return;

  try {
    if (!currentUser || !window.supabase) {
      container.innerHTML = `<div class="empty-state"><p>Cannot search right now</p></div>`;
      return;
    }

    const { data: allUsers, error } = await window.supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .neq('id', currentUser.id)
      .limit(50);

    if (error || !allUsers || allUsers.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-users"></i></div><p>No other users found</p></div>`;
      return;
    }

    await displaySearchResults(allUsers);

    if (searchInput) {
      searchInput.oninput = async function () {
        const term = this.value.toLowerCase().trim();
        if (term === '') { await displaySearchResults(allUsers); return; }
        const filtered = allUsers.filter(u =>
          (u.username || '').toLowerCase().includes(term) ||
          (u.full_name && u.full_name.toLowerCase().includes(term))
        );
        await displaySearchResults(filtered);
      };
      searchInput.focus();
    }
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Search failed</p></div>`;
  }
}

async function displaySearchResults(users) {
  const container = document.getElementById('searchResults');
  if (!container) return;
  if (!users || users.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-search"></i></div><p>No users found</p></div>`;
    return;
  }

  try {
    const { data: friends } = await window.supabase
      .from('friends').select('friend_id').eq('user_id', currentUser.id);
    const friendIds = friends?.map(f => f.friend_id) || [];

    const { data: pending } = await window.supabase
      .from('friend_requests').select('receiver_id')
      .eq('sender_id', currentUser.id).eq('status', 'pending');
    const pendingIds = pending?.map(r => r.receiver_id) || [];

    let html = '';
    users.forEach(user => {
      const isFriend = friendIds.includes(user.id);
      const requestSent = pendingIds.includes(user.id);
      const safeName = escapeAttr(user.username || 'User');

      html += `
        <div class="search-result">
          <div class="search-avatar" role="button" tabindex="0" aria-label="View profile" onclick="openUserProfile('${user.id}')">
            ${buildAvatarHTML(user)}
          </div>
          <div class="search-info" role="button" tabindex="0" onclick="openUserProfile('${user.id}')">
            <div class="search-name">${escapeHtml(user.username || 'Unknown')}</div>
            <div class="search-username">${escapeHtml(user.full_name || '')}</div>
          </div>
          ${isFriend
            ? `<button class="send-request-btn sent" disabled onclick="event.stopPropagation()">Friend</button>`
            : requestSent
              ? `<button class="send-request-btn sent" disabled onclick="event.stopPropagation()">Sent</button>`
              : `<button class="send-request-btn" onclick="event.stopPropagation(); sendFriendRequest('${user.id}', '${safeName}', this)">Add</button>`}
        </div>
      `;
    });
    container.innerHTML = html;
  } catch (e) {}
}

async function sendFriendRequest(toUserId, toUsername, button) {
  if (button) { button.textContent = 'Sending...'; button.disabled = true; }
  try {
    const { error } = await window.supabase.from('friend_requests').insert({
      sender_id: currentUser.id,
      receiver_id: toUserId,
      status: 'pending',
      created_at: new Date().toISOString()
    });
    if (error) throw error;

    await loadSearchResults();
    await updateNotificationsBadge();
    toast.success("Request Sent", `Your request has been sent to ${toUsername}!`);
    if (button) { button.textContent = 'Sent'; button.disabled = true; button.classList.add('sent'); }
  } catch (e) {
    toast.error("Request Failed", "Please check your connection");
    if (button) { button.textContent = 'Add'; button.disabled = false; }
  }
}

// ═════════════════════════════════════════════════════════════
// Notifications
// ═════════════════════════════════════════════════════════════

async function loadNotifications() {
  const container = document.getElementById('notificationsList');
  if (!container) return;
  try {
    if (!currentUser || !window.supabase) { showEmptyNotifications(container); return; }

    const { data: notifications, error } = await window.supabase
      .from('friend_requests')
      .select('id, sender_id, created_at')
      .eq('receiver_id', currentUser.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    const visible = (notifications || []).filter(n => !locallyDismissedRequestIds.has(String(n.id)));
    if (error || visible.length === 0) { showEmptyNotifications(container); return; }

    const senderIds = visible.map(n => n.sender_id);
    const { data: profiles } = await window.supabase
      .from('profiles').select('id, username, avatar_url').in('id', senderIds);
    const profileMap = {};
    (profiles || []).forEach(p => profileMap[p.id] = p);

    let html = '';
    visible.forEach(notification => {
      const timeAgo = getTimeAgo(notification.created_at);
      const sender = profileMap[notification.sender_id] || { username: 'Unknown' };
      const senderName = sender.username;

      html += `
        <div class="notification-item" data-request-id="${notification.id}">
          <div class="notification-avatar">${buildAvatarHTML(sender)}</div>
          <div class="notification-content">
            <div class="notification-text">
              <strong>${escapeHtml(senderName)}</strong> wants to be friends
              <span class="notification-time">${timeAgo}</span>
            </div>
          </div>
          <div class="notification-actions">
            <button class="btn-small btn-success" onclick="acceptFriendRequest('${notification.id}', '${notification.sender_id}', '${escapeAttr(senderName)}', this)" aria-label="Accept">
              <i class="fas fa-check"></i>
            </button>
            <button class="btn-small btn-danger" onclick="declineFriendRequest('${notification.id}', this)" aria-label="Decline">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  } catch (e) {
    showEmptyNotifications(container);
  }
}

function showEmptyNotifications(container) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon"><i class="fas fa-bell-slash"></i></div>
      <p class="empty-desc">No notifications yet</p>
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════
// Call history
// ═════════════════════════════════════════════════════════════

async function loadCallHistory() {
  const container = document.getElementById('callHistoryList');
  if (!container) return;
  try {
    if (!currentUser || !window.supabase) {
      container.innerHTML = `<div class="empty-state"><p>Cannot load call history</p></div>`;
      return;
    }

    const { data: calls, error } = await window.supabase
      .from('calls')
      .select('*')
      .or(`caller_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !calls || calls.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="fas fa-phone-slash"></i></div>
          <h3 class="empty-title">No calls yet</h3>
          <p class="empty-desc">Your call history will appear here</p>
        </div>`;
      return;
    }

    const userIds = new Set();
    calls.forEach(c => {
      if (c.caller_id !== currentUser.id) userIds.add(c.caller_id);
      if (c.receiver_id !== currentUser.id) userIds.add(c.receiver_id);
      if (c.callee_id && c.callee_id !== currentUser.id) userIds.add(c.callee_id);
    });

    let profileMap = {};
    if (userIds.size > 0) {
      const { data: profiles } = await window.supabase
        .from('profiles').select('id, username, avatar_url').in('id', [...userIds]);
      (profiles || []).forEach(p => profileMap[p.id] = p);
    }

    let html = '';
    let lastDate = '';

    calls.forEach(call => {
      const callDate = new Date(call.created_at).toLocaleDateString();
      if (callDate !== lastDate) {
        lastDate = callDate;
        html += `<div class="call-history-date">${callDate}</div>`;
      }

      const isOutgoing = call.caller_id === currentUser.id;
      const otherUserId = isOutgoing ? (call.receiver_id || call.callee_id) : (call.caller_id || call.callee_id);
      const otherUser = profileMap[otherUserId] || { username: 'Unknown' };

      let metaIcon = 'fa-arrow-down', metaClass = 'meta-incoming', metaText = 'Incoming', isMissed = false;
      if (isOutgoing) { metaIcon = 'fa-arrow-up'; metaClass = 'meta-outgoing'; metaText = 'Outgoing'; }
      if (['missed','cancelled','rejected'].includes(call.status)) {
        if (!isOutgoing || call.status === 'rejected') {
          metaIcon = 'fa-phone-slash'; metaClass = 'meta-missed'; metaText = 'Missed'; isMissed = true;
        }
      } else if (call.status === 'ringing' && !isOutgoing) {
        metaIcon = 'fa-phone-slash'; metaClass = 'meta-missed'; metaText = 'Missed'; isMissed = true;
      }

      const time = new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const callIdStr = String(call.id);
      const isUnseen = !isOutgoing && isMissed && !locallyReadCallIds.has(callIdStr) && call.seen !== true;

      let tagHTML = '';
      if (isUnseen) tagHTML = `<span class="call-tag tag-new">New</span>`;
      else if (isMissed) tagHTML = `<span class="call-tag tag-missed">Missed</span>`;

      html += `
        <div class="call-history-item ${isUnseen ? 'has-tag' : ''}">
          <div class="call-history-avatar">${buildAvatarHTML(otherUser)}</div>
          <div class="call-history-info">
            <div class="call-history-name ${isMissed ? 'missed' : ''}">
              ${escapeHtml(otherUser.username || 'Unknown')} ${tagHTML}
            </div>
            <div class="call-history-meta">
              <i class="fas ${metaIcon} ${metaClass}"></i>
              <span>${metaText}</span>
              <span class="dot">•</span>
              <span>${time}</span>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    const unseenCallIds = calls
      .filter(c => c.caller_id !== currentUser.id && c.seen !== true)
      .map(c => c.id);
    calls.forEach(c => locallyReadCallIds.add(String(c.id)));
    const seenIds = calls.map(c => String(c.id)).filter(Boolean);
    if (seenIds.length > 0) addSeenIds(SEEN_CALLS_KEY, seenIds);
    if (unseenCallIds.length > 0) await persistSeenCalls(unseenCallIds);

    await updateCallsTabBadge();
    await updateNotificationsBadge();
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Could not load call history</p></div>`;
  }
}

// ═════════════════════════════════════════════════════════════
// Badges
// ═════════════════════════════════════════════════════════════

async function updateNotificationsBadge() {
  try {
    if (!currentUser || !window.supabase) { hideNotificationBadge(); return; }

    const { data: notifications } = await window.supabase
      .from('friend_requests').select('id')
      .eq('receiver_id', currentUser.id).eq('status', 'pending');

    const unread = (notifications || [])
      .filter(n => !locallyDismissedRequestIds.has(String(n.id))).length;

    const badge = document.getElementById('notificationBadge');
    if (badge) {
      badge.textContent = unread > 9 ? '9+' : unread;
      badge.style.display = unread > 0 ? 'flex' : 'none';
    }

    const navBadge = document.getElementById('navNotificationBadge');
    if (navBadge) {
      navBadge.textContent = unread > 9 ? '9+' : unread;
      navBadge.style.display = unread > 0 ? 'flex' : 'none';
    }

    const tabBadge = document.getElementById('mainTabBadge');
    if (tabBadge) {
      tabBadge.textContent = unread > 9 ? '9+' : unread;
      tabBadge.style.display = unread > 0 ? 'inline-flex' : 'none';
    }
  } catch (e) { hideNotificationBadge(); }
}

async function updateCallsTabBadge() {
  try {
    if (!currentUser || !window.supabase) return;

    const { data: calls } = await window.supabase
      .from('calls')
      .select('id, status, seen')
      .or(`receiver_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`)
      .in('status', ['missed', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(50);

    const unseen = (calls || []).filter(c => c.seen !== true && !locallyReadCallIds.has(String(c.id))).length;

    const badge = document.getElementById('callsTabBadge');
    if (badge) {
      badge.textContent = unseen > 9 ? '9+' : String(unseen);
      badge.style.display = unseen > 0 ? 'inline-flex' : 'none';
    }

    const notifBadge = document.getElementById('notificationBadge');
    if (notifBadge) {
      const { data: fr } = await window.supabase
        .from('friend_requests').select('id')
        .eq('receiver_id', currentUser.id).eq('status', 'pending');
      const frUnread = (fr || []).filter(r => !locallyDismissedRequestIds.has(String(r.id))).length;
      const total = frUnread + unseen;
      notifBadge.textContent = total > 9 ? '9+' : total;
      notifBadge.style.display = total > 0 ? 'flex' : 'none';
    }
  } catch (e) {}
}

function hideNotificationBadge() {
  const badge = document.getElementById('notificationBadge');
  if (badge) badge.style.display = 'none';
  const navBadge = document.getElementById('navNotificationBadge');
  if (navBadge) navBadge.style.display = 'none';
}

// ═════════════════════════════════════════════════════════════
// Accept / decline
// ═════════════════════════════════════════════════════════════

async function acceptFriendRequest(requestId, senderId, senderName = 'User', button = null) {
  if (button) { button.innerHTML = '...'; button.disabled = true; }
  locallyDismissedRequestIds.add(String(requestId));
  addSeenIds(SEEN_STORAGE_KEY, [String(requestId)]);

  const itemEl = document.querySelector(`.notification-item[data-request-id="${requestId}"]`);
  if (itemEl) { itemEl.classList.add('removing'); setTimeout(() => itemEl.remove(), 280); }

  try {
    const { error: updErr } = await window.supabase
      .from('friend_requests').update({ status: 'accepted' }).eq('id', requestId);
    if (updErr) throw updErr;

    await window.supabase.from('friends').insert({
      user_id: currentUser.id, friend_id: senderId, created_at: new Date().toISOString()
    });
    await window.supabase.from('friends').insert({
      user_id: senderId, friend_id: currentUser.id, created_at: new Date().toISOString()
    });

    toast.success("New Friend!", `You are now connected with ${senderName}!`);
    setTimeout(() => {
      loadNotifications();
      loadFriends();
      updateNotificationsBadge();
    }, 320);
  } catch (e) {
    toast.error("Connection Failed", "Could not accept friend request");
    locallyDismissedRequestIds.delete(String(requestId));
    loadNotifications();
  }
}

async function declineFriendRequest(requestId, button = null) {
  if (button) { button.innerHTML = '...'; button.disabled = true; }
  locallyDismissedRequestIds.add(String(requestId));
  addSeenIds(SEEN_STORAGE_KEY, [String(requestId)]);

  const itemEl = document.querySelector(`.notification-item[data-request-id="${requestId}"]`);
  if (itemEl) { itemEl.classList.add('removing'); setTimeout(() => itemEl.remove(), 280); }

  try {
    const { error } = await window.supabase
      .from('friend_requests').update({ status: 'rejected' }).eq('id', requestId);
    if (error) throw error;
    toast.info("Request Declined", "Friend request has been declined");
    setTimeout(() => { loadNotifications(); updateNotificationsBadge(); }, 320);
  } catch (e) {
    locallyDismissedRequestIds.delete(String(requestId));
    loadNotifications();
  }
}

// ═════════════════════════════════════════════════════════════
// Realtime
// ═════════════════════════════════════════════════════════════

function setupFriendsRealtime() {
  if (!currentUser || !window.supabase) return;
  if (friendsRealtimeChannel) {
    window.supabase.removeChannel(friendsRealtimeChannel);
    friendsRealtimeChannel = null;
  }
  friendsRealtimeChannel = window.supabase
    .channel(`home-friends:${currentUser.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friends', filter: `user_id=eq.${currentUser.id}` },
      () => { loadFriends(); toast.info("New Friend!", "Someone just accepted your friend request"); })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'friends', filter: `user_id=eq.${currentUser.id}` },
      () => loadFriends())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friend_requests', filter: `receiver_id=eq.${currentUser.id}` },
      () => { updateNotificationsBadge(); updateCallsTabBadge(); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friend_requests', filter: `receiver_id=eq.${currentUser.id}` },
      () => { if (currentNotifTab === 'main') loadNotifications(); updateNotificationsBadge(); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${currentUser.id}` },
      () => updateCallsTabBadge())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `callee_id=eq.${currentUser.id}` },
      () => updateCallsTabBadge())
    .subscribe();
}

function setupUnreadMessageRealtime() {
  if (!currentUser || !window.supabase) return;
  if (unreadChannel) { window.supabase.removeChannel(unreadChannel); unreadChannel = null; }
  unreadChannel = window.supabase
    .channel(`home-unread:${currentUser.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `receiver_id=eq.${currentUser.id}` },
      () => loadFriends())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `receiver_id=eq.${currentUser.id}` },
      () => setTimeout(() => loadFriends(), 250))
    .subscribe();
}

// ═════════════════════════════════════════════════════════════
// Navigation helpers (used by onclick in template)
// ═════════════════════════════════════════════════════════════

let routerRef = null;

window.openSearch = function () {
  const modal = document.getElementById('searchModal');
  if (modal) {
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));
    loadSearchResults();
  }
};

window.openNotifications = function () {
  const modal = document.getElementById('notificationsModal');
  if (modal) {
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));
    switchNotifTab('main');
  }
};

window.closeModal = function () {
  ['searchModal', 'notificationsModal'].forEach(id => {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('visible');
    setTimeout(() => { m.style.display = 'none'; }, 200);
  });
};

window.switchNotifTab = function (tab) {
  currentNotifTab = tab;
  const mainTab = document.getElementById('notifTabMain');
  const callsTab = document.getElementById('notifTabCalls');
  const mainContent = document.getElementById('notifMainContent');
  const callsContent = document.getElementById('notifCallsContent');
  if (tab === 'main') {
    mainTab?.classList.add('active'); callsTab?.classList.remove('active');
    mainContent?.classList.add('active'); callsContent?.classList.remove('active');
    loadNotifications();
  } else {
    callsTab?.classList.add('active'); mainTab?.classList.remove('active');
    callsContent?.classList.add('active'); mainContent?.classList.remove('active');
    loadCallHistory().then(() => updateCallsTabBadge());
  }
};

window.openChat = function (friendId, friendName) {
  sessionStorage.setItem('currentChatFriend', JSON.stringify({ id: friendId, username: friendName }));
  if (routerRef) routerRef.navigate('/chats?friendId=' + encodeURIComponent(friendId));
};

window.openUserProfile = function (userId) {
  if (!userId) return;
  if (routerRef) routerRef.navigate('/user?id=' + encodeURIComponent(userId));
};

window.sendFriendRequest = sendFriendRequest;
window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;

window.goToHome = function () { if (routerRef) routerRef.navigate('/'); };
window.viewFriendsPage = function () { if (routerRef) routerRef.navigate('/friends'); };
window.goToProfile = function () { if (routerRef) routerRef.navigate('/profile'); };
window.openSettings = function () { toast.info("Coming Soon", "Settings page is under development! Stay tuned"); };

// ═════════════════════════════════════════════════════════════
// Init
// ═════════════════════════════════════════════════════════════

export async function initDashboard({ router, params }) {
  routerRef = router;

  // Reset per-mount state
  currentNotifTab = 'main';
  locallyDismissedRequestIds.clear();
  locallyReadCallIds.clear();
  getSeenIds(SEEN_STORAGE_KEY).forEach(id => locallyDismissedRequestIds.add(String(id)));
  getSeenIds(SEEN_CALLS_KEY).forEach(id => locallyReadCallIds.add(String(id)));

  // Initialize toast
  toast = new ToastNotification();

  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) loadingIndicator.style.display = 'flex';

  // Get user from session (replaces auth.getCurrentUser())
  try {
    const session = await getSession();
    if (!session?.user) {
      window.location.replace('/#/login');
      return () => {};
    }
    currentUser = session.user;
  } catch (e) {
    window.location.replace('/#/login');
    return () => {};
  }

  try {
    if (loadingIndicator) {
      loadingIndicator.classList.add('hidden');
      setTimeout(() => { loadingIndicator.style.display = 'none'; }, 400);
    }

    await loadUserProfile();
    updateWelcomeMessage();
    await loadFriends();
    await updateNotificationsBadge();
    await updateCallsTabBadge();
    setupFriendsRealtime();
    setupUnreadMessageRealtime();

    // Refresh on tab visibility
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadFriends();
        updateNotificationsBadge();
        updateCallsTabBadge();
      }
    };
    const onPageshow = (e) => { if (e.persisted) onVisible(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageshow);

    // TODO: When /utils/pushClient.js is provided, wire:
    //   setTimeout(() => window.relaytalkPush?.init?.(), 1500);

    // Cleanup on unmount
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageshow);

      if (friendsRealtimeChannel && window.supabase) {
        window.supabase.removeChannel(friendsRealtimeChannel);
        friendsRealtimeChannel = null;
      }
      if (unreadChannel && window.supabase) {
        window.supabase.removeChannel(unreadChannel);
        unreadChannel = null;
      }

      // Clear global handlers
      ['openSearch','openNotifications','closeModal','switchNotifTab',
       'openChat','openUserProfile','sendFriendRequest','acceptFriendRequest',
       'declineFriendRequest','goToHome','viewFriendsPage','goToProfile','openSettings']
        .forEach(k => { try { delete window[k]; } catch (_) { window[k] = undefined; } });
    };
  } catch (error) {
    if (loadingIndicator) {
      loadingIndicator.classList.add('hidden');
      setTimeout(() => { loadingIndicator.style.display = 'none'; }, 400);
    }
    toast.error("Initialization Error", "Failed to load page.");
    return () => {};
  }
}
