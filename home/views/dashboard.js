import { getSession } from '/shared/supabase.js';

const ONLINE_FRESH_WINDOW_MS = 60000;
let currentUser = null;
let currentProfile = null;
let routerRef = null;
let abortController = null;

function isUserOnline(profile) {
  if (!profile || profile.status !== 'online' || !profile.last_seen) return false;
  try { return Date.now() - new Date(profile.last_seen).getTime() < ONLINE_FRESH_WINDOW_MS; } catch (e) { return false; }
}

function formatLastSeen(ts) {
  if (!ts) return 'Offline';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export async function initDashboard({ router }) {
  routerRef = router;
  abortController = new AbortController();

  try {
    const session = await getSession();
    if (!session?.user) { window.location.replace('/#/login'); return () => {}; }
    currentUser = session.user;

    document.getElementById('loadingIndicator').style.display = 'none';

    // Profile
    const { data: profile } = await window.supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    currentProfile = profile || { username: currentUser.email?.split('@')[0] || 'User' };
    document.getElementById('welcomeTitle').textContent = `Hello, ${currentProfile.username}`;

    // Friends
    const { data: friends } = await window.supabase.from('friends').select('friend_id').eq('user_id', currentUser.id);
    const list = document.getElementById('friendsList');
    
    if (friends && friends.length > 0) {
      const friendIds = friends.map(f => f.friend_id);
      const { data: profiles } = await window.supabase.from('profiles').select('*').in('id', friendIds);

      list.innerHTML = profiles.map(p => {
        const online = isUserOnline(p);
        const initial = p.username ? p.username.charAt(0).toUpperCase() : '?';
        const avatar = p.avatar_url ? `<img src="${p.avatar_url}">` : `<span>${initial}</span>`;
        const status = online ? 'Online' : formatLastSeen(p.last_seen);
        return `
          <div class="list-item friend-row" data-id="${p.id}" data-name="${p.username}">
            <div class="avatar">
              ${avatar}
              <div class="status-dot ${online ? 'online' : ''}"></div>
            </div>
            <div class="item-content">
              <div class="item-title">${p.username}</div>
              <div class="item-subtitle">${status}</div>
            </div>
          </div>
        `;
      }).join('');

      // FIX CLICK BUG
      list.querySelectorAll('.friend-row').forEach(row => {
        row.addEventListener('click', () => {
          sessionStorage.setItem('currentChatFriend', JSON.stringify({ id: row.dataset.id, username: row.dataset.name }));
          routerRef.navigate('/chats?friendId=' + encodeURIComponent(row.dataset.id));
        });
      });
    } else {
      list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-secondary);">No friends yet</div>`;
    }

    // Modals
    const searchModal = document.getElementById('searchModal');
    const notifModal = document.getElementById('notificationsModal');

    document.getElementById('btn-search').onclick = () => { searchModal.style.display = 'flex'; setTimeout(() => searchModal.classList.add('visible'), 10); };
    document.getElementById('close-search').onclick = () => { searchModal.classList.remove('visible'); setTimeout(() => searchModal.style.display = 'none', 200); };
    document.getElementById('btn-find-friends').onclick = () => document.getElementById('btn-search').click();
    
    document.getElementById('btn-notifs').onclick = () => { notifModal.style.display = 'flex'; setTimeout(() => notifModal.classList.add('visible'), 10); };
    document.getElementById('close-notifs').onclick = () => { notifModal.classList.remove('visible'); setTimeout(() => notifModal.style.display = 'none', 200); };

    return () => { try { abortController.abort(); } catch(e){} };
  } catch (err) {
    console.error(err);
    document.getElementById('loadingIndicator').style.display = 'none';
    return () => {};
  }
}