// home/views/view-friend.js — friend profile viewer.
// Ported from pages/home/profile/view.js. SPA routing.

import { getSession } from '/shared/supabase.js';

const ONLINE_FRESH_WINDOW_MS = 60000;

let currentUser = null;
let viewedUser = null;
let friendSinceDate = null;
let isFriend = false;
let statusChannel = null;
let statusTicker = null;
let routerRef = null;
let abortController = null;

function isUserOnline(profile) {
  if (!profile) return false;
  if (profile.status !== 'online') return false;
  if (!profile.last_seen) return false;
  try { return Date.now() - new Date(profile.last_seen).getTime() < ONLINE_FRESH_WINDOW_MS; }
  catch (e) { return false; }
}

async function checkFriendship() {
  isFriend = false;
  try {
    const { data } = await window.supabase.from('friends').select('friend_id')
      .eq('user_id', currentUser.id).eq('friend_id', viewedUser.id).maybeSingle();
    isFriend = !!data;
  } catch (e) { isFriend = false; }
}

async function loadFriendshipDate() {
  friendSinceDate = null;
  if (!isFriend) return;
  try {
    const { data } = await window.supabase.from('friends').select('created_at')
      .eq('user_id', currentUser.id).eq('friend_id', viewedUser.id)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (data?.created_at) friendSinceDate = data.created_at;
  } catch (e) {}
}

function renderPage() {
  const main = document.getElementById('viewMain');
  if (main) main.style.display = 'flex';

  const initial = viewedUser.username ? viewedUser.username.charAt(0).toUpperCase() : '?';
  const avatarImg = document.getElementById('viewAvatarImg');
  const avatarInitial = document.getElementById('viewAvatarInitial');

  if (viewedUser.avatar_url) {
    avatarImg.onload = () => { avatarImg.style.display = 'block'; avatarInitial.style.display = 'none'; };
    avatarImg.onerror = () => { avatarImg.style.display = 'none'; avatarInitial.style.display = 'flex'; };
    avatarImg.src = viewedUser.avatar_url;
    avatarImg.alt = viewedUser.username;
  } else {
    avatarInitial.textContent = initial;
  }

  document.getElementById('viewName').textContent = viewedUser.full_name || viewedUser.username;
  document.getElementById('viewUsername').textContent = `@${viewedUser.username}`;
  updateStatusUI(viewedUser);

  const bioBox = document.getElementById('viewBioBox');
  if (viewedUser.bio && viewedUser.bio.trim()) {
    bioBox.textContent = viewedUser.bio.trim();
    bioBox.classList.remove('empty');
  } else {
    bioBox.innerHTML = '<span class="view-bio-empty">No biography yet.</span>';
    bioBox.classList.add('empty');
  }

  renderActionsAndFooter();
}

function renderActionsAndFooter() {
  const actionsEl = document.querySelector('.view-actions');
  const sinceEl = document.getElementById('viewFriendsSince');

  if (isFriend) {
    if (actionsEl) actionsEl.style.display = '';
    const existing = document.getElementById('viewNotFriendsNotice');
    if (existing) existing.remove();
    if (sinceEl) {
      if (friendSinceDate) {
        const dt = new Date(friendSinceDate);
        const formatted = dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        sinceEl.textContent = `You both have been friends since ${formatted}`;
      } else sinceEl.textContent = '';
      sinceEl.style.display = '';
    }
  } else {
    if (actionsEl) actionsEl.style.display = 'none';
    if (sinceEl) { sinceEl.textContent = ''; sinceEl.style.display = 'none'; }
    const existing = document.getElementById('viewNotFriendsNotice');
    if (existing) existing.remove();

    const notice = document.createElement('div');
    notice.id = 'viewNotFriendsNotice';
    notice.className = 'view-not-friends';
    notice.innerHTML = `
      <div class="view-not-friends-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      </div>
      <div class="view-not-friends-text">
        <div class="view-not-friends-title">You're not friends yet</div>
        <div class="view-not-friends-desc">Send a friend request from the search page to start chatting and calling.</div>
      </div>`;

    const bioSection = document.querySelector('.view-bio-section');
    if (bioSection && bioSection.parentNode) bioSection.parentNode.insertBefore(notice, bioSection);
    else { const main = document.getElementById('viewMain'); if (main) main.appendChild(notice); }
  }
}

function updateStatusUI(profile) {
  const dot = document.getElementById('viewStatusDot');
  const text = document.getElementById('viewStatusText');
  if (!dot || !text) return;
  const online = isUserOnline(profile);
  if (online) {
    dot.classList.add('online');
    text.textContent = 'Online';
    text.classList.add('online');
  } else {
    dot.classList.remove('online');
    text.textContent = profile.last_seen ? `Last seen ${formatLastSeenShort(profile.last_seen)}` : 'Offline';
    text.classList.remove('online');
  }
}

