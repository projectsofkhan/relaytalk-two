// home/views/friends.js — ported from pages/home/friends/friends.js
// Faithful port. Imports → shared/supabase. Navigation → router. Cleanup added.

import { getSession } from '/shared/supabase.js';

const ONLINE_FRESH_WINDOW_MS = 60000;
const SEEN_STORAGE_KEY = 'relaytalk_seen_notifications';
const SEEN_CALLS_KEY = 'relaytalk_seen_calls';

// ═════════════════════════════════════════════════════════════
// Module-scoped state
// ═════════════════════════════════════════════════════════════

let currentUser = null;
let allFriends = [];
let filteredFriends = [];
let currentNotifTab = 'main';
let friendRealtimeChannel = null;
let statusInterval = null;
let routerRef = null;

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
    console.warn('[friends] persistSeenCalls failed:', e);
  }
}

async function updateUserStatus(userId, status) {
  if (!window.supabase || !userId) return;
  try {
    await window.supabase.from('profiles').update({
      status: status,
      last_seen: new Date().toISOString()
    }).eq('id', userId);
  } catch (e) {
    console.warn('[friends] updateUserStatus failed:', e);
  }
}

function formatLastSeen(timestamp) {
  const now = new Date();
  const time = new Date(timestamp);
  const diff = Math.floor((now - time) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  if (diff < 10080) return `${Math.floor(diff / 1440)}d ago`;
  return time.toLocaleDateString();
}

function timeAgoShort(dateStr) {
  const now = new Date();
  const past = new Date(dateStr);
  const diffMins = Math.floor((now - past) / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return past.toLocaleDateString();
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

function showToast(type, message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const iconClass = type === 'success' ? 'check-circle'
    : type === 'error' ? 'exclamation-circle'
    : 'info-circle';
  toast.innerHTML = `
    <i class="fas fa-${iconClass}"></i>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ═════════════════════════════════════════════════════════════
// Data loaders
// ═════════════════════════════════════════════════════════════

async function loadFriends() {
  try {
    if (!currentUser || !window.supabase) return;

    const { data: friendsData } = await window.supabase
      .from('friends')
      .select('friend_id')
      .eq('user_id', currentUser.id);

    if (!friendsData || friendsData.length === 0) {
      allFriends = [];
      filteredFriends = [];
      renderFriendsList();
      return;
    }

    const friendIds = friendsData.map(f => f.friend_id);
    const { data: profiles } = await window.supabase
      .from('profiles')
      .select('id, username, avatar_url, status, last_seen')
      .in('id', friendIds)
      .order('username');

    const unreadMap = await fetchUnreadCounts(friendIds);

    allFriends = (profiles || []).map(p => ({ ...p, unreadCount: unreadMap[p.id] || 0 }));
    filteredFriends = [...allFriends];
    renderFriendsList();
  } catch (err) {
    showEmptyState();
  }
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

function renderFriendsList() {
  const container = document.getElementById('friendsList');
  if (!container) return;

  if (!filteredFriends || filteredFriends.length === 0) {
    showEmptyState();
    return;
  }

  let html = '';
  filteredFriends.forEach(friend => {
    const initial = friend.username ? friend.username.charAt(0).toUpperCase() : '?';
    const online = isUserOnline(friend);
    const lastSeen = friend.last_seen ? formatLastSeen(friend.last_seen) : 'Never';
    const avatarSrc = friend.avatar_url || '';
    const unread = friend.unreadCount || 0;
    const badgeHTML = unread > 0
      ? `<span class="friend-unread-badge">${unread > 99 ? '99+' : unread}</span>`
      : '';

    html += `
      <div class="friend-item" data-friend-id="${friend.id}">
        <div class="friend-avatar" onclick="event.stopPropagation(); openProfile('${friend.id}')">
          ${avatarSrc
            ? `<img src="${avatarSrc}" alt="${escapeHtml(friend.username || '')}" loading="lazy">`
            : `<span>${escapeHtml(initial)}</span>`
          }
          <span class="status-indicator-clean ${online ? 'online' : 'offline'}"></span>
          ${badgeHTML}
        </div>
        <div class="friend-info-clean" onclick="openProfile('${friend.id}')">
          <div class="friend-name-status">
            <div class="friend-name-clean">${escapeHtml(friend.username || 'User')}</div>
            <div class="friend-status-clean ${online ? 'online' : ''}">
              ${online ? 'Online' : `Last seen ${lastSeen}`}
            </div>
          </div>
        </div>
        <div class="friend-actions">
          <button class="action-btn message-btn"
                  onclick="event.stopPropagation(); openChat('${friend.id}', '${escapeAttr(friend.username || 'Friend')}')"
                  aria-label="Message"
                  title="Message">
            <i class="fas fa-comment-dots"></i>
          </button>
          <button class="action-btn call-btn"
                  onclick="event.stopPropagation(); startCall('${friend.id}', '${escapeAttr(friend.username || 'Friend')}')"
                  aria-label="Call"
                  title="Call">
            <i class="fas fa-phone"></i>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function showEmptyState() {
  const container = document.getElementById('friendsList');
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon"><i class="fas fa-user-friends"></i></div>
      <h3 class="empty-title">No friends yet</h3>
      <p class="empty-desc">Add friends from the home page to start chatting and calling</p>
    </div>
  `;
}

function showError(message) {
  const container = document.getElementById('friendsList');
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon" style="background: var(--danger-soft); color: var(--danger);">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <h3 class="empty-title">Something went wrong</h3>
      <p class="empty-desc">${escapeHtml(message)}</p>
    </div>
  `;
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
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', senderIds);

    const profileMap = {};
    (profiles || []).forEach(p => profileMap[p.id] = p);

    let html = '';
    visible.forEach(notification => {
      const timeAgo = timeAgoShort(notification.created_at);
      const sender = profileMap[notification.sender_id] || { username: 'Unknown' };
      const senderName = sender.username;
      const initial = senderName.charAt(0).toUpperCase();
      const avatarSrc = sender.avatar_url || '';

      html += `
        <div class="notification-item" data-request-id="${notification.id}">
          <div class="notification-avatar">
            ${avatarSrc
              ? `<img src="${avatarSrc}" alt="${escapeHtml(senderName)}">`
              : `<span>${escapeHtml(initial)}</span>`
            }
          </div>
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
  } catch (err) {
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
    calls.forEach(call => {
      if (call.caller_id !== currentUser.id) userIds.add(call.caller_id);
      if (call.receiver_id !== currentUser.id) userIds.add(call.receiver_id);
      if (call.callee_id && call.callee_id !== currentUser.id) userIds.add(call.callee_id);
    });

    let profileMap = {};
    if (userIds.size > 0) {
      const { data: profiles } = await window.supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', [...userIds]);
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
      if (['missed', 'cancelled', 'rejected'].includes(call.status)) {
        if (!isOutgoing || call.status === 'rejected') {
          metaIcon = 'fa-phone-slash'; metaClass = 'meta-missed'; metaText = 'Missed'; isMissed = true;
        }
      } else if (call.status === 'ringing' && !isOutgoing) {
        metaIcon = 'fa-phone-slash'; metaClass = 'meta-missed'; metaText = 'Missed'; isMissed = true;
      }

      const time = new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const initial = otherUser.username ? otherUser.username.charAt(0).toUpperCase() : '?';
      const avatarSrc = otherUser.avatar_url || '';

      const callIdStr = String(call.id);
      const isUnseen = !isOutgoing && isMissed && !locallyReadCallIds.has(callIdStr) && call.seen !== true;
      let tagHTML = '';
      if (isUnseen) tagHTML = `<span class="call-tag tag-new">New</span>`;
      else if (isMissed) tagHTML = `<span class="call-tag tag-missed">Missed</span>`;

      html += `
        <div class="call-history-item ${isUnseen ? 'has-tag' : ''}">
          <div class="call-history-avatar">
            ${avatarSrc
              ? `<img src="${avatarSrc}" alt="${escapeHtml(otherUser.username || '')}">`
              : `<span>${escapeHtml(initial)}</span>`
            }
          </div>
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
    addSeenIds(SEEN_CALLS_KEY, calls.map(c => String(c.id)));
    if (unseenCallIds.length > 0) await persistSeenCalls(unseenCallIds);

    await updateBadges();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Could not load call history</p></div>`;
  }
}

async function updateBadges() {
  try {
    if (!currentUser || !window.supabase) return;

    const { data: friendReqs } = await window.supabase
      .from('friend_requests')
      .select('id')
      .eq('receiver_id', currentUser.id)
      .eq('status', 'pending');

    const pendingCount = (friendReqs || [])
      .filter(r => !locallyDismissedRequestIds.has(String(r.id))).length;

    const { data: calls } = await window.supabase
      .from('calls')
      .select('id, seen, status')
      .or(`receiver_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`)
      .in('status', ['missed', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(50);

    const unseenCount = (calls || []).filter(c => {
      if (c.seen === true) return false;
      return !locallyReadCallIds.has(String(c.id));
    }).length;

    const notifBadge = document.getElementById('notificationBadge');
    const total = pendingCount + unseenCount;
    if (notifBadge) {
      if (total > 0) {
        notifBadge.textContent = total > 9 ? '9+' : total;
        notifBadge.style.display = 'flex';
      } else {
        notifBadge.style.display = 'none';
      }
    }

    const mainTabBadge = document.getElementById('mainTabBadge');
    if (mainTabBadge) {
      if (pendingCount > 0) {
        mainTabBadge.textContent = pendingCount > 9 ? '9+' : pendingCount;
        mainTabBadge.style.display = 'inline-flex';
      } else {
        mainTabBadge.style.display = 'none';
      }
    }

    const callsTabBadge = document.getElementById('callsTabBadge');
    if (callsTabBadge) {
      if (unseenCount > 0) {
        callsTabBadge.textContent = unseenCount > 9 ? '9+' : unseenCount;
        callsTabBadge.style.display = 'inline-flex';
      } else {
        callsTabBadge.style.display = 'none';
      }
    }
  } catch (e) {}
}

// ═════════════════════════════════════════════════════════════
// Actions
// ═════════════════════════════════════════════════════════════

async function acceptFriendRequest(requestId, senderId, senderName, button) {
  if (button) { button.innerHTML = '...'; button.disabled = true; }
  locallyDismissedRequestIds.add(String(requestId));
  addSeenIds(SEEN_STORAGE_KEY, [String(requestId)]);

  const itemEl = document.querySelector(`.notification-item[data-request-id="${requestId}"]`);
  if (itemEl) { itemEl.classList.add('removing'); setTimeout(() => itemEl.remove(), 280); }

  try {
    await window.supabase
      .from('friend_requests')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', requestId);

    await window.supabase.from('friends').insert({
      user_id: currentUser.id, friend_id: senderId, created_at: new Date().toISOString()
    });
    await window.supabase.from('friends').insert({
      user_id: senderId, friend_id: currentUser.id, created_at: new Date().toISOString()
    });

    showToast('success', `You are now friends with ${senderName}!`);

    setTimeout(() => {
      loadFriends();
      loadNotifications();
      updateBadges();
    }, 320);
  } catch (err) {
    showToast('error', 'Could not accept request');
    locallyDismissedRequestIds.delete(String(requestId));
    loadNotifications();
  }
}

async function declineFriendRequest(requestId, button) {
  if (button) { button.innerHTML = '...'; button.disabled = true; }
  locallyDismissedRequestIds.add(String(requestId));
  addSeenIds(SEEN_STORAGE_KEY, [String(requestId)]);

  const itemEl = document.querySelector(`.notification-item[data-request-id="${requestId}"]`);
  if (itemEl) { itemEl.classList.add('removing'); setTimeout(() => itemEl.remove(), 280); }

  try {
    await window.supabase
      .from('friend_requests')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', requestId);

    showToast('info', 'Request declined');
    setTimeout(() => { loadNotifications(); updateBadges(); }, 320);
  } catch (err) {
    locallyDismissedRequestIds.delete(String(requestId));
    loadNotifications();
  }
}

async function sendFriendRequest(userId, username, btn) {
  try {
    btn.disabled = true;
    btn.textContent = 'Sending...';

    const { error } = await window.supabase
      .from('friend_requests')
      .insert({
        sender_id: currentUser.id,
        receiver_id: userId,
        status: 'pending',
        created_at: new Date().toISOString()
      });

    if (error) throw error;

    btn.textContent = 'Sent';
    btn.classList.add('added');
    showToast('success', `Friend request sent to ${username}`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Add';
    showToast('error', 'Failed to send request');
  }
}

async function searchUsers() {
  if (!window.supabase || !currentUser) return;
  const input = document.getElementById('userSearchInput');
  const container = document.getElementById('searchResults');
  if (!input || !container) return;

  const term = input.value.toLowerCase().trim();
  if (!term) {
    container.innerHTML = `<div class="empty-search"><i class="fas fa-search"></i><p>Search for users</p></div>`;
    return;
  }

  try {
    const { data: friends } = await window.supabase
      .from('friends')
      .select('friend_id')
      .eq('user_id', currentUser.id);
    const friendIds = friends?.map(f => f.friend_id) || [];

    const { data: pending } = await window.supabase
      .from('friend_requests')
      .select('receiver_id')
      .eq('sender_id', currentUser.id)
      .eq('status', 'pending');
    const pendingIds = pending?.map(r => r.receiver_id) || [];

    const { data: users, error } = await window.supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .neq('id', currentUser.id)
      .ilike('username', `%${term}%`)
      .limit(20);

    if (error || !users || users.length === 0) {
      container.innerHTML = `<div class="empty-search"><i class="fas fa-user-slash"></i><p>No users found</p></div>`;
      return;
    }

    let html = '';
    users.forEach(user => {
      const isFriend = friendIds.includes(user.id);
      const isPending = pendingIds.includes(user.id);
      const initial = user.username?.charAt(0).toUpperCase() || '?';
      const avatarSrc = user.avatar_url || '';

      html += `
        <div class="search-result-item">
          <div class="search-result-avatar">
            ${avatarSrc
              ? `<img src="${avatarSrc}" alt="${escapeHtml(user.username || '')}">`
              : `<span>${escapeHtml(initial)}</span>`
            }
          </div>
          <div class="search-result-info">
            <div class="search-result-name">${escapeHtml(user.username || '')}</div>
            <div class="search-result-username">@${escapeHtml(user.username || '')}</div>
          </div>
          ${isFriend
            ? '<button class="add-friend-btn added" disabled>Friend</button>'
            : isPending
            ? '<button class="add-friend-btn added" disabled>Sent</button>'
            : `<button class="add-friend-btn" onclick="sendFriendRequest('${user.id}', '${escapeAttr(user.username || 'User')}', this)">Add</button>`
          }
        </div>
      `;
    });
    container.innerHTML = html;
  } catch (err) {}
}

// ═════════════════════════════════════════════════════════════
// Realtime
// ═════════════════════════════════════════════════════════════

function setupFriendRealtimeListener() {
  if (!currentUser || !window.supabase) return;
  if (friendRealtimeChannel) {
    window.supabase.removeChannel(friendRealtimeChannel);
    friendRealtimeChannel = null;
  }

  friendRealtimeChannel = window.supabase
    .channel(`friends-realtime:${currentUser.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friends', filter: `user_id=eq.${currentUser.id}` },
      () => loadFriends())
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'friends', filter: `user_id=eq.${currentUser.id}` },
      () => loadFriends())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friend_requests', filter: `receiver_id=eq.${currentUser.id}` },
      () => updateBadges())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friend_requests', filter: `receiver_id=eq.${currentUser.id}` },
      () => { if (currentNotifTab === 'main') loadNotifications(); updateBadges(); })
    .subscribe();
}

function startStatusUpdates() {
  if (currentUser?.id) updateUserStatus(currentUser.id, 'online');
  statusInterval = setInterval(() => {
    if (currentUser?.id) updateUserStatus(currentUser.id, 'online');
  }, 30000);
}

// ═════════════════════════════════════════════════════════════
// Window handlers
// ═════════════════════════════════════════════════════════════

window.searchFriends = function () {
  const input = document.getElementById('searchInput');
  if (!input) return;
  const term = input.value.toLowerCase().trim();
  const clearBtn = document.getElementById('clearSearch');
  if (clearBtn) clearBtn.style.display = term ? 'flex' : 'none';

  filteredFriends = term
    ? allFriends.filter(f => f.username?.toLowerCase().includes(term))
    : [...allFriends];
  renderFriendsList();
};

window.clearSearch = function () {
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
  const clearBtn = document.getElementById('clearSearch');
  if (clearBtn) clearBtn.style.display = 'none';
  filteredFriends = [...allFriends];
  renderFriendsList();
};

window.openChat = function (friendId, friendName) {
  sessionStorage.setItem('currentChatFriend', JSON.stringify({ id: friendId, username: friendName }));
  if (routerRef) routerRef.navigate('/chats?friendId=' + encodeURIComponent(friendId));
};

window.openProfile = function (userId) {
  if (!userId) return;
  if (routerRef) routerRef.navigate('/user?id=' + encodeURIComponent(userId));
};

window.goToHome = function () { if (routerRef) routerRef.navigate('/'); };
window.goToProfile = function () { if (routerRef) routerRef.navigate('/profile'); };

window.startCall = function (friendId, friendName) {
  if (!friendId) return;
  sessionStorage.setItem('currentCallTarget', JSON.stringify({
    id: friendId,
    username: friendName || 'Friend'
  }));
  if (routerRef) routerRef.navigate('/chats?friendId=' + encodeURIComponent(friendId) + '&call=1');
};

window.openNotifications = function (event) {
  if (event) event.preventDefault();
  const modal = document.getElementById('notificationsModal');
  if (modal) {
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));
    window.switchNotifTab('main');
    updateBadges();
  }
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
    loadCallHistory();
  }
};

