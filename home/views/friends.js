import { getSession } from '/shared/supabase.js';

let routerRef = null;
let abortController = null;

export async function initFriends({ router }) {
  routerRef = router;
  abortController = new AbortController();

  try {
    const session = await getSession();
    if (!session?.user) return () => {};
    const currentUser = session.user;

    document.getElementById('loadingIndicator').style.display = 'none';

    const { data: friends } = await window.supabase.from('friends').select('friend_id').eq('user_id', currentUser.id);
    const list = document.getElementById('friendsList');

    if (friends && friends.length > 0) {
      const friendIds = friends.map(f => f.friend_id);
      const { data: profiles } = await window.supabase.from('profiles').select('*').in('id', friendIds);

      list.innerHTML = profiles.map(p => {
        const initial = p.username ? p.username.charAt(0).toUpperCase() : '?';
        const avatar = p.avatar_url ? `<img src="${p.avatar_url}">` : `<span>${initial}</span>`;
        return `
          <div class="list-item friend-row" data-id="${p.id}" data-name="${p.username}">
            <div class="avatar">${avatar}</div>
            <div class="item-content">
              <div class="item-title">${p.username}</div>
            </div>
            <div class="item-action"><i class="fas fa-comment"></i></div>
          </div>
        `;
      }).join('');

      // 🔥 FIX: Add event listener instead of inline onclick
      list.querySelectorAll('.friend-row').forEach(row => {
        row.addEventListener('click', () => {
          const id = row.dataset.id;
          const name = row.dataset.name;
          sessionStorage.setItem('currentChatFriend', JSON.stringify({ id, username: name }));
          routerRef.navigate('/chats?friendId=' + encodeURIComponent(id));
        });
      });
    } else {
      list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-secondary);">No friends yet</div>`;
    }

    return () => { try { abortController.abort(); } catch(e){} };
  } catch (err) {
    return () => {};
  }
}