function formatLastSeenShort(ts) {
  try {
    const now = new Date(), t = new Date(ts);
    const sec = Math.floor((now - t) / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (sec < 60) return 'now';
    if (min < 60) return `${min}m ago`;
    if (hr < 24) return `${hr}h ago`;
    if (day === 1) return 'yesterday';
    if (day < 7) return `${day}d ago`;
    if (day < 30) return `${Math.floor(day / 7)}w ago`;
    return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return 'a while ago'; }
}

function subscribeToStatus() {
  if (statusChannel) { window.supabase.removeChannel(statusChannel); statusChannel = null; }
  statusChannel = window.supabase
    .channel(`view-status:${viewedUser.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${viewedUser.id}` }, (payload) => {
      if (!payload.new) return;
      viewedUser.status = payload.new.status;
      viewedUser.last_seen = payload.new.last_seen;
      viewedUser.avatar_url = payload.new.avatar_url || viewedUser.avatar_url;
      viewedUser.bio = payload.new.bio;

      updateStatusUI(viewedUser);
      if (payload.new.avatar_url) {
        const img = document.getElementById('viewAvatarImg');
        if (img && img.src !== payload.new.avatar_url) {
          img.src = payload.new.avatar_url;
          img.style.display = 'block';
          const initial = document.getElementById('viewAvatarInitial');
          if (initial) initial.style.display = 'none';
        }
      }
      const bioBox = document.getElementById('viewBioBox');
      if (bioBox) {
        if (payload.new.bio && payload.new.bio.trim()) { bioBox.textContent = payload.new.bio.trim(); bioBox.classList.remove('empty'); }
        else { bioBox.innerHTML = '<span class="view-bio-empty">No biography yet.</span>'; bioBox.classList.add('empty'); }
      }
    })
    .subscribe();
}

function startStatusTicker() {
  if (statusTicker) clearInterval(statusTicker);
  statusTicker = setInterval(() => { if (viewedUser) updateStatusUI(viewedUser); }, 20000);
}

function showToast(message, icon = '✅') {
  const toast = document.getElementById('viewToast');
  if (!toast) return;
  document.getElementById('viewToastText').textContent = message;
  document.getElementById('viewToastIcon').textContent = icon;
  toast.style.display = 'flex';
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => { toast.style.display = 'none'; }, 200);
  }, 2000);
}

export async function initViewFriend({ router, params }) {
  routerRef = router;
  abortController = new AbortController();
  const sig = abortController.signal;

  // Reset
  currentUser = null;
  viewedUser = null;
  friendSinceDate = null;
  isFriend = false;

  const GLOBALS = {
    closeView: () => {
      if (window.history.length > 1) window.history.back();
      else if (routerRef) routerRef.navigate('/friends');
    },
    openChat: () => {
      if (!viewedUser) return;
      if (!isFriend) { showToast('You are not friends yet', '⚠️'); return; }
      if (routerRef) routerRef.navigate('/chats?friendId=' + encodeURIComponent(viewedUser.id));
    },
    startCallFromView: () => {
      if (!viewedUser) return;
      if (!isFriend) { showToast('You are not friends yet', '⚠️'); return; }
      if (typeof window.startCall !== 'function') { showToast('Calling not ready yet', '⚠️'); return; }
      window.startCall(viewedUser.id, viewedUser.username || 'Friend');
    }
  };
  Object.keys(GLOBALS).forEach(k => { window[k] = GLOBALS[k]; });

  try {
    const session = await getSession();
    if (!session?.user) { window.location.replace('/#/login'); return () => {}; }
    currentUser = session.user;

    const userId = params?.get('id') || params?.get('userId');
    if (!userId) { showFallback(); return () => cleanupView(abortController, GLOBALS); }
    if (userId === currentUser.id) {
      if (routerRef) routerRef.navigate('/profile');
      return () => cleanupView(abortController, GLOBALS);
    }

    const { data: profile } = await window.supabase.from('profiles')
      .select('id, username, full_name, avatar_url, status, last_seen, bio')
      .eq('id', userId).maybeSingle();
    if (!profile) { showFallback(); return () => cleanupView(abortController, GLOBALS); }

    viewedUser = profile;
    await checkFriendship();
    await loadFriendshipDate();
    renderPage();
    subscribeToStatus();
    startStatusTicker();

    return () => cleanupView(abortController, GLOBALS);
  } catch (err) {
    console.error('[view-friend] init error:', err);
    showFallback();
    return () => cleanupView(abortController, GLOBALS);
  }
}

function cleanupView(ac, globals) {
  try { ac.abort(); } catch (e) {}
  if (statusChannel && window.supabase) { try { window.supabase.removeChannel(statusChannel); } catch (e) {} statusChannel = null; }
  if (statusTicker) { clearInterval(statusTicker); statusTicker = null; }
  Object.keys(globals).forEach(k => { try { delete window[k]; } catch (_) { window[k] = undefined; } });
  currentUser = null; viewedUser = null; friendSinceDate = null; isFriend = false;
  routerRef = null; abortController = null;
}

function showFallback() {
  const fallback = document.getElementById('fallbackScreen');
  if (fallback) fallback.style.display = 'flex';
}