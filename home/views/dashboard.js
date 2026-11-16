import { getSession } from '/shared/supabase.js';

let currentUser = null;
let routerRef = null;

export async function initDashboard({ router }) {
  routerRef = router;

  try {
    const session = await getSession();
    if (!session?.user) { window.location.replace('/#/login'); return; }
    currentUser = session.user;

    document.getElementById('loadingIndicator').style.display = 'none';

    const { data: profile } = await window.supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    const username = profile?.username || currentUser.email?.split('@')[0] || 'User';
    document.getElementById('welcomeTitle').textContent = `Hello, ${username}.`;

    const { data: friends } = await window.supabase.from('friends').select('friend_id').eq('user_id', currentUser.id);
    const list = document.getElementById('friendsList');
    
    if (friends && friends.length > 0) {
      const friendIds = friends.map(f => f.friend_id);
      const { data: profiles } = await window.supabase.from('profiles').select('*').in('id', friendIds);

      list.innerHTML = profiles.map(p => {
        const initial = p.username ? p.username.charAt(0).toUpperCase() : '?';
        const avatar = p.avatar_url ? `<img src="${p.avatar_url}">` : `<span>${initial}</span>`;
        const isOnline = p.status === 'online' && p.last_seen && (Date.now() - new Date(p.last_seen).getTime() < 60000);
        return `
          <div class="list-item contact-row" data-id="${p.id}" data-name="${p.username}">
            <div class="avatar">${avatar}<div class="status-dot ${isOnline ? 'online' : ''}"></div></div>
            <div class="item-content">
              <div class="item-title">${p.username}</div>
              <div class="item-subtitle">${isOnline ? 'Online' : 'Offline'}</div>
            </div>
          </div>
        `;
      }).join('');

      // 🔥 FIX: Attach Event Listeners Directly
      list.querySelectorAll('.contact-row').forEach(row => {
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
    document.getElementById('btn-view-all-friends').onclick = () => routerRef.navigate('/friends');

  } catch (err) {
    console.error(err);
    document.getElementById('loadingIndicator').style.display = 'none';
  }
}