window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;
window.sendFriendRequest = sendFriendRequest;
window.searchUsers = searchUsers;

window.openSearch = () => {
  const modal = document.getElementById('searchModal');
  if (modal) {
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));
    setTimeout(() => document.getElementById('userSearchInput')?.focus(), 100);
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

window.logout = async () => {
  if (window.supabase) await window.supabase.auth.signOut();
  localStorage.clear();
  sessionStorage.clear();
  document.cookie.split(";").forEach(function (c) {
    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
  });
  window.location.replace('/#/login');
};

// ═════════════════════════════════════════════════════════════
// Init + cleanup
// ═════════════════════════════════════════════════════════════

export async function initFriends({ router }) {
  routerRef = router;

  // Reset state
  currentNotifTab = 'main';
  locallyDismissedRequestIds.clear();
  locallyReadCallIds.clear();
  getSeenIds(SEEN_STORAGE_KEY).forEach(id => locallyDismissedRequestIds.add(String(id)));
  getSeenIds(SEEN_CALLS_KEY).forEach(id => locallyReadCallIds.add(String(id)));

  const loader = document.getElementById('loadingIndicator');
  const forceHideTimeout = setTimeout(() => {
    if (loader && !loader.classList.contains('hidden')) {
      loader.classList.add('hidden');
      setTimeout(() => { loader.style.display = 'none'; }, 400);
    }
  }, 4000);

  const hideLoader = () => {
    clearTimeout(forceHideTimeout);
    if (loader && !loader.classList.contains('hidden')) {
      loader.classList.add('hidden');
      setTimeout(() => { loader.style.display = 'none'; }, 400);
    }
  };

  try {
    if (!window.supabase) throw new Error('Supabase not initialized');

    const session = await getSession();
    if (!session?.user) {
      window.location.replace('/#/login');
      return () => {};
    }
    currentUser = session.user;

    await loadFriends();
    await updateBadges();

    setupFriendRealtimeListener();
    startStatusUpdates();

    // Visibility refresh
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadFriends();
        updateBadges();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    // Unload — set offline
    const onUnload = () => {
      if (currentUser?.id) updateUserStatus(currentUser.id, 'offline');
    };
    window.addEventListener('beforeunload', onUnload);

    hideLoader();

    // Return cleanup
    return () => {
      clearTimeout(forceHideTimeout);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('beforeunload', onUnload);

      if (friendRealtimeChannel && window.supabase) {
        window.supabase.removeChannel(friendRealtimeChannel);
        friendRealtimeChannel = null;
      }
      if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
      }

      ['searchFriends','clearSearch','openChat','openProfile','goToHome','goToProfile',
       'startCall','openNotifications','switchNotifTab','acceptFriendRequest',
       'declineFriendRequest','sendFriendRequest','searchUsers','openSearch',
       'closeModal','logout'
      ].forEach(k => { try { delete window[k]; } catch (_) { window[k] = undefined; } });
    };
  } catch (err) {
    showError('Failed to load friends: ' + err.message);
    hideLoader();
    return () => {};
  }
}